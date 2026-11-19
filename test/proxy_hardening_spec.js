"use strict";

var fs = require("fs");
var path = require("path");
var http = require("http");
var https = require("https");
var WebSocket = require("ws");
var test = require("tap").test;
// eslint-disable-next-line node/no-missing-require
var wispPkg = require("@mercuryworkshop/wisp-js/server");
var createApp = require("../lib/app.js");
var publicIpPolicy = require("../lib/public-ip-policy.js");

var testKey = fs.readFileSync(
  path.join(__dirname, "fixtures", "proxy-origin-test-only.key")
);
var testCert = fs.readFileSync(
  path.join(__dirname, "fixtures", "proxy-origin-test-only.crt")
);

function listen(server) {
  return new Promise(function (resolve, reject) {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise(function (resolve) {
    if (!server || !server.listening) return resolve();
    server.close(resolve);
  });
}

function requestPath(port, reqPath) {
  return new Promise(function (resolve, reject) {
    var req = http.get(
      {
        hostname: "127.0.0.1",
        port: port,
        path: reqPath,
      },
      function (res) {
        var chunks = [];
        res.on("data", function (chunk) {
          chunks.push(chunk);
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
  });
}

function requestProxy(port, upstreamPort, protocol, hostname) {
  return requestPath(
    port,
    "/proxy/" +
      (protocol || "https") +
      "://" +
      (hostname || "127.0.0.1") +
      ":" +
      upstreamPort +
      "/tls-check"
  );
}

function createProxyServer(options) {
  var instance = createApp(
    Object.assign(
      {
        authRequired: false,
        autoLoadSupabase: false,
        skipInternetProbe: true,
      },
      options || {}
    )
  );
  var server = http.createServer(instance.app);
  instance.attachUpgrade(server);
  return server;
}

test("public IP policy rejects special-use ranges and pins validated DNS answers", async function (t) {
  var blockedAddresses = [
    "0.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "2001::1",
    "2002::1",
    "64:ff9b::a00:1",
  ];
  blockedAddresses.forEach(function (address) {
    t.notOk(
      publicIpPolicy.isPublicAddress(address),
      "blocks non-public address " + address
    );
  });
  t.ok(publicIpPolicy.isPublicAddress("8.8.8.8"), "allows public IPv4");
  t.ok(
    publicIpPolicy.isPublicAddress("2606:4700:4700::1111"),
    "allows public IPv6"
  );
  t.ok(
    publicIpPolicy.isPublicAddress("::ffff:8.8.8.8"),
    "classifies IPv4-mapped IPv6 by its embedded IPv4 address"
  );

  var lookupCalls = 0;
  var resolver = function (hostname, options, callback) {
    lookupCalls++;
    t.equal(
      options.all,
      true,
      "resolves a complete address set before filtering"
    );
    if (hostname === "private.test") {
      return callback(null, [{ address: "169.254.169.254", family: 4 }]);
    }
    return callback(null, [
      { address: "127.0.0.1", family: 4 },
      { address: "8.8.8.8", family: 4 },
      { address: "2001:db8::1", family: 6 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
  };
  var lookup = publicIpPolicy.createPublicLookup(resolver);
  var allowed = await new Promise(function (resolve) {
    lookup("mixed.test", { all: true }, function (err, records) {
      resolve({ error: err, records: records });
    });
  });
  t.notOk(allowed.error, "keeps a mixed public/private DNS response usable");
  t.same(
    allowed.records.map(function (record) {
      return record.address;
    }),
    ["8.8.8.8", "2606:4700:4700::1111"],
    "returns only globally routable DNS answers"
  );

  var blocked = await new Promise(function (resolve) {
    lookup("private.test", { all: true }, function (err, records) {
      resolve({ error: err, records: records });
    });
  });
  t.equal(
    blocked.error && blocked.error.code,
    "EACCES",
    "blocks private-only DNS answers"
  );
  t.notOk(blocked.records, "does not return blocked addresses to the caller");

  var pinnedLookup = publicIpPolicy.createPinnedLookup(allowed.records[0]);
  var pinned = await new Promise(function (resolve) {
    pinnedLookup("changed.example", { all: true }, function (err, records) {
      resolve({ error: err, records: records });
    });
  });
  t.notOk(
    pinned.error,
    "pinned lookup does not perform a second DNS resolution"
  );
  t.same(
    pinned.records,
    [{ address: "8.8.8.8", family: 4 }],
    "returns the exact validated address for the connection"
  );
  t.equal(
    lookupCalls,
    2,
    "pinned connection did not call the DNS resolver again"
  );
  t.end();
});

test("legacy proxy and safe downloads reject private destinations by default", async function (t) {
  var targetHits = 0;
  var targetWebSocketHits = 0;
  var target = http.createServer(function (_req, res) {
    targetHits++;
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("private fixture reached");
  });
  var targetWebSocketServer = new WebSocket.Server({ server: target });
  targetWebSocketServer.on("connection", function (socket) {
    targetWebSocketHits++;
    socket.close();
  });
  var blockedServer = createProxyServer();
  var compatibleServer = createProxyServer({ allowPrivateProxyTargets: true });

  try {
    await listen(target);
    await Promise.all([listen(blockedServer), listen(compatibleServer)]);

    var blockedProxy = await requestProxy(
      blockedServer.address().port,
      target.address().port,
      "http"
    );
    t.equal(
      blockedProxy.status,
      502,
      "default /proxy/ blocks loopback destinations"
    );
    t.equal(
      targetHits,
      0,
      "blocked proxy request never reaches the private origin"
    );

    var blockedWebSocketStatus = await new Promise(function (resolve, reject) {
      var settled = false;
      var ws = new WebSocket(
        "ws://127.0.0.1:" +
          blockedServer.address().port +
          "/proxy/http://127.0.0.1:" +
          target.address().port +
          "/socket"
      );
      function finish(err, status) {
        if (settled) return;
        settled = true;
        if (err) return reject(err);
        resolve(status);
      }
      ws.once("unexpected-response", function (_req, res) {
        res.resume();
        finish(null, res.statusCode);
      });
      ws.once("open", function () {
        ws.terminate();
        finish(null, 101);
      });
      ws.once("error", function (err) {
        finish(err);
      });
    });
    t.equal(
      blockedWebSocketStatus,
      403,
      "legacy WebSocket proxy rejects loopback IP literals"
    );
    t.equal(
      targetWebSocketHits,
      0,
      "blocked WebSocket upgrade never reaches the private origin"
    );

    var blockedHostname = await requestProxy(
      blockedServer.address().port,
      target.address().port,
      "http",
      "localhost"
    );
    t.equal(
      blockedHostname.status,
      502,
      "filters DNS names that resolve only to loopback"
    );
    t.equal(
      targetHits,
      0,
      "loopback DNS result never reaches the private origin"
    );

    var download = await requestPath(
      blockedServer.address().port,
      "/api/safe-download?url=" +
        encodeURIComponent(
          "http://localhost:" + target.address().port + "/file"
        )
    );
    t.equal(download.status, 403, "safe-download blocks private destinations");
    t.equal(targetHits, 0, "blocked download never reaches the private origin");

    var compatibleProxy = await requestProxy(
      compatibleServer.address().port,
      target.address().port,
      "http"
    );
    t.equal(
      compatibleProxy.status,
      200,
      "trusted local deployments can explicitly allow LAN proxy targets"
    );
    t.equal(compatibleProxy.body, "private fixture reached");
    t.equal(targetHits, 1, "the explicit opt-in reaches the local test origin");
  } finally {
    await Promise.all([
      close(blockedServer),
      close(compatibleServer),
      close(target),
    ]);
  }
});

test("legacy HTTPS proxy verifies upstream TLS by default with an explicit opt-out", async function (t) {
  var previousStrictSsl = process.env.PROXY_STRICT_SSL;
  var upstream = https.createServer(
    { key: testKey, cert: testCert },
    function (_req, res) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("test upstream response");
    }
  );
  var strictServer = null;
  var compatibilityServer = null;

  try {
    await listen(upstream);

    delete process.env.PROXY_STRICT_SSL;
    strictServer = createProxyServer({ allowPrivateProxyTargets: true });
    await listen(strictServer);
    var strictResponse = await requestProxy(
      strictServer.address().port,
      upstream.address().port
    );
    t.equal(
      strictResponse.status,
      502,
      "rejects a self-signed origin certificate when strict TLS is the default"
    );

    process.env.PROXY_STRICT_SSL = "false";
    compatibilityServer = createProxyServer({ allowPrivateProxyTargets: true });
    await listen(compatibilityServer);
    var compatibilityResponse = await requestProxy(
      compatibilityServer.address().port,
      upstream.address().port
    );
    t.equal(
      compatibilityResponse.status,
      200,
      "PROXY_STRICT_SSL=false preserves an explicit legacy compatibility opt-out"
    );
    t.equal(
      compatibilityResponse.body,
      "test upstream response",
      "receives the origin response when verification is intentionally disabled"
    );
  } finally {
    await Promise.all([
      close(strictServer),
      close(compatibilityServer),
      close(upstream),
    ]);
    if (previousStrictSsl === undefined) {
      delete process.env.PROXY_STRICT_SSL;
    } else {
      process.env.PROXY_STRICT_SSL = previousStrictSsl;
    }
  }
});

test("Wisp relay stream limits are bounded by default and configurable", function (t) {
  var previousTotal = process.env.WISP_STREAM_LIMIT_TOTAL;
  var previousPerHost = process.env.WISP_STREAM_LIMIT_PER_HOST;

  try {
    delete process.env.WISP_STREAM_LIMIT_TOTAL;
    delete process.env.WISP_STREAM_LIMIT_PER_HOST;
    createApp({ autoLoadSupabase: false, skipInternetProbe: true });
    t.equal(
      wispPkg.server.options.stream_limit_total,
      256,
      "caps open streams per Wisp connection at 256 by default"
    );
    t.equal(
      wispPkg.server.options.stream_limit_per_host,
      64,
      "caps streams to one host per Wisp connection at 64 by default"
    );

    process.env.WISP_STREAM_LIMIT_TOTAL = "48";
    process.env.WISP_STREAM_LIMIT_PER_HOST = "12";
    createApp({ autoLoadSupabase: false, skipInternetProbe: true });
    t.equal(
      wispPkg.server.options.stream_limit_total,
      48,
      "supports a positive WISP_STREAM_LIMIT_TOTAL override"
    );
    t.equal(
      wispPkg.server.options.stream_limit_per_host,
      12,
      "supports a positive WISP_STREAM_LIMIT_PER_HOST override"
    );

    createApp({
      autoLoadSupabase: false,
      skipInternetProbe: true,
      wispStreamLimitTotal: 96,
      wispStreamLimitPerHost: 24,
    });
    t.equal(
      wispPkg.server.options.stream_limit_total,
      96,
      "createApp options take precedence over environment stream limits"
    );
    t.equal(
      wispPkg.server.options.stream_limit_per_host,
      24,
      "createApp can tune the per-host stream limit"
    );
  } finally {
    if (previousTotal === undefined) {
      delete process.env.WISP_STREAM_LIMIT_TOTAL;
    } else {
      process.env.WISP_STREAM_LIMIT_TOTAL = previousTotal;
    }
    if (previousPerHost === undefined) {
      delete process.env.WISP_STREAM_LIMIT_PER_HOST;
    } else {
      process.env.WISP_STREAM_LIMIT_PER_HOST = previousPerHost;
    }
  }

  t.end();
});
