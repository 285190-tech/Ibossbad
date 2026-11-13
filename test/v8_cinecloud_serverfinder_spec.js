"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var http = require("http");
var perfHooks = require("perf_hooks");
var WebSocket = require("ws");
var test = require("tap").test;
var createApp = require("../lib/app.js");

function httpReq(port, method, reqPath, bodyObj, extraHeaders) {
  return new Promise(function (resolve, reject) {
    var payload = bodyObj ? Buffer.from(JSON.stringify(bodyObj), "utf8") : null;
    var headers = Object.assign({}, extraHeaders || {});
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(payload.length);
    }
    var req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: reqPath,
        method: method,
        headers: headers,
      },
      function (res) {
        var chunks = [];
        res.on("data", function (c) {
          chunks.push(c);
        });
        res.on("end", function () {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Minimal Node wrapper exposing browser-compatible WebSocket with ArrayBuffer messages
function createBrowserWsClass(cookieHeader) {
  return function BrowserWebSocket(url) {
    var self = this;
    self.binaryType = "arraybuffer";
    self.onmessage = null;
    self.onerror = null;
    self.onclose = null;
    var raw = new WebSocket(
      url,
      cookieHeader ? { headers: { Cookie: cookieHeader } } : undefined
    );
    raw.on("message", function (buf) {
      if (typeof self.onmessage === "function") {
        var payload = Buffer.isBuffer(buf)
          ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
          : String(buf);
        self.onmessage({ data: payload });
      }
    });
    raw.on("error", function () {
      if (typeof self.onerror === "function") self.onerror(new Error("ws err"));
    });
    raw.on("close", function () {
      if (typeof self.onclose === "function") self.onclose({});
    });
    self.send = function (u8) {
      raw.send(Buffer.from(u8));
    };
    self.close = function () {
      try {
        raw.close();
      } catch (_e) {
        /* ignore */
      }
    };
  };
}

test("v8.0: /mgg-games/ direct mirror, broken CNAME healing, binary WISP server finder, SW recovery & Cine-Cloud 106 catalog", async function (t) {
  // 1) Mock upstream GitHub Raw server for /mgg-games/
  var mockUpstream = http.createServer(function (req, res) {
    if (req.url === "/slope/index.html") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("<html><body>Slope WebGL Ready</body></html>");
    } else if (req.url === "/slope/Build/slope.wasm") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(Buffer.from([0x00, 0x61, 0x73, 0x6d]));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  await new Promise(function (resolve) {
    mockUpstream.listen(0, "127.0.0.1", resolve);
  });
  var mockPort = mockUpstream.address().port;

  // 2) Fake non-WISP WebSocket server (simulating a school MITM block socket)
  var fakeWsHttp = http.createServer();
  var fakeWss = new WebSocket.Server({ server: fakeWsHttp });
  fakeWss.on("connection", function (sock) {
    sock.send("BLOCKED BY SCHOOL FILTER");
    sock.close();
  });
  await new Promise(function (resolve) {
    fakeWsHttp.listen(0, "127.0.0.1", resolve);
  });
  var fakeWsPort = fakeWsHttp.address().port;

  // 3) Main Ibossbad app + real WISP server
  var instance = createApp({
    passcode: "ibossbad",
    adminPassword: "admin",
    autoLoadSupabase: false,
    skipInternetProbe: true,
    mggUpstreamBaseUrl: "http://127.0.0.1:" + mockPort,
    mggFallbackBaseUrl: "http://127.0.0.1:" + mockPort,
  });

  var server = http.createServer(instance.app);
  instance.attachUpgrade(server);
  await new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", resolve);
  });
  var port = server.address().port;

  try {
    // Authenticate to obtain session cookie
    var loginRes = await httpReq(port, "POST", "/api/auth/passcode", {
      passcode: "ibossbad",
    });
    t.equal(loginRes.status, 200, "Passcode login succeeds");
    var cookie = (loginRes.headers["set-cookie"] || [])[0].split(";")[0];

    // Verify bare /mgg-games/slope redirects to /mgg-games/slope/
    var redirRes = await httpReq(port, "GET", "/mgg-games/slope", null, {
      Cookie: cookie,
    });
    t.equal(redirRes.status, 302, "Bare /mgg-games/slope redirects with 302");
    t.equal(
      redirRes.headers.location,
      "/mgg-games/slope/",
      "Redirects to trailing slash /mgg-games/slope/"
    );

    // Verify /mgg-games/slope/ serves HTML with text/html MIME (fixing raw.githubusercontent text/plain)
    var slopeHtml = await httpReq(port, "GET", "/mgg-games/slope/", null, {
      Cookie: cookie,
    });
    t.equal(slopeHtml.status, 200, "/mgg-games/slope/ returns 200");
    t.match(
      slopeHtml.headers["content-type"],
      /^text\/html/i,
      "Overrides text/plain with text/html Content-Type"
    );
    t.match(
      slopeHtml.body.toString("utf8"),
      /Slope WebGL Ready/,
      "Serves Slope HTML content"
    );

    // Verify .wasm asset gets application/wasm Content-Type
    var slopeWasm = await httpReq(
      port,
      "GET",
      "/mgg-games/slope/Build/slope.wasm",
      null,
      { Cookie: cookie }
    );
    t.equal(
      slopeWasm.status,
      200,
      "/mgg-games/slope/Build/slope.wasm returns 200"
    );
    t.equal(
      slopeWasm.headers["content-type"],
      "application/wasm",
      "Serves .wasm with application/wasm MIME type"
    );

    // Verify games-catalog.js heals broken pijgalk.desarrollos-lowcost.com & monkeygg2.github.io URLs
    var catSrc = fs.readFileSync(
      path.join(__dirname, "..", "public", "games-catalog.js"),
      "utf8"
    );
    var catWin = {};
    vm.runInNewContext(catSrc, { window: catWin });
    var exportedCat = catWin.IbossGamesCatalog || catWin.IBOSS_GAMES_CATALOG;
    t.ok(exportedCat, "Exports games catalog");
    t.equal(
      exportedCat.healLegacyGameUrl(
        "http://pijgalk.desarrollos-lowcost.com/games/slope/"
      ),
      "/mgg-games/slope/",
      "Heals broken pijgalk.desarrollos-lowcost.com CNAME URL"
    );
    t.equal(
      exportedCat.healLegacyGameUrl(
        "https://monkeygg2.github.io/games/eaglercraft/"
      ),
      "/mgg-games/eaglercraft/",
      "Heals legacy monkeygg2.github.io URL"
    );

    // Verify Cine-Cloud 106-game catalog & engine
    var ccCatSrc = fs.readFileSync(
      path.join(__dirname, "..", "public", "cine-cloud-catalog.js"),
      "utf8"
    );
    var ccSrc = fs.readFileSync(
      path.join(__dirname, "..", "public", "cine-cloud.js"),
      "utf8"
    );
    var ccWin = {
      localStorage: {
        getItem: function () {
          return null;
        },
        setItem: function () {},
      },
      document: {
        getElementById: function () {
          return null;
        },
      },
    };
    vm.runInNewContext(ccCatSrc, { window: ccWin });
    vm.runInNewContext(ccSrc, {
      window: ccWin,
      document: ccWin.document,
      Math: Math,
      Date: Date,
      setInterval: setInterval,
      clearInterval: clearInterval,
    });
    t.equal(
      ccWin.IBOSS_CINE_CLOUD_CATALOG.length,
      106,
      "Loads all 106 AAA PC Cloud games from Cine-Cloud-SRC"
    );
    t.equal(
      ccWin.IbossCineCloud.PARTICLE_MODES.length,
      9,
      "Exports all 9 Cine-Cloud interactive particle modes"
    );

    // Verify Opium-style Authentic Binary WISP Handshake Scanner (public/server-finder.js)
    var sfSrc = fs.readFileSync(
      path.join(__dirname, "..", "public", "server-finder.js"),
      "utf8"
    );
    var sfWin = {
      location: { protocol: "http:", host: "127.0.0.1:" + port },
      localStorage: {
        getItem: function () {
          return null;
        },
        setItem: function () {},
      },
      sessionStorage: {
        getItem: function () {
          return null;
        },
        setItem: function () {},
      },
      WebSocket: createBrowserWsClass(cookie),
      fetch: function () {
        return Promise.reject(new Error("offline"));
      },
    };
    vm.runInNewContext(sfSrc, {
      window: sfWin,
      URL: URL,
      DataView: DataView,
      ArrayBuffer: ArrayBuffer,
      Uint8Array: Uint8Array,
      TextEncoder: TextEncoder,
      Set: Set,
      Map: Map,
      Math: Math,
      Date: Date,
      performance: perfHooks.performance,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
    });

    var realProbe = await sfWin.IbossServerFinder.probeWispHandshake(
      "ws://127.0.0.1:" + port + "/wisp/",
      2500
    );
    t.ok(
      realProbe.ok,
      "Real /wisp/ server passes binary WISP stream handshake"
    );
    t.ok(
      typeof realProbe.latencyMs === "number" && realProbe.latencyMs >= 1,
      "Measures true binary WISP round-trip latency (" +
        realProbe.latencyMs +
        "ms)"
    );

    var fakeProbe = await sfWin.IbossServerFinder.probeWispHandshake(
      "ws://127.0.0.1:" + fakeWsPort + "/",
      1500
    );
    t.notOk(
      fakeProbe.ok,
      "Rejects fake MITM/non-WISP WebSocket server that fails binary WISP handshake"
    );

    // Verify Service Worker auto-recovery prevents Chrome ERR_FAILED & Scramjet error 52 crashes
    var swSrc = fs.readFileSync(
      path.join(__dirname, "..", "public", "sw.js"),
      "utf8"
    );
    var fetchListener = null;
    var nextScramjetBehavior = "throw";
    var swSelf = {
      location: { origin: "https://ibossbad.onrender.com" },
      skipWaiting: function () {},
      clients: {
        claim: function () {
          return Promise.resolve();
        },
      },
      addEventListener: function (evName, fn) {
        if (evName === "fetch") fetchListener = fn;
      },
    };
    var swCtx = {
      self: swSelf,
      URL: URL,
      Headers: global.Headers || function () {},
      Response:
        global.Response ||
        Object.assign(
          function (body, init) {
            this._body = body;
            this.status = (init && init.status) || 200;
            this.headers = {
              get: function () {
                return "";
              },
              has: function () {
                return false;
              },
            };
            this.text = function () {
              return Promise.resolve(String(body));
            };
            this.clone = function () {
              return this;
            };
          },
          {
            redirect: function (u, st) {
              return { status: st || 302, redirectedTo: u };
            },
          }
        ),
      importScripts: function () {},
      $scramjetLoadWorker: function () {
        return {
          ScramjetServiceWorker: function () {
            this.config = { prefix: "/scramjet/" };
            this.loadConfig = function () {
              return Promise.resolve();
            };
            this.route = function (ev) {
              return ev.request.url.indexOf("/scramjet/") !== -1;
            };
            this.fetch = function () {
              if (nextScramjetBehavior === "throw") {
                return Promise.reject(new Error("BareMux port disconnected"));
              }
              return Promise.resolve(
                new swCtx.Response(
                  "Uh oh! There was an error loading http://example.com\nMessage: Request failed with error code 52: Server returned nothing",
                  { status: 500 }
                )
              );
            };
          },
        };
      },
      BroadcastChannel: function () {
        this.postMessage = function () {};
        this.addEventListener = function () {};
      },
      caches: undefined,
      fetch: function () {
        return Promise.resolve({ status: 200 });
      },
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      Date: Date,
      Math: Math,
      Set: Set,
      Map: Map,
    };
    vm.runInNewContext(swSrc, swCtx);
    t.ok(fetchListener, "Registered SW fetch listener");

    // a) Legacy pijgalk.desarrollos-lowcost.com inside /scramjet/ redirects 302 -> /mgg-games/slope/
    var respondedPromise = null;
    fetchListener({
      request: {
        url:
          "https://ibossbad.onrender.com/scramjet/http%3A%2F%2Fpijgalk.desarrollos-lowcost.com%2Fgames%2Fslope%2F",
        method: "GET",
        mode: "navigate",
        destination: "iframe",
      },
      respondWith: function (p) {
        respondedPromise = p;
      },
    });
    var healedSwRes = await respondedPromise;
    t.equal(
      healedSwRes.status,
      302,
      "SW heals broken pijgalk.desarrollos-lowcost.com /scramjet/ request with 302 redirect"
    );

    // b) Thrown Scramjet error on YouTube navigation returns 200 Smart Recovery HTML instead of rejecting!
    nextScramjetBehavior = "throw";
    respondedPromise = null;
    fetchListener({
      request: {
        url:
          "https://ibossbad.onrender.com/scramjet/https%3A%2F%2Fwww.youtube.com%2F",
        method: "GET",
        mode: "navigate",
        destination: "iframe",
        headers: {
          has: function () {
            return false;
          },
          get: function () {
            return "text/html";
          },
        },
      },
      respondWith: function (p) {
        respondedPromise = p;
      },
    });
    var ytRecRes = await respondedPromise;
    t.equal(
      ytRecRes.status,
      200,
      "SW catches YouTube Scramjet rejection and returns 200 recovery page (prevents Chrome ERR_FAILED)"
    );
    var ytRecHtml = await ytRecRes.text();
    t.match(
      ytRecHtml,
      /btnSwitchRetry/,
      "Recovery page exposes manual Switch Server & Retry button"
    );
    t.notMatch(
      ytRecHtml,
      /setTimeout\(function\(\)\{location\.reload/,
      "Recovery page does NOT auto-loop or auto-reload on load"
    );
    t.notMatch(
      swSrc,
      /scramjet-nav-error/,
      "SW never broadcasts background scramjet-nav-error relay swaps"
    );
    t.equal(
      sfWin.IbossServerFinder.getServerProtocol(
        "wss://cdn.northstreetumc.org/"
      ),
      "WISP v2",
      "Identifies Opium stealth servers as WISP v2 (requiring epoxy transport)"
    );
    t.equal(
      sfWin.IbossServerFinder.getServerProtocol("wss://wisp.mercurywork.shop/"),
      "WISP v1",
      "Identifies universal community relays as WISP v1"
    );
    t.match(
      ytRecHtml,
      /Ad-Free YouTube Hub/,
      "Recovery page offers 1-click Ad-Free YouTube Hub button for youtube.com"
    );

    // c) Scramjet 500 error code 52 crash page is replaced by Smart Recovery HTML
    nextScramjetBehavior = "err52";
    respondedPromise = null;
    fetchListener({
      request: {
        url:
          "https://ibossbad.onrender.com/scramjet/http%3A%2F%2Fdeadhost.example%2F",
        method: "GET",
        mode: "navigate",
        destination: "iframe",
        headers: {
          has: function () {
            return false;
          },
          get: function () {
            return "text/html";
          },
        },
      },
      respondWith: function (p) {
        respondedPromise = p;
      },
    });
    var err52Res = await respondedPromise;
    t.equal(
      err52Res.status,
      200,
      "SW intercepts Scramjet 500 error code 52 page and returns 200 Smart Recovery card"
    );

    // Verify root index.html includes v8.0 Cine-Cloud & Server Finder UI hooks
    // and keeps .tab-strip unobstructed while removing WebOS Desktop
    var rootRes = await httpReq(port, "GET", "/");
    var rootHtml = rootRes.body.toString("utf8");
    t.match(rootHtml, /cineCloudBtn/, "Includes Cine-Cloud dock button");
    t.match(
      rootHtml,
      /serverFinderPill/,
      "Includes live Unblocked Server Finder pill"
    );
    t.match(
      rootHtml,
      /tab-strip-tabs/,
      "Uses dedicated flex tab-strip-tabs container so action pills never cover tabs"
    );
    t.match(
      rootHtml,
      /hub-dock-actions/,
      "Places Cine-Cloud/Games/Media pills in sub-toolbar hub-dock-actions below nav-bar"
    );
    t.notMatch(
      rootHtml,
      /desktopModeBtn|iboss:\/\/desktop/,
      "Completely removes WebOS Desktop from browser UI"
    );
    t.match(rootHtml, /\/ui\/server-finder\.js/, "Loads server-finder.js");
    t.match(rootHtml, /\/ui\/cine-cloud\.js/, "Loads cine-cloud.js");
  } finally {
    await new Promise(function (resolve) {
      server.close(resolve);
    });
    await new Promise(function (resolve) {
      mockUpstream.close(resolve);
    });
    await new Promise(function (resolve) {
      fakeWss.close(function () {
        fakeWsHttp.close(resolve);
      });
    });
  }
});
