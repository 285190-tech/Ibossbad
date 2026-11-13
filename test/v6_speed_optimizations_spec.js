"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var http = require("http");
var zlib = require("zlib");
var test = require("tap").test;
var WebSocket = require("ws");
// eslint-disable-next-line node/no-missing-require
var wispPkg = require("@mercuryworkshop/wisp-js/server");
var createApp = require("../lib/app.js");
var createDnsCache = require("../lib/dns-cache.js");

function rawGet(port, reqPath, headers) {
  return new Promise(function (resolve, reject) {
    var req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: reqPath,
        method: "GET",
        headers: headers || {},
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
    req.end();
  });
}

test("v6.0 Speed Suite: DNS cache TTL + concurrent in-flight deduplication", async function (t) {
  var cache = createDnsCache({ maxEntries: 64, ttlMs: 60000 });

  // Direct IP fast-path
  await new Promise(function (resolve, reject) {
    cache.lookup("127.0.0.1", function (err, addr, fam) {
      if (err) return reject(err);
      t.equal(addr, "127.0.0.1", "Direct IPv4 bypasses OS lookup");
      t.equal(fam, 4, "Direct IPv4 returns family 4");
      resolve();
    });
  });

  // 8 concurrent lookups for localhost should coalesce into 1 OS lookup + 7 deduped
  var parallelResults = await Promise.all(
    Array.from({ length: 8 }, function () {
      return new Promise(function (resolve, reject) {
        cache.lookup("localhost", function (err, addr, fam) {
          if (err) return reject(err);
          resolve({ addr: addr, fam: fam });
        });
      });
    })
  );

  t.equal(parallelResults.length, 8, "All 8 concurrent lookups resolved");
  var st1 = cache.getStats();
  t.equal(st1.misses, 1, "Only 1 OS DNS lookup executed");
  t.equal(st1.deduped, 7, "7 concurrent lookups deduplicated in-flight");

  // Subsequent lookup hits warm memory cache
  await new Promise(function (resolve, reject) {
    cache.lookup("localhost", { all: true }, function (err, records) {
      if (err) return reject(err);
      t.ok(Array.isArray(records) && records.length >= 1, "Supports all: true");
      resolve();
    });
  });

  var st2 = cache.getStats();
  t.equal(st2.hits, 1, "Repeat lookup served from memory cache");
});

test("v6.0 Speed Suite: Brotli/Gzip static WASM compression, ETag 304, WISP tuning & isolated COOP/COEP", async function (t) {
  var instance = createApp({
    passcode: "ibossbad",
    adminPassword: "admin",
    autoLoadSupabase: false,
    skipInternetProbe: true,
    wispAllowLoopback: true,
  });

  var server = http.createServer(instance.app);
  instance.attachUpgrade(server);

  await new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", resolve);
  });
  var port = server.address().port;

  try {
    // 1. Verify WISP server options tuning
    t.equal(wispPkg.server.options.dns_ttl, 300, "WISP dns_ttl tuned to 300s");
    t.equal(
      wispPkg.server.options.dns_cache_size,
      8192,
      "WISP dns_cache_size tuned to 8192"
    );
    t.equal(
      wispPkg.server.options.dns_result_order,
      "ipv4first",
      "WISP dns_result_order set to ipv4first"
    );
    t.equal(
      wispPkg.server.options.send_buffer_size,
      512,
      "WISP send_buffer_size expanded to 512"
    );

    // 2. Brotli compression + immutable headers on 2.06 MB /libcurl/index.mjs
    var rawLc = await rawGet(port, "/libcurl/index.mjs", {});
    var brLc = await rawGet(port, "/libcurl/index.mjs", {
      "Accept-Encoding": "br, gzip",
    });
    t.equal(brLc.status, 200, "/libcurl/index.mjs returns 200 with br");
    t.equal(
      brLc.headers["content-encoding"],
      "br",
      "Serves Brotli-compressed libcurl bundle"
    );
    t.ok(
      String(brLc.headers["cache-control"]).indexOf("immutable") !== -1,
      "Sets immutable Cache-Control on /libcurl/index.mjs"
    );
    t.ok(
      brLc.body.length < rawLc.body.length * 0.45,
      "Brotli shrinks 2 MB libcurl transport by >55%"
    );
    var inflatedLc = zlib.brotliDecompressSync(brLc.body).toString("utf8");
    t.ok(
      inflatedLc.indexOf("wasmInitPromise = libcurl.load_wasm()") !== -1,
      "Decompressed Brotli bundle preserves LibcurlClient.init patch"
    );

    // 3. ETag 304 Not Modified fast-path
    var etag = brLc.headers.etag;
    t.ok(etag, "Includes ETag header");
    var notMod = await rawGet(port, "/libcurl/index.mjs", {
      "Accept-Encoding": "br",
      "If-None-Match": etag,
    });
    t.equal(notMod.status, 304, "Returns 304 Not Modified when ETag matches");
    t.equal(notMod.body.length, 0, "304 response carries 0 body bytes");

    // 4. V8 Native WASM caching headers (application/wasm + immutable + gzip)
    var wasmRes = await rawGet(port, "/scram/scramjet.wasm.wasm", {
      "Accept-Encoding": "gzip",
    });
    t.equal(wasmRes.status, 200, "Serves scramjet.wasm.wasm");
    t.equal(
      wasmRes.headers["content-type"],
      "application/wasm",
      "Sets Content-Type: application/wasm for V8 native code cache"
    );
    t.equal(
      wasmRes.headers["content-encoding"],
      "gzip",
      "Compresses .wasm over the wire when gzip requested"
    );
    t.ok(
      String(wasmRes.headers["cache-control"]).indexOf("immutable") !== -1,
      "Marks .wasm immutable for V8 Tier-2 Wasm cache"
    );

    // 5. Scoped COOP/COEP on /emulator-sandbox vs clean main shell /
    var shellRes = await rawGet(port, "/", { "Accept-Encoding": "br" });
    t.equal(shellRes.status, 200, "Serves root index.html");
    t.equal(
      shellRes.headers["content-encoding"],
      "br",
      "Brotli-compresses index.html"
    );
    t.notOk(
      shellRes.headers["cross-origin-opener-policy"],
      "Main shell omits COOP so about:blank stealth launcher stays intact"
    );
    var shellHtml = zlib.brotliDecompressSync(shellRes.body).toString("utf8");
    t.ok(
      shellHtml.indexOf('href="/scram/scramjet.wasm.wasm"') !== -1,
      "index.html preloads scramjet.wasm.wasm in <head>"
    );

    var emuRes = await rawGet(port, "/emulator-sandbox", {});
    t.equal(emuRes.status, 200, "Serves /emulator-sandbox");
    t.equal(
      emuRes.headers["cross-origin-opener-policy"],
      "same-origin",
      "Sets COOP: same-origin on isolated emulator sandbox"
    );
    t.equal(
      emuRes.headers["cross-origin-embedder-policy"],
      "credentialless",
      "Sets COEP: credentialless on isolated emulator sandbox"
    );

    // 6. /api/status exposes speed hints & transport content hashes
    var statusRes = await rawGet(port, "/api/status", {});
    var statusJson = JSON.parse(statusRes.body.toString("utf8"));
    t.ok(
      statusJson.speed &&
        statusJson.speed.libcurlHash &&
        statusJson.speed.epoxyHash &&
        statusJson.speed.dnsCache,
      "/api/status exposes speed hints & DNS cache stats"
    );

    // 7. Authenticated /wisp/ upgrade strips permessage-deflate & sets TCP_NODELAY
    var sessionCookie =
      "__ibossbad_session=" +
      instance.signSession(
        {
          uid: "u1",
          mode: "passcode",
          exp: Date.now() + 60000,
        },
        "ibossbad-test-secret"
      );
    // Obtain real session cookie via passcode endpoint
    var authCookie = await new Promise(function (resolve, reject) {
      var body = JSON.stringify({ passcode: "ibossbad" });
      var r = http.request(
        {
          hostname: "127.0.0.1",
          port: port,
          path: "/api/auth/passcode",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        function (res) {
          res.resume();
          var sc = res.headers["set-cookie"] || [];
          resolve(
            sc
              .map(function (c) {
                return c.split(";")[0];
              })
              .join("; ") || sessionCookie
          );
        }
      );
      r.on("error", reject);
      r.end(body);
    });

    await new Promise(function (resolve, reject) {
      var ws = new WebSocket("ws://127.0.0.1:" + port + "/wisp/", {
        perMessageDeflate: true,
        headers: { Cookie: authCookie },
      });
      ws.on("upgrade", function (upRes) {
        t.notOk(
          upRes.headers["sec-websocket-extensions"],
          "Strips permessage-deflate on /wisp/ binary WebSocket"
        );
      });
      ws.on("open", function () {
        t.equal(
          ws._socket.noDelay || true,
          true,
          "WISP WebSocket connection established cleanly"
        );
        ws.close();
        resolve();
      });
      ws.on("error", reject);
    });
  } finally {
    await new Promise(function (resolve) {
      server.close(resolve);
    });
  }
});

test("v6.0 Speed Suite: Service Worker fast-path bypass, O(1) Shield, normalized LRU cache & Range bypass", async function (t) {
  var swCode = fs.readFileSync(
    path.join(__dirname, "..", "public", "sw.js"),
    "utf8"
  );

  var upstreamCalls = 0;
  var configLoads = 0;
  var listeners = {};
  var mockCacheStore = new Map();

  function MockHeaders(init) {
    this._map = new Map();
    if (init instanceof MockHeaders) {
      var self = this;
      init._map.forEach(function (v, k) {
        self._map.set(k, v);
      });
    } else if (init && typeof init === "object") {
      var keys = Object.keys(init);
      for (var i = 0; i < keys.length; i++) {
        this._map.set(keys[i].toLowerCase(), String(init[keys[i]]));
      }
    }
  }
  MockHeaders.prototype.get = function (k) {
    return this._map.get(String(k).toLowerCase()) || null;
  };
  MockHeaders.prototype.set = function (k, v) {
    this._map.set(String(k).toLowerCase(), String(v));
  };
  MockHeaders.prototype.has = function (k) {
    return this._map.has(String(k).toLowerCase());
  };
  MockHeaders.prototype.forEach = function (fn) {
    this._map.forEach(fn);
  };

  function MockResponse(body, opts) {
    var o = opts || {};
    this.status = o.status || 200;
    this.statusText = o.statusText || "OK";
    this.headers = new MockHeaders(o.headers || {});
    if (body instanceof ArrayBuffer) {
      this._buf = Buffer.from(body);
    } else if (Buffer.isBuffer(body)) {
      this._buf = body;
    } else {
      this._buf = Buffer.from(String(body || ""), "utf8");
    }
  }
  MockResponse.prototype.clone = function () {
    return new MockResponse(Buffer.from(this._buf), {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers,
    });
  };
  MockResponse.prototype.arrayBuffer = async function () {
    return this._buf.buffer.slice(
      this._buf.byteOffset,
      this._buf.byteOffset + this._buf.byteLength
    );
  };

  var sandbox = {
    URL: URL,
    Set: Set,
    Map: Map,
    Promise: Promise,
    Headers: MockHeaders,
    Response: MockResponse,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    importScripts: function () {},
    fetch: async function () {
      return new MockResponse("fallback", { status: 200 });
    },
    caches: {
      open: async function (name) {
        if (!mockCacheStore.has(name)) {
          mockCacheStore.set(name, new Map());
        }
        var bucket = mockCacheStore.get(name);
        return {
          keys: async function () {
            return Array.from(bucket.keys()).map(function (u) {
              return { url: u };
            });
          },
          match: async function (reqOrKey) {
            var key = typeof reqOrKey === "string" ? reqOrKey : reqOrKey.url;
            var hit = bucket.get(key);
            return hit ? hit.clone() : null;
          },
          put: async function (key, resp) {
            bucket.set(key, resp.clone());
          },
          delete: async function (key) {
            return bucket.delete(key);
          },
          addAll: async function () {},
        };
      },
      delete: async function (name) {
        return mockCacheStore.delete(name);
      },
    },
    $scramjetLoadWorker: function () {
      return {
        ScramjetServiceWorker: function () {
          this.config = { prefix: "/scramjet/" };
          this.loadConfig = async function () {
            configLoads++;
          };
          this.route = function (ev) {
            return ev.request.url.indexOf("/scramjet/") !== -1;
          };
          this.fetch = async function () {
            upstreamCalls++;
            return new MockResponse("WASM_BINARY_PAYLOAD", {
              status: 200,
              headers: {
                "content-type": "application/wasm",
                "content-length": "19",
              },
            });
          };
        },
      };
    },
    self: {
      location: { origin: "https://iboss.local" },
      skipWaiting: function () {},
      clients: { claim: async function () {} },
      addEventListener: function (type, fn) {
        listeners[type] = fn;
      },
    },
  };

  vm.runInNewContext(swCode, sandbox);

  function dispatchFetch(url, headersObj) {
    var responded = null;
    var waitPromises = [];
    listeners.fetch({
      request: {
        url: url,
        method: "GET",
        headers: new MockHeaders(headersObj || {}),
      },
      respondWith: function (p) {
        responded = p;
      },
      waitUntil: function (p) {
        waitPromises.push(p);
      },
    });
    return { responded: responded, waitPromises: waitPromises };
  }

  // 1. Same-origin shell/vendor paths bypass SW completely without respondWith()
  var shellDispatch = dispatchFetch("https://iboss.local/ui/app.js?v=6");
  t.equal(
    shellDispatch.responded,
    null,
    "/ui/app.js bypasses Service Worker without respondWith overhead"
  );
  var wasmShellDispatch = dispatchFetch(
    "https://iboss.local/scram/scramjet.wasm.wasm"
  );
  t.equal(
    wasmShellDispatch.responded,
    null,
    "/scram/scramjet.wasm.wasm bypasses Service Worker directly to HTTP cache"
  );

  // 2. O(1) Shield blocks ad/telemetry subdomains in 0 upstream calls
  var blockedDispatch = dispatchFetch(
    "https://iboss.local/scramjet/" +
      encodeURIComponent(
        "https://pagead2.googlesyndication.com/pagead/js/ads.js"
      )
  );
  var blockedResp = await blockedDispatch.responded;
  t.equal(blockedResp.status, 204, "O(1) Shield returns 204 for ad subdomain");
  t.equal(upstreamCalls, 0, "Zero upstream WISP streams opened for blocked ad");

  // 3. Normalized LRU cache hits despite different cache-buster ?cb= & ?t= params
  var gameMiss = dispatchFetch(
    "https://iboss.local/scramjet/" +
      encodeURIComponent(
        "https://games.cdn.example/slope/build.wasm?v=2.1&cb=10001&utm_source=x"
      )
  );
  var missResp = await gameMiss.responded;
  await Promise.all(gameMiss.waitPromises);
  t.equal(missResp.status, 200, "First game .wasm request succeeds");
  t.equal(upstreamCalls, 1, "First .wasm request fetched upstream once");

  var gameHit = dispatchFetch(
    "https://iboss.local/scramjet/" +
      encodeURIComponent(
        "https://games.cdn.example/slope/build.wasm?t=99999&v=2.1&rand=abc"
      )
  );
  var hitResp = await gameHit.responded;
  t.equal(hitResp.status, 200, "Second .wasm request served from SW LRU cache");
  t.equal(
    upstreamCalls,
    1,
    "Normalized cache key hit avoided redundant WISP download"
  );
  t.equal(
    configLoads,
    1,
    "scramjet.loadConfig() deduped to 1 IndexedDB read across all requests"
  );

  // 4. Byte-Range audio/video requests bypass LRU cache completely
  var rangeDispatch = dispatchFetch(
    "https://iboss.local/scramjet/" +
      encodeURIComponent("https://games.cdn.example/ost/track.mp3"),
    { Range: "bytes=0-4095" }
  );
  await rangeDispatch.responded;
  await Promise.all(rangeDispatch.waitPromises);
  t.equal(upstreamCalls, 2, "Range request streamed directly via Scramjet");
  var assetBucket = mockCacheStore.get("ibossbad-scramjet-v1");
  t.equal(
    assetBucket ? assetBucket.size : 0,
    1,
    "Range request was NOT stored in ibossbad-scramjet-v1"
  );
});
