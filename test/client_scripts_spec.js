"use strict";

var test = require("tap").test;
var concat = require("concat-stream");
var PassThrough = require("stream").PassThrough;
var createClientScripts = require("../lib/client-scripts.js");

test("client script middleware tolerates missing config and defaults the prefix", function (t) {
  var clientScripts = createClientScripts();
  var source = new PassThrough();
  var data = {
    contentType: "text/html",
    url: "https://captcha.example/challenge",
    stream: source,
  };

  clientScripts.injector(data);
  data.stream.pipe(
    concat(function (body) {
      var html = body.toString();
      t.match(
        html,
        /src="\/proxy\/client\/unblocker-client\.js\?v=2"/,
        "the default client script URL uses the standard proxy prefix"
      );
      t.match(
        html,
        /unblockerInit\(\{[^}]*"prefix":"\/proxy\/"/,
        "the injected runtime receives a non-empty prefix"
      );
      t.end();
    })
  );
  source.end("<html><head></head><body>CAPTCHA</body></html>");
});
