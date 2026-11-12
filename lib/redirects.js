"use strict";

var debug = require("debug")("unblocker:redirects");

module.exports = function (config) {
  var prefix = (config && config.prefix) || "/proxy/";

  function proxyRedirects(data) {
    var loc = data.headers && data.headers.location;
    if (!loc) {
      return;
    }

    // Already rewritten to go through the proxy
    if (loc.indexOf(prefix) === 0) {
      return;
    }

    var resolved = null;
    if (loc.substr(0, 4) === "http") {
      resolved = loc;
    } else if (loc.substr(0, 2) === "//") {
      resolved =
        (data.url && data.url.substr(0, 5) === "https" ? "https:" : "http:") +
        loc;
    } else if (data.url) {
      try {
        resolved = new URL(loc, data.url).href;
      } catch (err) {
        debug("unable to resolve relative redirect %s: %s", loc, err.message);
      }
    }

    if (resolved) {
      var location = data.clientRequest.thisSite() + resolved;
      data.redirectUrl = resolved;
      debug("rewriting redirect from %s to %s", loc, location);
      data.headers.location = location;
    }
  }

  return proxyRedirects;
};
