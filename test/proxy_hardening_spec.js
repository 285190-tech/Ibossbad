"use strict";

var fs = require("fs");
var path = require("path");
var http = require("http");
var https = require("https");
var net = require("net");
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

function requestProxyWebSocket(proxyPort, targetPort, hostname) {
  return new Promise(function (resolve) {
    var settled = false;
    var ws = new WebSocket(
      "ws://127.0.0.1:" +
        proxyPort +
        "/proxy/http://" +
        (hostname || "127.0.0.1") +
        ":" +
        targetPort +
        "/socket"
    );
    var timer = setTimeout(function () {
      finish({ status: 0, opened: false });
    }, 3000);

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
      resolve(result);
    }

    ws.once("unexpected-response", function (_req, res) {
      res.resume();
      finish({ status: res.statusCode, opened: false });
    });
    ws.once("open", function () {
      finish({ status: 101, opened: true });
    });
    ws.once("error", function () {
      finish({ status: 0, opened: false });
    });
    ws.once("close", function () {
      finish({ status: 0, opened: false });
    });
  });
}

function decodeWispFrame(frame) {
  return wispPkg.packet.WispPacket.parse_all(
    new wispPkg.packet.WispBuffer(new Uint8Array(frame))
  );
}

function createWispConnectPacket(streamId, hostname, port) {
  return new wispPkg.packet.WispPacket({
    type: wispPkg.packet.packet_types.CONNECT,
    stream_id: streamId,
    payload: new wispPkg.packet.ConnectPayload({
      stream_type: wispPkg.packet.stream_types.TCP,
      port: port,
      hostname: hostname,
    }),
  }).serialize().bytes;
}

function openWispClient(port) {
  return new Promise(function (resolve, reject) {
    var ws = new WebSocket("ws://127.0.0.1:" + port + "/wisp/");
    var timer = setTimeout(function () {
      ws.terminate();
      reject(new Error("Timed out waiting for the Wisp handshake."));
    }, 3000);

    ws.on("message", function (frame) {
      var packet;
      try {
        packet = decodeWispFrame(frame);
      } catch (_err) {
        return;
      }
      if (
        packet.type === wispPkg.packet.packet_types.CONTINUE &&
        packet.stream_id === 0
      ) {
        clearTimeout(timer);
        resolve(ws);
      }
    });
    ws.once("error", function (err) {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitForWispClose(ws, streamId) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      ws.removeListener("message", onMessage);
      reject(new Error("Timed out waiting for a Wisp stream close packet."));
    }, 3000);

    function onMessage(frame) {
      var packet;
      try {
        packet = decodeWispFrame(frame);
      } catch (_err) {
        return;
      }
      if (
        packet.type === wispPkg.packet.packet_types.CLOSE &&
        packet.stream_id === streamId
      ) {
        clearTimeout(timer);
        ws.removeListener("message", onMessage);
        resolve(packet.payload.reason);
      }
    }
    ws.on("message", onMessage);
    ws.once("error", function (err) {
      clearTimeout(timer);
      ws.removeListener("message", onMessage);
      reject(err);
    });
  });
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

    var blockedHostnameWebSocket = await requestProxyWebSocket(
      blockedServer.address().port,
      target.address().port,
      "localhost"
    );
    t.equal(
      blockedHostnameWebSocket.status,
      403,
      "hostname-based WebSocket upgrades reject private DNS answers"
    );
    t.notOk(
      blockedHostnameWebSocket.opened,
      "private hostname WebSocket never completes its upgrade"
    );
    t.equal(
      targetWebSocketHits,
      0,
      "private hostname WebSocket never reaches the private origin"
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

test("MGG mirrors filter and pin public DNS by default", async function (t) {
  var targetHits = 0;
  var target = http.createServer(function (_req, res) {
    targetHits++;
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("private mirror fixture");
  });
  var blockedServer = null;
  var trustedFixtureServer = null;

  try {
    await listen(target);
    blockedServer = createProxyServer({
      mggMirrors: ["http://localhost:" + target.address().port + "/"],
    });
    trustedFixtureServer = createProxyServer({
      mggMirrors: ["http://127.0.0.1:" + target.address().port + "/"],
      allowPrivateMggTargets: true,
    });
    await Promise.all([listen(blockedServer), listen(trustedFixtureServer)]);

    var blockedResponse = await requestPath(
      blockedServer.address().port,
      "/mgg-games/fixture/"
    );
    t.equal(
      blockedResponse.status,
      502,
      "default MGG mirror rejects a hostname that resolves privately"
    );
    t.equal(
      targetHits,
      0,
      "blocked MGG request never reaches the local mirror"
    );

    var fixtureResponse = await requestPath(
      trustedFixtureServer.address().port,
      "/mgg-games/fixture/"
    );
    t.equal(
      fixtureResponse.status,
      200,
      "trusted test fixtures can explicitly opt into private MGG targets"
    );
    t.equal(fixtureResponse.body, "private mirror fixture");
    t.equal(
      targetHits,
      1,
      "only the explicit fixture opt-in reaches the mirror"
    );
  } finally {
    await Promise.all([
      close(blockedServer),
      close(trustedFixtureServer),
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

test("self-hosted Wisp filters and pins destination addresses", async function (t) {
  var targetHits = 0;
  var target = net.createServer(function (socket) {
    targetHits++;
    socket.end();
  });
  var relay = createProxyServer();
  var ws = null;

  try {
    await Promise.all([listen(target), listen(relay)]);
    t.equal(
      wispPkg.server.options.allow_private_ips,
      false,
      "self-hosted Wisp denies private IPs"
    );
    t.equal(
      wispPkg.server.options.allow_loopback_ips,
      false,
      "self-hosted Wisp denies loopback IPs"
    );
    t.equal(
      typeof wispPkg.server.options.dns_method,
      "function",
      "self-hosted Wisp uses the filtered DNS resolver"
    );

    ws = await openWispClient(relay.address().port);
    var literalClose = waitForWispClose(ws, 1);
    ws.send(createWispConnectPacket(1, "127.0.0.1", target.address().port));
    t.equal(
      await literalClose,
      wispPkg.packet.close_reasons.HostBlocked,
      "Wisp blocks a private IP-literal stream"
    );

    var hostnameClose = waitForWispClose(ws, 2);
    ws.send(createWispConnectPacket(2, "localhost", target.address().port));
    t.equal(
      await hostnameClose,
      wispPkg.packet.close_reasons.NetworkError,
      "Wisp rejects a hostname whose DNS answers are private"
    );
    t.equal(
      targetHits,
      0,
      "blocked Wisp streams never reach the private origin"
    );
  } finally {
    if (ws && ws.readyState !== WebSocket.CLOSED) ws.terminate();
    await Promise.all([close(relay), close(target)]);
  }
});

test("private service and webhook URLs are blocked, and custom proxy agents need explicit trust", async function (t) {
  var targetHits = 0;
  var target = http.createServer(function (_req, res) {
    targetHits++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");
  });
  var rejectedAgent = new http.Agent();
  var trustedAgent = new http.Agent();

  try {
    await listen(target);
    var serviceUrl = "http://127.0.0.1:" + target.address().port;
    var app = createApp({
      autoLoadSupabase: true,
      skipInternetProbe: true,
      supabaseUrl: serviceUrl,
      supabaseAnonKey: "test-key",
    });
    app.adminManager.state.discordWebhookUrl = serviceUrl + "/webhook";
    app.adminManager.sendDiscordAlert("SSRF test", "test alert", 123);

    t.throws(
      function () {
        createApp({
          autoLoadSupabase: false,
          skipInternetProbe: true,
          httpAgent: rejectedAgent,
        });
      },
      /trustCustomProxyAgents/,
      "rejects an injected agent unless its egress policy is explicitly trusted"
    );
    rejectedAgent.destroy();

    var trustedApp = createApp({
      autoLoadSupabase: false,
      skipInternetProbe: true,
      httpAgent: trustedAgent,
      trustCustomProxyAgents: true,
    });
    t.ok(trustedApp, "allows an explicitly trusted custom proxy agent");

    await new Promise(function (resolve) {
      setTimeout(resolve, 50);
    });
    t.equal(
      targetHits,
      0,
      "Supabase and admin webhook requests do not reach private service URLs"
    );
  } finally {
    rejectedAgent.destroy();
    trustedAgent.destroy();
    await close(target);
  }
});
