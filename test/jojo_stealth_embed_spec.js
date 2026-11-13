"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var http = require("http");
var test = require("tap").test;
var createApp = require("../lib/app.js");

var JOJO_UPSTREAM =
  "https://www.retrogames.cc/embed/8843-jojos-bizarre-adventure%3A-heritage-for-the-future-jojo-no-kimyou-na-bouken%3A-mirai-e-no-isan-japan-990927-no-cd.html";

var FRIEND_IFRAME_SNIPPET =
  '<iframe src="https://www.retrogames.cc/embed/8843-jojos-bizarre-adventure%3A-heritage-for-the-future-jojo-no-kimyou-na-bouken%3A-mirai-e-no-isan-japan-990927-no-cd.html" width="600" height="450" frameborder="no" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" scrolling="no" allow="cross-origin-isolated"></iframe>';

function rawHttpRequest(port, reqPath, options) {
  var opts = options || {};
  return new Promise(function (resolve, reject) {
    var req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: reqPath,
        method: opts.method || "GET",
        headers: opts.headers || {},
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
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    if (opts.body) {
      req.write(opts.body);
    }
    req.end();
  });
}

test("JoJo HFTF catalog search, iframe snippet healing & stealth perceived link", function (t) {
  var catalogCode = fs.readFileSync(
    path.join(__dirname, "../public/games-catalog.js"),
    "utf8"
  );
  var sandbox = { window: {} };
  vm.runInNewContext(catalogCode, sandbox);
  var catalog = sandbox.window.IbossGamesCatalog;
  t.ok(catalog, "IbossGamesCatalog initialized");

  ["jojo", "jjba", "hftf", "heritage for the future", "jotaro", "dio"].forEach(
    function (q) {
      var hits = catalog.search(q, "all", []);
      t.ok(hits.length >= 1, "Search finds JoJo HFTF for query: " + q);
      t.equal(
        hits[0].url,
        "iboss://jojo",
        "Catalog entry uses cloaked internal URL iboss://jojo"
      );
      t.equal(
        hits[0].url.indexOf("retrogames.cc"),
        -1,
        "Catalog URL never exposes retrogames.cc"
      );
    }
  );

  // Admin/custom game healing for raw URL and raw <iframe> snippet
  var healedCustom = catalog.getAll([
    { title: "Raw JoJo URL", url: JOJO_UPSTREAM },
    { title: "Friend Snippet", url: FRIEND_IFRAME_SNIPPET },
  ]);
  t.equal(
    healedCustom[0].url,
    "iboss://jojo",
    "Raw retrogames.cc URL heals to iboss://jojo"
  );
  t.equal(
    healedCustom[1].url,
    "iboss://jojo",
    "Raw <iframe> HTML snippet heals to iboss://jojo"
  );
  t.end();
});

test("Scramjet u1_ stealth codec & Service Worker decodeScramjetTarget preserve %3A and hide domain", function (t) {
  var sjEngineCode = fs.readFileSync(
    path.join(__dirname, "../public/scramjet-engine.js"),
    "utf8"
  );
  var capturedCodec = null;
  var winSandbox = {
    window: {},
    isSecureContext: true,
    location: { protocol: "https:", host: "study.example" },
    performance: { now: Date.now },
    WebSocket: function () {
      var self = this;
      setTimeout(function () {
        if (self.onopen) self.onopen();
      }, 1);
      this.close = function () {};
    },
    setInterval: function () {
      return 1;
    },
    clearInterval: function () {},
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    BareMux: {
      BareClient: function () {},
      BareMuxConnection: function () {
        this.setTransport = function () {
          return Promise.resolve();
        };
      },
    },
    navigator: {
      serviceWorker: {
        controller: {},
        addEventListener: function () {},
        register: function () {
          return Promise.resolve();
        },
        ready: Promise.resolve(),
      },
    },
    $scramjetLoadController: function () {
      return {
        ScramjetController: function (cfg) {
          capturedCodec = cfg.codec;
          this.addEventListener = function () {};
          this.init = function () {
            return Promise.resolve();
          };
        },
      };
    },
  };
  winSandbox.window = winSandbox;
  vm.runInNewContext(sjEngineCode, winSandbox);

  var api = winSandbox.window.IbossScramjetEngine;
  t.ok(api && api.encodeStealthToken, "Exports encodeStealthToken");

  var engine = api.create({ customWispUrl: "wss://wisp.mercurywork.shop/" });
  return engine.ensureReady().then(function () {
    t.ok(
      capturedCodec && capturedCodec.encode && capturedCodec.decode,
      "ScramjetController configured with custom stealth codec"
    );

    // Reconstruct via Function() exactly as Scramjet's IndexedDB serializer does
    var isolatedEncode = new Function(
      "return (" + capturedCodec.encode.toString() + ")"
    )();
    var isolatedDecode = new Function(
      "return (" + capturedCodec.decode.toString() + ")"
    )();

    t.equal(isolatedEncode(""), "", "Empty string encodes to empty string");
    var encodedJojo = isolatedEncode(JOJO_UPSTREAM);
    t.ok(
      encodedJojo.indexOf("u1_") === 0,
      "Encoded JoJo URL starts with u1_ token prefix"
    );
    ["retrogames", "jojo", "bizarre", "embed", "https", "hvtrs8"].forEach(
      function (word) {
        t.equal(
          encodedJojo.toLowerCase().indexOf(word),
          -1,
          "Perceived token hides keyword: " + word
        );
      }
    );
    t.equal(
      isolatedDecode(encodedJojo),
      JOJO_UPSTREAM,
      "Stealth codec round-trips JoJo URL with %3A colons intact"
    );

    // Verify public/sw.js decodeScramjetTarget handles both u1_ and legacy URLs
    var swCode = fs.readFileSync(
      path.join(__dirname, "../public/sw.js"),
      "utf8"
    );
    var swSandbox = {
      self: {
        location: { origin: "https://study.example" },
        skipWaiting: function () {},
        addEventListener: function () {},
        clients: { claim: function () {} },
      },
      importScripts: function () {},
      $scramjetLoadWorker: function () {
        return {
          ScramjetServiceWorker: function () {
            this.config = { prefix: "/scramjet/" };
            this.loadConfig = function () {
              return Promise.resolve();
            };
            this.route = function () {
              return false;
            };
          },
        };
      },
      URL: URL,
    };
    vm.runInNewContext(swCode, swSandbox);

    t.equal(
      swSandbox.decodeScramjetTarget(
        "https://study.example/scramjet/" + encodedJojo
      ),
      JOJO_UPSTREAM,
      "SW decodeScramjetTarget decodes /scramjet/u1_... back to exact JoJo URL"
    );
    t.equal(
      swSandbox.isShellBypassPath("/lesson-media/unit-8843"),
      true,
      "SW bypasses /lesson-media/unit-8843 directly to server stealth tunnel"
    );
  });
});

test("Closed Shadow DOM stage on iboss://jojo hides inner viewport from outer DOM", function (t) {
  var internalCode = fs.readFileSync(
    path.join(__dirname, "../public/internal-pages.js"),
    "utf8"
  );

  var closedShadowChildren = [];
  var closedShadowMode = null;
  var mountedArgs = null;

  var fakeDoc = {
    createElement: function (tag) {
      var attrs = {};
      return {
        tagName: tag.toUpperCase(),
        className: "",
        textContent: "",
        style: {},
        setAttribute: function (k, v) {
          attrs[k] = v;
        },
        getAttribute: function (k) {
          return attrs[k];
        },
        attrs: attrs,
      };
    },
  };

  var sandbox = {
    window: {
      location: { origin: "https://study.example" },
    },
    document: fakeDoc,
    localStorage: {
      getItem: function () {
        return null;
      },
      setItem: function () {},
    },
  };
  sandbox.window.document = fakeDoc;
  vm.runInNewContext(internalCode, sandbox);

  var hostEl = {
    style: {},
    shadowRoot: null,
    attachShadow: function (opts) {
      closedShadowMode = opts && opts.mode;
      // Per WHATWG DOM spec, mode:'closed' leaves hostEl.shadowRoot === null
      return {
        set innerHTML(_v) {
          closedShadowChildren = [];
        },
        appendChild: function (child) {
          closedShadowChildren.push(child);
        },
      };
    },
  };

  var badgeEl = { textContent: "" };
  var btnStub = {
    textContent: "",
    addEventListener: function () {},
  };

  var container = {
    innerHTML: "",
    querySelector: function (sel) {
      if (sel === "#jojoShadowHost") return hostEl;
      if (sel === "#jojoPerceivedBadge") return badgeEl;
      return btnStub;
    },
  };

  var controller = sandbox.window.IbossInternalPages.create({
    mountStealthEmbed: function (frameEl, targetUrl, mode, onReady) {
      mountedArgs = { frameEl: frameEl, targetUrl: targetUrl, mode: mode };
      onReady("/scramjet/u1_cloakedToken", "scramjet");
    },
    toast: function () {},
  });

  var rendered = controller.render("iboss://jojo", container);
  t.equal(rendered, true, "iboss://jojo renders cleanly");
  t.equal(
    closedShadowMode,
    "closed",
    "Uses Closed Shadow DOM (mode: 'closed') so outer DOM scanners see no iframe"
  );
  t.equal(hostEl.shadowRoot, null, "hostEl.shadowRoot remains null");
  t.equal(
    container.innerHTML.indexOf("<iframe"),
    -1,
    "Outer container HTML contains zero <iframe> tags"
  );
  t.equal(
    container.innerHTML.indexOf("retrogames.cc"),
    -1,
    "Outer container HTML never mentions retrogames.cc"
  );
  t.ok(mountedArgs, "mountStealthEmbed invoked");
  t.equal(
    mountedArgs.targetUrl,
    JOJO_UPSTREAM,
    "Mounts exact JoJo HFTF Japan 990927 No-CD URL"
  );
  t.ok(
    mountedArgs.frameEl
      .getAttribute("allow")
      .indexOf("cross-origin-isolated") !== -1,
    "Inner shadow surface enables cross-origin-isolated permission"
  );
  t.equal(
    mountedArgs.frameEl.getAttribute("allowfullscreen"),
    "true",
    "Inner shadow surface enables allowfullscreen"
  );
  t.end();
});

test("Server stealth tunnel /lesson-media/unit-8843 & /proxy/u1_<token> preserve %3A and never leak upstream URL", async function (t) {
  var upstreamHits = [];
  var upstreamServer = http.createServer(function (req, res) {
    upstreamHits.push(req.url);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      "<html><head><title>CPS3 Mock Stage</title></head><body>ORA ORA</body></html>"
    );
  });
  await new Promise(function (resolve) {
    upstreamServer.listen(0, "127.0.0.1", resolve);
  });
  var upstreamPort = upstreamServer.address().port;

  var interceptedProxyTargets = [];
  var instance = createApp({
    passcode: "jojo123",
    requestMiddleware: [
      function (data) {
        interceptedProxyTargets.push(data.url);
        if (data.url === JOJO_UPSTREAM) {
          data.clientResponse.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
          });
          data.clientResponse.end("<html><body>JOJO STEALTH OK</body></html>");
        }
      },
    ],
  });

  var proxyServer = http.createServer(instance.app);
  await new Promise(function (resolve) {
    proxyServer.listen(0, "127.0.0.1", resolve);
  });
  var proxyPort = proxyServer.address().port;

  t.teardown(function () {
    proxyServer.close();
    upstreamServer.close();
  });

  // 1) Unauthenticated request to /lesson-media/unit-8843 must NOT leak retrogames.cc in Location header
  var unauthRes = await rawHttpRequest(proxyPort, "/lesson-media/unit-8843", {
    headers: { Accept: "text/html" },
  });
  t.equal(
    unauthRes.status,
    302,
    "Unauthenticated /lesson-media/unit-8843 redirects"
  );
  t.equal(
    String(unauthRes.headers.location || "").indexOf("retrogames.cc"),
    -1,
    "Redirect Location header never leaks retrogames.cc"
  );
  t.ok(
    String(unauthRes.headers.location || "").indexOf("iboss%3A%2F%2Fjojo") !==
      -1,
    "Redirect Location preserves perceived iboss://jojo target"
  );

  // Authenticate session
  var loginRes = await rawHttpRequest(proxyPort, "/api/auth/passcode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode: "jojo123" }),
  });
  t.equal(loginRes.status, 200, "Passcode login succeeds");
  var cookieHeader = (loginRes.headers["set-cookie"] || [])[0].split(";")[0];

  // 2) Authenticated /lesson-media/unit-8843 resolves internally to exact JOJO_UPSTREAM with %3A preserved
  var jojoRes = await rawHttpRequest(proxyPort, "/lesson-media/unit-8843", {
    headers: { Cookie: cookieHeader, Accept: "text/html" },
  });
  t.equal(
    jojoRes.status,
    200,
    "Authenticated /lesson-media/unit-8843 succeeds"
  );
  t.ok(
    jojoRes.body.indexOf("JOJO STEALTH OK") !== -1,
    "Serves JoJo embed response through stealth alias"
  );
  t.equal(
    interceptedProxyTargets[0],
    JOJO_UPSTREAM,
    "Preserves %3A colons byte-for-byte in upstream JoJo URL"
  );

  // 3) Authenticated /proxy/u1_<token> proxies end-to-end to local HTTP server with %3A preserved
  var mockUrlWithEncodedColon =
    "http://127.0.0.1:" +
    upstreamPort +
    "/embed/8843-jojos%3A-heritage%3A-mirai.html";
  var key = [90, 51, 113, 25];
  var rawBytes = Buffer.from(mockUrlWithEncodedColon, "utf8");
  var xored = Buffer.allocUnsafe(rawBytes.length);
  for (var i = 0; i < rawBytes.length; i++) {
    xored[i] = rawBytes[i] ^ key[i & 3];
  }
  var u1Token =
    "u1_" +
    xored
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

  var stealthStreamRes = await rawHttpRequest(proxyPort, "/proxy/" + u1Token, {
    headers: { Cookie: cookieHeader, Accept: "text/html" },
  });
  t.equal(stealthStreamRes.status, 200, "/proxy/u1_<token> streams 200 OK");
  t.ok(
    stealthStreamRes.body.indexOf("ORA ORA") !== -1,
    "/proxy/u1_<token> streams upstream HTML body"
  );
  t.equal(
    upstreamHits[0],
    "/embed/8843-jojos%3A-heritage%3A-mirai.html",
    "Upstream HTTP server received exact %3A path without corruption"
  );
});
