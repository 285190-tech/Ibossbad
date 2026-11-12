"use strict";

var debug = require("debug")("unblocker:csp");

var BLOCKED_HEADERS = [
  "content-security-policy",
  "content-security-policy-report-only",
  "x-webkit-csp",
  "x-content-security-policy",
  "x-frame-options",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
];

module.exports = function (/*config*/) {
  function csp(data) {
    BLOCKED_HEADERS.forEach(function (header) {
      if (data.headers[header]) {
        debug("deleting %s header", header);
        delete data.headers[header];
      }
    });

    // Ensure restrictive Referrer-Policy headers don't suppress same-origin Referer
    // headers needed for root-relative asset recovery.
    if (data.headers["referrer-policy"]) {
      debug("replacing restrictive referrer-policy header");
      delete data.headers["referrer-policy"];
    }
  }

  return csp;
};
