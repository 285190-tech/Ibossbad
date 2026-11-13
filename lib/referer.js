"use strict";

var parseUrl = require("./parse-url.js");
var debug = require("debug")("proxyReferer");

module.exports = function (config) {
  function proxyReferer(data) {
    // overwrite the referer with the correct referer
    if (data.headers.referer) {
      var uri = parseUrl(data.headers.referer);
      if (
        uri.path &&
        uri.path.substr(0, config.prefix.length) == config.prefix
      ) {
        var ref = uri.path.substr(config.prefix.length);
        ref = ref.replace(/^(https?:\/)([^/])/i, "$1/$2");
        debug("rewriting referer from %s to %s", data.headers.referer, ref);
        data.headers.referer = ref;
      }
    }

    // rewrite Origin header to match target site so POST/fetch/WebSocket requests pass origin checks
    if (data.headers.origin && data.url) {
      try {
        var target = new global.URL(data.url);
        if (data.headers.origin !== "null") {
          data.headers.origin = target.origin;
        }
      } catch (err) {
        debug("unable to rewrite origin: %s", err.message);
      }
    }
  }

  return proxyReferer;
};
