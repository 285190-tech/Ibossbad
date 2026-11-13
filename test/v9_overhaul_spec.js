"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var http = require("http");
var test = require("tap").test;
var parseUrl = require("../lib/parse-url.js");
var createApp = require("../lib/app.js");

function httpReq(port, method, reqPath, bodyObj, extraHeaders) {
  return new Promise(function (resolve, reject) {
    var payload = bodyObj ? JSON.stringify(bodyObj) : null;
    var headers = Object.assign({}, extraHeaders || {});
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
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

test("v9.0 Mega-Overhaul: LRU parseUrl, scrubbed README credentials, Launchpad hub, Cine-Cloud favorites & new themes", async function (t) {
  // 1) Verify LRU WHATWG parseUrl helper
  var full = parseUrl(
    "https://user:pass@Example.COM:8443/a/b?x=1&x=2&y=hi#s1",
    true
  );
  t.equal(full.protocol, "https:", "Parses protocol");
  t.equal(full.hostname, "example.com", "Lowercases hostname");
  t.equal(full.port, "8443", "Extracts port");
  t.equal(full.auth, "user:pass", "Extracts decoded auth");
  t.equal(full.path, "/a/b?x=1&x=2&y=hi", "Builds path with search");
  t.equal(full.hash, "#s1", "Extracts hash");
  t.same(full.query.x, ["1", "2"], "Supports multi-value query params");
  t.equal(full.query.y, "hi", "Parses single query param");

  // Relative /proxy/http://... paths preserve raw characters & clone safely
  var rel1 = parseUrl("/proxy/http://site.example/foo//bar?q=1#top");
  t.equal(
    rel1.path,
    "/proxy/http://site.example/foo//bar?q=1",
    "Preserves /proxy/http:// relative path byte-for-byte"
  );
  rel1.pathname = "/mutated";
  var rel2 = parseUrl("/proxy/http://site.example/foo//bar?q=1#top");
  t.equal(
    rel2.pathname,
    "/proxy/http://site.example/foo//bar",
    "LRU cache returns isolated clones unaffected by caller mutation"
  );

  // 2) Verify readme.md has scrubbed all default passwords
  var readmeSrc = fs.readFileSync(
    path.join(__dirname, "..", "readme.md"),
    "utf8"
  );
  t.notMatch(
    readmeSrc,
    /ibossadmin|default passcode:\s*`?ibossbad/i,
    "readme.md does not expose default admin or gate passwords"
  );
  t.match(
    readmeSrc,
    /ADMIN_PASSWORD/,
    "readme.md documents ADMIN_PASSWORD environment variable configuration"
  );

  // 3) Verify Default Admin Password warning flag in /api/admin/dashboard
  var defaultInstance = createApp({
    passcode: "custompass",
    autoLoadSupabase: false,
    skipInternetProbe: true,
  });
  var customInstance = createApp({
    passcode: "custompass",
    adminPassword: "strong-custom-secret-99",
    autoLoadSupabase: false,
    skipInternetProbe: true,
  });

  var srvDefault = http.createServer(defaultInstance.app);
  var srvCustom = http.createServer(customInstance.app);
  await new Promise(function (r) {
    srvDefault.listen(0, "127.0.0.1", r);
  });
  await new Promise(function (r) {
    srvCustom.listen(0, "127.0.0.1", r);
  });

  try {
    var pDef = srvDefault.address().port;
    var pCus = srvCustom.address().port;

    var loginDef = await httpReq(pDef, "POST", "/api/admin/login", {
      password: process.env.ADMIN_PASSWORD || "ibossadmin",
    });
    var snapDef = JSON.parse(loginDef.body.toString("utf8")).snapshot;
    if (!process.env.ADMIN_PASSWORD) {
      t.equal(
        snapDef.config.defaultPasswordWarning,
        true,
        "Flags defaultPasswordWarning=true when fallback admin password is in use"
      );
    }

    var loginCus = await httpReq(pCus, "POST", "/api/admin/login", {
      password: "strong-custom-secret-99",
    });
    var snapCus = JSON.parse(loginCus.body.toString("utf8")).snapshot;
    t.equal(
      snapCus.config.defaultPasswordWarning,
      false,
      "Clears defaultPasswordWarning=false when custom admin password is set"
    );

    // 4) Verify index.html v9.0 Launchpad, Surprise Game & new themes
    var rootRes = await httpReq(pCus, "GET", "/");
    var html = rootRes.body.toString("utf8");
    t.match(
      html,
      /iboss:\/\/launchpad/,
      "New Tab includes Focus Launchpad jump pill"
    );
    t.match(html, /heroRandomGameBtn/, "New Tab includes Surprise Game pill");
    t.match(html, /value="aurora"/, "Includes Aurora Borealis theme");
    t.match(html, /value="sakura"/, "Includes Sakura Dusk theme");
    t.match(html, /value="solarflare"/, "Includes Solar Amber theme");
  } finally {
    await new Promise(function (r) {
      srvDefault.close(r);
    });
    await new Promise(function (r) {
      srvCustom.close(r);
    });
  }

  // 5) Verify iboss://launchpad renders inside internal-pages.js
  var ipSrc = fs.readFileSync(
    path.join(__dirname, "..", "public", "internal-pages.js"),
    "utf8"
  );
  var storeMap = {};
  var mockContainer = {
    innerHTML: "",
    isConnected: true,
    querySelector: function () {
      return {
        addEventListener: function () {},
        value: "",
      };
    },
    querySelectorAll: function () {
      return [];
    },
  };
  var ipSandbox = {
    window: {},
    localStorage: {
      getItem: function (k) {
        return storeMap[k] || null;
      },
      setItem: function (k, v) {
        storeMap[k] = String(v);
      },
      removeItem: function (k) {
        delete storeMap[k];
      },
      length: 0,
      key: function () {
        return null;
      },
    },
    navigator: {
      getGamepads: function () {
        return [];
      },
    },
    URL: URL,
    Blob: Buffer,
    setInterval: setInterval,
    clearInterval: clearInterval,
  };
  ipSandbox.window = ipSandbox;
  vm.runInNewContext(ipSrc, ipSandbox);

  var ipCtrl = ipSandbox.window.IbossInternalPages.create({
    navigate: function () {},
    toast: function () {},
  });
  var renderedLp = ipCtrl.render("iboss://launchpad", mockContainer);
  t.equal(renderedLp, true, "Routes iboss://launchpad cleanly");
  t.match(
    mockContainer.innerHTML,
    /Pomodoro Sprint Timer/,
    "Renders Pomodoro Sprint Timer in iboss://launchpad"
  );
  t.match(
    mockContainer.innerHTML,
    /Procedural Focus Soundscape/,
    "Renders Procedural WebAudio Focus Soundscape mixer"
  );
  t.match(
    mockContainer.innerHTML,
    /Session Task Board/,
    "Renders persistent Session Task Board"
  );

  // 6) Verify Cine-Cloud Favorites & Surprise AAA button
  var ccSrc = fs.readFileSync(
    path.join(__dirname, "..", "public", "cine-cloud.js"),
    "utf8"
  );
  t.match(
    ccSrc,
    /ccRandomPickBtn/,
    "Cine-Cloud top bar includes Surprise AAA button"
  );
  t.match(
    ccSrc,
    /ccToggleFavBtn/,
    "Cine-Cloud game modal includes Favorite toggle button"
  );
});
