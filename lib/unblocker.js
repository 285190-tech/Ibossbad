"use strict";

var url = require("url");
var parseUrl = require("./parse-url.js");
var _ = require("lodash");
var libCookie = require("cookie");
var debug = require("debug")("unblocker:core");
var debugWS = require("debug")("unblocker:websocket");
var middlewareDebugger = require("./middleware-debugger.js");

// expose all built-in middleware
Unblocker.host = require("./host.js");
Unblocker.referer = require("./referer.js");
Unblocker.cookies = require("./cookies.js");
Unblocker.hsts = require("./hsts.js");
Unblocker.hpkp = require("./hpkp.js");
Unblocker.csp = require("./csp.js");
Unblocker.redirects = require("./redirects.js");
Unblocker.decompress = require("./decompress.js");
Unblocker.charsets = require("./charsets.js");
Unblocker.urlPrefixer = require("./url-prefixer.js");
Unblocker.clientScripts = require("./client-scripts.js");
Unblocker.metaRobots = require("./meta-robots.js");
Unblocker.contentLength = require("./content-length.js");
Unblocker.locationRewriter = require("./location-rewriter.js");

// these aren't middleware, but are still worth exposing
Unblocker.proxy = require("./proxy.js");
Unblocker.contentTypes = require("./content-types.js");
Unblocker.getRealUrl = require("./get-real-url.js");
Unblocker.websockets = require("./websockets.js");

var defaultConfig = {
  prefix: "/proxy/",
  host: null, // can be used to override the url used in redirects
  requestMiddleware: [],
  responseMiddleware: [],
  standardMiddleware: true,
  clientScripts: true, // note: disabling standardMiddleware also disables clientScripts.
  enableOriginCookie: false,
  rewriteLocation: false,
  isolateStorage: false,
  ignorePaths: [],
  processContentTypes: Unblocker.contentTypes.html.concat(
    Unblocker.contentTypes.css
  ),
};

function isLocalTarget(rawTarget) {
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])([:/]|$)/i.test(
    rawTarget
  );
}

function Unblocker(config) {
  config = config || {};
  _.defaults(config, defaultConfig);

  if (config.prefix.substr(-1) != "/") {
    config.prefix += "/";
  }

  var clientScripts;
  if (config.standardMiddleware !== false) {
    var host = Unblocker.host(config);
    var referer = Unblocker.referer(config);
    var cookies = Unblocker.cookies(config);
    var hsts = Unblocker.hsts(config);
    var hpkp = Unblocker.hpkp(config);
    var csp = Unblocker.csp(config);
    var redirects = Unblocker.redirects(config);
    var decompress = Unblocker.decompress(config);
    var charsets = Unblocker.charsets(config);
    var urlPrefixer = Unblocker.urlPrefixer(config);
    var metaRobots = Unblocker.metaRobots(config);
    var locationRewriter = Unblocker.locationRewriter(config);
    var contentLength = Unblocker.contentLength(config);

    // this applies to every request that gets proxied
    config.requestMiddleware = [
      host,
      referer,
      decompress.handleRequest,
      cookies.handleRequest,
    ].concat(config.requestMiddleware);

    config.responseMiddleware = [
      hsts,
      hpkp,
      csp,
      redirects,
      decompress.handleResponse,
      charsets,
      urlPrefixer,
      locationRewriter,
      cookies.handleResponse,
      metaRobots,
    ].concat(config.responseMiddleware, [contentLength]);

    if (config.clientScripts) {
      // insert clientScripts after the urlPrefixer
      clientScripts = Unblocker.clientScripts(config);
      const position = config.responseMiddleware.indexOf(urlPrefixer) + 1;
      config.responseMiddleware.splice(position, 0, clientScripts.injector);
    }
  }

  // the middleware debugger logs details before/after each piece of middleware
  if (middlewareDebugger.enabled) {
    config.requestMiddleware = middlewareDebugger.debugMiddleware(
      config.requestMiddleware,
      "request"
    );
    config.responseMiddleware = middlewareDebugger.debugMiddleware(
      config.responseMiddleware,
      "response"
    );
  }

  debug("Unblocker initialized, config: ", config);

  var proxy = Unblocker.proxy(config);

  var getRealUrl = Unblocker.getRealUrl(config);

  function isIgnoredPath(reqUrl) {
    if (!config.ignorePaths || !config.ignorePaths.length) {
      return false;
    }
    return config.ignorePaths.some(function (prefix) {
      return reqUrl === prefix || reqUrl.indexOf(prefix) === 0;
    });
  }

  /**
   * Checks the referrer (or optional origin cookie fallback) to determine what the path should be,
   * and then issues a 307 redirect to a proxied url at that path.
   */
  function recoverTargetUrl(request) {
    if (isIgnoredPath(request.url)) {
      return null;
    }

    if (request.url.indexOf(config.prefix) === 0) {
      // handles /proxy/ and /proxy
      if (
        request.url == config.prefix ||
        request.url == config.prefix.substr(0, config.prefix.length - 1)
      ) {
        return null;
      }
      var bareTarget = request.url.substr(config.prefix.length);
      if (/^\/\//.test(bareTarget)) {
        return "https:" + bareTarget;
      }
      var defaultScheme = isLocalTarget(bareTarget) ? "http://" : "https://";
      return defaultScheme + bareTarget;
    }

    if (request.headers.referer) {
      var ref = parseUrl(request.headers.referer);

      if (ref && ref.host == thisHost(request)) {
        if (
          ref.pathname &&
          ref.pathname.indexOf(config.prefix + "http") === 0
        ) {
          var real_url = getRealUrl(ref.pathname);
          var real_uri = parseUrl(real_url);
          var target_url =
            real_uri.protocol + "//" + real_uri.host + request.url;
          debug("recovering broken link to %s", request.url);
          return target_url;
        }
      }
    }

    // Optional fallback for Referer-less subresources (e.g. Web Workers / fonts / dynamic imports)
    if (
      config.enableOriginCookie &&
      request.url !== "/" &&
      request.headers.cookie
    ) {
      var parsedCookies = libCookie.parse(request.headers.cookie);
      if (parsedCookies.__unblocker_origin) {
        try {
          var originUri = new global.URL(parsedCookies.__unblocker_origin);
          if (
            originUri.protocol === "http:" ||
            originUri.protocol === "https:"
          ) {
            debug(
              "recovering Referer-less link %s via origin cookie %s",
              request.url,
              originUri.origin
            );
            return originUri.origin + request.url;
          }
        } catch (err) {
          // ignore malformed cookie
        }
      }
    }

    return null;
  }

  // returns the configured host if one exists, otherwise the host that the current request came in on
  function thisHost(request) {
    if (config.host) {
      return config.host;
    }
    var forwardedHost = request.headers && request.headers["x-forwarded-host"];
    if (forwardedHost) {
      return forwardedHost.split(",")[0].trim();
    }
    return request.headers.host;
  }

  // returns the http(s)://site.com/proxy/
  function thisSite(request) {
    var forwardedProto =
      request.headers["x-forwarded-proto"] ||
      request.headers["x-forwarded-protocol"] ||
      request.headers["X-Forwarded-Protocol"];
    if (forwardedProto) {
      forwardedProto = forwardedProto.split(",")[0].trim();
    }
    var encrypted =
      (request.socket && request.socket.encrypted) ||
      (request.connection && request.connection.encrypted) ||
      request.headers["x-forwarded-ssl"] === "on";
    const proto =
      request.protocol || forwardedProto || (encrypted ? "https" : "http");
    return proto + "://" + thisHost(request) + config.prefix;
  }

  function redirectTo(request, response, site, headers) {
    site = site || "";
    if (site.substr(0, 1) == "/") {
      site = site.substr(1);
    }
    if (site.substr(0, config.prefix.length) == config.prefix) {
      // no /proxy/proxy redirects
      site = site.substr(config.prefix.length);
    }
    var location = request.thisSite() + site;
    debug("redirecting to %s", location);
    try {
      response.writeHead(
        307,
        _.defaults(headers || {}, {
          Location: location,
        })
      );
    } catch (ex) {
      // Most likely because the headers were already sent
      console.error("Failed to send redirect", ex);
    }
    response.end();
  }

  function initData(clientRequest, clientResponse, clientSocket) {
    // convenience methods
    clientRequest.thisHost = thisHost.bind(thisHost, clientRequest);
    clientRequest.thisSite = thisSite.bind(thisSite, clientRequest);

    var uri,
      formatted = null;
    var url_data = parseUrl(clientRequest.url);
    var rawUrl = clientRequest.url.substr(config.prefix.length);

    if (
      url_data.pathname &&
      url_data.pathname.indexOf(config.prefix + "http") === 0
    ) {
      uri = parseUrl(getRealUrl(clientRequest.url));
      formatted = url.format(uri);
    } else {
      var target = recoverTargetUrl(clientRequest);
      if (target) {
        uri = parseUrl(target);
        formatted = url.format(uri);
      }
    }

    var data = {
      url: formatted,
      uri,
      rawUrl,
      clientRequest,
      clientResponse,
      headers: _.cloneDeep(clientRequest.headers),
      stream: clientRequest,
      isWebsocket: !!clientSocket,
      clientSocket,
    };

    return data;
  }

  const clientScriptsServer =
    config.clientScripts && clientScripts
      ? clientScripts.server
      : (req, res, next) => next();

  // regular web requests
  function handleRequest(clientRequest, clientResponse, next) {
    const data = initData(clientRequest, clientResponse);

    clientScriptsServer(clientRequest, clientResponse, (err) => {
      if (err) return next(err);

      clientResponse.redirectTo = redirectTo.bind(
        redirectTo,
        clientRequest,
        clientResponse
      );

      if (!next) {
        next = function () {
          clientResponse.writeHead(400);
          clientResponse.end("Unable to process request");
        };
      }

      const formatted = data.url;
      const raw = data.rawUrl;

      if (formatted) {
        // If the raw URL isn't quite right, but we can figure it out, redirect to the correct URL.
        // Special exception for cases where routers collapsed slashes (see #130)
        if (formatted !== raw && formatted.replace("://", ":/") !== raw) {
          return clientResponse.redirectTo(formatted);
        }

        proxy(data, next);
      } else {
        next();
      }
    });
  }

  // websocket support
  const proxyWebsocket = Unblocker.websockets(config);

  handleRequest.onUpgrade = function onUpgrade(
    clientRequest,
    clientSocket,
    clientHead
  ) {
    debugWS("handling websocket req to", clientRequest.url);

    const data = initData(clientRequest, null, clientSocket);

    data.clientHead = clientHead;

    if (data.url) {
      proxyWebsocket(data);
    } else {
      debugWS("unable to handle websocket upgrade", clientRequest.url);
      clientSocket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    }
  };

  return handleRequest;
}

module.exports = Unblocker;
module.exports.defaultConfig = defaultConfig;
