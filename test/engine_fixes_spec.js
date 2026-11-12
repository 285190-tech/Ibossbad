"use strict";

var zlib = require("zlib");
var http = require("http");
var test = require("tap").test;
var concat = require("concat-stream");
var decompress = require("../lib/decompress.js");
var redirects = require("../lib/redirects.js");
var referer = require("../lib/referer.js");
var csp = require("../lib/csp.js");
var urlPrefixer = require("../lib/url-prefixer.js");
var proxy = require("../lib/proxy.js");
var Unblocker = require("../lib/unblocker.js");
var clientLib = require("../lib/client/unblocker-client.js");

test("should decompress Brotli (br) responses", function (t) {
  var source = zlib.createBrotliCompress();
  var data = {
    remoteResponse: { statusCode: 200 },
    headers: { "content-encoding": "br" },
    contentType: "text/html",
    stream: source,
  };
  var content =
    "<html><head></head><body>neal.fun brotli content</body></html>";

  decompress(Unblocker.defaultConfig).handleResponse(data);
  t.notOk(data.headers["content-encoding"], "removes br content-encoding");

  data.stream.pipe(
    concat(function (buf) {
      t.equal(buf.toString(), content);
      t.end();
    })
  );
  source.end(content);
});

test("should decompress raw deflate responses", function (t) {
  var source = zlib.createDeflateRaw();
  var data = {
    remoteResponse: { statusCode: 200 },
    headers: { "content-encoding": "deflate" },
    contentType: "text/html",
    stream: source,
  };
  var content = "raw deflate payload without zlib header";

  decompress(Unblocker.defaultConfig).handleResponse(data);

  data.stream.pipe(
    concat(function (buf) {
      t.equal(buf.toString(), content);
      t.end();
    })
  );
  source.end(content);
});

test("should rewrite root-relative and relative 3xx Location headers", function (t) {
  var redirectMiddleware = redirects({ prefix: "/proxy/" });

  var rootRelData = {
    url: "https://neal.fun/infinite-craft",
    headers: { location: "/infinite-craft/" },
    clientRequest: {
      thisSite: function () {
        return "https://ibossbad.onrender.com/proxy/";
      },
    },
  };
  redirectMiddleware(rootRelData);
  t.equal(
    rootRelData.headers.location,
    "https://ibossbad.onrender.com/proxy/https://neal.fun/infinite-craft/"
  );

  var relData = {
    url: "https://example.com/games/index.html",
    headers: { location: "play.html" },
    clientRequest: {
      thisSite: function () {
        return "https://ibossbad.onrender.com/proxy/";
      },
    },
  };
  redirectMiddleware(relData);
  t.equal(
    relData.headers.location,
    "https://ibossbad.onrender.com/proxy/https://example.com/games/play.html"
  );
  t.end();
});

test("should rewrite Origin header and strip Cloudflare/Render edge headers", function (t) {
  var headers = {
    host: "ibossbad.onrender.com",
    origin: "https://ibossbad.onrender.com",
    referer: "https://ibossbad.onrender.com/proxy/https://neal.fun/",
    "cf-ray": "abc123",
    "cf-connecting-ip": "1.2.3.4",
    "cdn-loop": "cloudflare",
    "x-forwarded-for": "1.2.3.4",
    "rndr-id": "render-xyz",
    cookie: "__ibossbad_session=secret; cf_clearance=valid_token",
  };

  proxy.sanitizeRequestHeaders(headers);
  t.notOk(headers["cf-ray"], "strips cf-ray");
  t.notOk(headers["cdn-loop"], "strips cdn-loop");
  t.notOk(headers["x-forwarded-for"], "strips x-forwarded-for");
  t.notOk(headers["rndr-id"], "strips rndr-id");
  t.equal(
    headers.cookie,
    "cf_clearance=valid_token",
    "strips internal session cookie while preserving target cookies"
  );

  var data = {
    url: "https://neal.fun/api/infinite-craft/pair",
    headers: headers,
  };
  referer({ prefix: "/proxy/" })(data);
  t.equal(data.headers.origin, "https://neal.fun", "rewrites Origin to target");
  t.equal(data.headers.referer, "https://neal.fun/", "rewrites Referer");
  t.end();
});

test("should strip iframe-blocking and COEP/COOP/Referrer-Policy headers", function (t) {
  var data = {
    headers: {
      "x-frame-options": "SAMEORIGIN",
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-embedder-policy": "require-corp",
      "cross-origin-resource-policy": "same-origin",
      "referrer-policy": "no-referrer",
      "content-type": "text/html",
    },
  };
  csp()(data);
  t.notOk(data.headers["x-frame-options"]);
  t.notOk(data.headers["cross-origin-opener-policy"]);
  t.notOk(data.headers["cross-origin-embedder-policy"]);
  t.notOk(data.headers["cross-origin-resource-policy"]);
  t.notOk(data.headers["referrer-policy"]);
  t.equal(data.headers["content-type"], "text/html");
  t.end();
});

test("should neutralize SRI integrity attributes and rewrite video poster", function (t) {
  var prefixer = urlPrefixer({ prefix: "/proxy/" });
  var html =
    '<script src="/app.js" integrity="sha384-abc"></script><video poster="/thumb.jpg"></video>';
  var out = prefixer.rewriteUrls(
    html,
    { protocol: "https:", host: "neal.fun" },
    "/proxy/"
  );
  t.equal(
    out,
    '<script src="/proxy/https://neal.fun/app.js" data-unblocker-integrity="sha384-abc"></script><video poster="/proxy/https://neal.fun/thumb.jpg"></video>'
  );
  t.end();
});

test("should honor lowercase x-forwarded-proto: https on Render redirects", function (t) {
  var unblocker = new Unblocker({ clientScripts: false });
  var server = http.createServer(function (req, res) {
    unblocker(req, res, function () {
      res.writeHead(404);
      res.end();
    });
  });

  server.listen(0, "127.0.0.1", function () {
    var port = server.address().port;
    var req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: "/proxy/neal.fun",
        headers: {
          host: "ibossbad.onrender.com",
          "x-forwarded-proto": "https",
        },
      },
      function (res) {
        t.equal(res.statusCode, 307);
        t.equal(
          res.headers.location,
          "https://ibossbad.onrender.com/proxy/https://neal.fun/"
        );
        server.close(function () {
          t.end();
        });
      }
    );
    req.end();
  });
});

test("client runtime fixes wss:// on https:, Request fetch, XHR constants, srcset, and pushState", function (t) {
  var loc = new URL(
    "https://ibossbad.onrender.com/proxy/https://neal.fun/play"
  );
  var cfg = { prefix: "/proxy/", url: "https://neal.fun/play" };

  // srcset rewriting
  var rewrittenSrcset = clientLib.fixSrcset(
    "/_next/img1.png 1x, https://cdn.neal.fun/img2.png 2x",
    cfg,
    loc
  );
  t.equal(
    rewrittenSrcset,
    "/proxy/https://neal.fun/_next/img1.png 1x, /proxy/https://cdn.neal.fun/img2.png 2x"
  );

  // Mock browser window
  var capturedFetchArg = null;
  var capturedWsUrl = null;
  var pushedArgs = null;

  function MockRequest(url) {
    Object.defineProperty(this, "url", {
      get: function () {
        return url;
      },
    });
  }

  function MockXHR() {}
  MockXHR.DONE = 4;
  MockXHR.prototype.open = function (method, url) {
    this.openedUrl = url;
  };

  function MockWebSocket(url) {
    capturedWsUrl = url;
  }
  MockWebSocket.OPEN = 1;

  var mockWindow = {
    location: loc,
    Request: MockRequest,
    fetch: function (res) {
      capturedFetchArg = res;
      return Promise.resolve();
    },
    XMLHttpRequest: MockXHR,
    WebSocket: MockWebSocket,
    history: {
      pushState: function (state, title, url) {
        pushedArgs = [state, title, url];
      },
      replaceState: function () {},
    },
  };

  clientLib.initForWindow(cfg, mockWindow);

  // 1. Request object with getter-only .url does not throw
  var reqInstance = new MockRequest("https://neal.fun/api/craft");
  mockWindow.fetch(reqInstance);
  t.ok(capturedFetchArg instanceof MockRequest);
  t.equal(
    capturedFetchArg.url,
    "/proxy/https://neal.fun/api/craft",
    "clones Request with rewritten URL"
  );

  // 2. XHR preserves static DONE constant & instanceof
  t.equal(mockWindow.XMLHttpRequest.DONE, 4, "preserves XMLHttpRequest.DONE");
  var xhr = new mockWindow.XMLHttpRequest();
  xhr.open("GET", "/assets/sound.mp3");
  t.equal(xhr.openedUrl, "/proxy/https://neal.fun/assets/sound.mp3");

  // 3. WebSocket on https: uses wss:// (not downgraded to ws://) and preserves OPEN
  t.equal(mockWindow.WebSocket.OPEN, 1, "preserves WebSocket.OPEN");
  new mockWindow.WebSocket("wss://ws.neal.fun/socket");
  t.equal(
    capturedWsUrl,
    "wss://ibossbad.onrender.com/proxy/https://ws.neal.fun/socket",
    "uses wss:// when page is on https:"
  );

  // 4. history.pushState updates config.url without double-prefixing and works without url arg
  mockWindow.history.pushState({ a: 1 }, "", "/infinite-craft/");
  t.equal(pushedArgs[2], "/proxy/https://neal.fun/infinite-craft/");
  t.equal(cfg.url, "https://neal.fun/infinite-craft/");

  mockWindow.history.pushState({ b: 2 }, "");
  t.same(pushedArgs, [{ b: 2 }, "", undefined]);

  t.end();
});
