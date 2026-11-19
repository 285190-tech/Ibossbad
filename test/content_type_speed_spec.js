"use strict";
var tap = require("tap");
var contentType = require("content-type");
var originalParse = contentType.parse;
var parseCount = 0;
contentType.parse = function () {
  parseCount++;
  return originalParse.apply(this, arguments);
};
var types = require("../lib/content-types");
tap.teardown(function () {
  contentType.parse = originalParse;
});

tap.test(
  "Stream proxy reuses bounded Content-Type parses without stale headers",
  function (t) {
    var data = { headers: { "content-type": "text/html; charset=iso-8859-1" } };
    t.equal(types.getType(data), "text/html");
    t.equal(types.getCharset(data), "iso-8859-1");
    types.setHeader(data);
    t.equal(parseCount, 1, "type and charset share a parsed value");
    t.equal(data.headers["content-type"], "text/html; charset=UTF-8");
    t.equal(
      types.getCharset(data),
      "UTF-8",
      "changed header is parsed separately"
    );
    t.equal(parseCount, 2);
    data.headers["content-type"] = "invalid invalid";
    t.equal(types.getType(data), "");
    t.equal(types.getType(data), "", "invalid values retain fallback behavior");
    t.equal(parseCount, 3, "invalid values are cached too");
    data.headers["content-type"] = "text/html; x=" + "x".repeat(1100);
    types.getType(data);
    types.getType(data);
    t.equal(parseCount, 5, "oversized header keys are not retained");
    for (var i = 0; i < 129; i++) {
      data.headers["content-type"] = "text/x-cache-" + i;
      types.getType(data);
    }
    data.headers["content-type"] = "text/html; charset=iso-8859-1";
    var before = parseCount;
    types.getType(data);
    t.equal(
      parseCount,
      before + 1,
      "old entries are evicted at the size limit"
    );
    t.end();
  }
);
