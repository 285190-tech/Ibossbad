"use strict";

var URL = require("url"),
  http = require("http"),
  https = require("https"),
  _ = require("lodash"),
  contentTypes = require("./content-types.js"),
  debug = require("debug")("unblocker:proxy");

var STRIP_REQUEST_HEADERS = [
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-ew-via",
  "cf-worker",
  "cdn-loop",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-forwarded-protocol",
  "x-forwarded-ssl",
  "x-real-ip",
  "rndr-id",
  "x-render-origin-server",
  "true-client-ip",
  "via",
  "forwarded",
];

var INTERNAL_COOKIE_PREFIXES = ["__ibossbad_", "__unblocker_"];

var DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function sanitizeRequestHeaders(headers) {
  STRIP_REQUEST_HEADERS.forEach(function (header) {
    delete headers[header];
  });

  if (headers.cookie) {
    var filtered = headers.cookie
      .split(";")
      .map(function (part) {
        return part.trim();
      })
      .filter(function (part) {
        if (!part) return false;
        var eqIdx = part.indexOf("=");
        var name = eqIdx === -1 ? part : part.substr(0, eqIdx);
        return !INTERNAL_COOKIE_PREFIXES.some(function (prefix) {
          return name.indexOf(prefix) === 0;
        });
      });

    if (filtered.length) {
      headers.cookie = filtered.join("; ");
    } else {
      delete headers.cookie;
    }
  }

  if (!headers["user-agent"]) {
    headers["user-agent"] = DEFAULT_USER_AGENT;
  }
}

function proxy(config) {
  /**
   * Makes the outgoing request and relays it to the client, modifying it along the way if necessary
   */
  function proxyRequest(data, next) {
    debug("proxying %s %s", data.clientRequest.method, data.url);

    sanitizeRequestHeaders(data.headers);

    var middlewareHandledRequest = _.some(
      config.requestMiddleware,
      function (middleware) {
        middleware(data);
        return data.clientResponse.headersSent;
      }
    );

    if (!middlewareHandledRequest) {
      var uri = URL.parse(data.url);

      var options = {
        host: uri.hostname,
        port: uri.port,
        path: uri.path,
        method: data.clientRequest.method,
        headers: data.headers,
      };

      // set the agent for the request.
      if (uri.protocol == "http:" && config.httpAgent) {
        options.agent = config.httpAgent;
      }
      if (uri.protocol == "https:" && config.httpsAgent) {
        options.agent = config.httpsAgent;
      }

      // what protocol to use for outgoing connections.
      var proto = uri.protocol == "https:" ? https : http;

      debug("sending remote request: ", options);

      var nextCalled = false;
      var safeNext = function (err) {
        if (nextCalled) return;
        nextCalled = true;
        if (data.clientResponse.headersSent) {
          try {
            data.clientResponse.end();
          } catch (ex) {
            debug("error closing response stream: %s", ex.message);
          }
          return;
        }
        next(err);
      };

      data.remoteRequest = proto.request(options, function (remoteResponse) {
        data.remoteResponse = remoteResponse;
        data.remoteResponse.on("error", safeNext);
        proxyResponse(data);
      });

      data.remoteRequest.on("error", safeNext);

      data.clientRequest.on("aborted", function () {
        if (data.remoteRequest) {
          data.remoteRequest.destroy();
        }
      });

      // pass along POST data & let the remote server know when we're done sending data
      data.stream.on("error", safeNext);
      data.stream.pipe(data.remoteRequest);
    }
  }

  function proxyResponse(data) {
    debug(
      "proxying %s response for %s",
      data.remoteResponse.statusCode,
      data.url
    );

    // make a copy of the headers to fiddle with
    data.headers = _.cloneDeep(data.remoteResponse.headers);

    debug("remote response headers", data.headers);

    // create a stream object for middleware to pipe from and overwrite
    data.stream = data.remoteResponse;

    data.contentType = contentTypes.getType(data);

    // Ensure CORS subresource requests through the proxy aren't rejected by browser origin checks
    if (
      data.clientRequest.headers &&
      data.clientRequest.headers.origin &&
      data.headers["access-control-allow-origin"] &&
      data.headers["access-control-allow-origin"] !== "*"
    ) {
      data.headers["access-control-allow-origin"] =
        data.clientRequest.headers.origin;
    }

    // Track last HTML origin in cookie when enabled for Referer-less root-relative asset recovery
    if (
      config.enableOriginCookie &&
      contentTypes.html.includes(data.contentType) &&
      data.url
    ) {
      try {
        var pageOrigin = new global.URL(data.url).origin;
        var originCookie =
          "__unblocker_origin=" +
          encodeURIComponent(pageOrigin) +
          "; Path=/; SameSite=Lax";
        var existingSetCookie = data.headers["set-cookie"];
        if (Array.isArray(existingSetCookie)) {
          existingSetCookie.push(originCookie);
        } else if (existingSetCookie) {
          data.headers["set-cookie"] = [existingSetCookie, originCookie];
        } else {
          data.headers["set-cookie"] = [originCookie];
        }
      } catch (err) {
        debug("unable to set origin cookie: %s", err.message);
      }
    }

    var middlewareHandledResponse = _.some(
      config.responseMiddleware,
      function (middleware) {
        middleware(data);
        return data.clientResponse.headersSent;
      }
    );

    if (!middlewareHandledResponse) {
      data.clientResponse.writeHead(
        data.remoteResponse.statusCode,
        data.headers
      );
      data.stream.on("error", function (err) {
        debug("response stream error: %s", err.message);
        try {
          data.clientResponse.end();
        } catch (ex) {
          // ignore
        }
      });
      data.stream.pipe(data.clientResponse);
    }
  }

  return proxyRequest;
}

proxy.sanitizeRequestHeaders = sanitizeRequestHeaders;
module.exports = proxy;
