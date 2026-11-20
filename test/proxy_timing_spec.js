"use strict";

var fs = require("fs");
var path = require("path");
var http = require("http");
var https = require("https");
var tap = require("tap");
var createApp = require("../lib/app.js");

function listen(server) {
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", resolve);
  });
}
function close(server) {
  return new Promise(function (resolve) {
    server.close(resolve);
  });
}
function request(port, url) {
  return new Promise(function (resolve, reject) {
    http
      .get(
        { hostname: "127.0.0.1", port: port, path: "/proxy/" + url },
        function (res) {
          var chunks = [];
          res.on("data", function (chunk) {
            chunks.push(chunk);
          });
          res.on("end", function () {
            resolve({
              headers: res.headers,
              status: res.statusCode,
              body: Buffer.concat(chunks).toString(),
            });
          });
        }
      )
      .on("error", reject);
  });
}

function metric(value, name) {
  var match = String(value || "").match(
    new RegExp("(?:^|,\\s*)" + name + ";dur=([0-9]+(?:\\.[0-9]+)?)")
  );
  return match ? Number(match[1]) : null;
}

tap.test(
  "opt-in timings distinguish DNS, connection and reused sockets",
  async function (t) {
    var origin = http.createServer(function (_req, res) {
      setTimeout(function () {
        res.writeHead(200, {
          "content-type": "text/plain",
          "server-timing": "origin;dur=7",
        });
        res.end("ok");
      }, 30);
    });
    await listen(origin);
    var agent = new http.Agent({
      keepAlive: true,
      maxSockets: 1,
      lookup: function (_host, _opts, done) {
        setTimeout(function () {
          if (_opts && _opts.all)
            done(null, [{ address: "127.0.0.1", family: 4 }]);
          else done(null, "127.0.0.1", 4);
        }, 35);
      },
    });
    var instance = createApp({
      authRequired: false,
      allowPrivateProxyTargets: true,
      autoLoadSupabase: false,
      skipInternetProbe: true,
      proxyServerTiming: true,
      httpAgent: agent,
    });
    var server = http.createServer(instance.app);
    await listen(server);
    t.teardown(async function () {
      agent.destroy();
      await Promise.all([close(server), close(origin)]);
    });
    var url = "http://timing.test:" + origin.address().port + "/";
    var first = await request(server.address().port, url);
    t.equal(first.status, 200);
    t.equal(first.body, "ok");
    t.match(
      first.headers["server-timing"],
      /origin;dur=7/,
      "preserves origin server timing"
    );
    t.ok(
      metric(first.headers["server-timing"], "iboss_dns") >= 25,
      "captures delayed DNS lookup"
    );
    t.ok(
      metric(first.headers["server-timing"], "iboss_tcp") !== null,
      "records TCP connection"
    );
    t.ok(
      metric(first.headers["server-timing"], "iboss_origin_wait") >= 20,
      "captures upstream header wait"
    );
    t.ok(
      metric(first.headers["server-timing"], "iboss_headers") >= 50,
      "total reaches response headers"
    );
    var second = await request(server.address().port, url);
    t.equal(
      metric(second.headers["server-timing"], "iboss_dns"),
      null,
      "does not invent DNS timing on reuse"
    );
    t.equal(
      metric(second.headers["server-timing"], "iboss_tcp"),
      null,
      "does not invent TCP timing on reuse"
    );
    t.ok(
      metric(second.headers["server-timing"], "iboss_origin_wait") >= 20,
      "still records origin wait on reuse"
    );
  }
);

tap.test(
  "TLS timing is recorded only for new TLS connections",
  async function (t) {
    var origin = https.createServer(
      {
        key: fs.readFileSync(
          path.join(__dirname, "fixtures/proxy-origin-test-only.key")
        ),
        cert: fs.readFileSync(
          path.join(__dirname, "fixtures/proxy-origin-test-only.crt")
        ),
      },
      function (_req, res) {
        res.end("tls");
      }
    );
    await listen(origin);
    var agent = new https.Agent({ keepAlive: true, rejectUnauthorized: false }); // local self-signed fixture only
    var instance = createApp({
      authRequired: false,
      allowPrivateProxyTargets: true,
      autoLoadSupabase: false,
      skipInternetProbe: true,
      proxyServerTiming: true,
      httpsAgent: agent,
    });
    var server = http.createServer(instance.app);
    await listen(server);
    t.teardown(async function () {
      agent.destroy();
      await Promise.all([close(server), close(origin)]);
    });
    var url = "https://127.0.0.1:" + origin.address().port + "/";
    var first = await request(server.address().port, url);
    t.equal(first.body, "tls");
    t.ok(
      metric(first.headers["server-timing"], "iboss_tls") !== null,
      "new TLS handshake measured"
    );
    var second = await request(server.address().port, url);
    t.equal(
      metric(second.headers["server-timing"], "iboss_tls"),
      null,
      "no handshake metric when socket reused"
    );
  }
);

tap.test(
  "timings are disabled by default and do not overwrite origin headers",
  async function (t) {
    var origin = http.createServer(function (_req, res) {
      res.writeHead(200, { "server-timing": "origin;dur=5" });
      res.end("ok");
    });
    await listen(origin);
    var instance = createApp({
      authRequired: false,
      allowPrivateProxyTargets: true,
      autoLoadSupabase: false,
      skipInternetProbe: true,
      proxyServerTiming: false,
    });
    var server = http.createServer(instance.app);
    await listen(server);
    t.teardown(async function () {
      await Promise.all([close(server), close(origin)]);
    });
    var result = await request(
      server.address().port,
      "http://127.0.0.1:" + origin.address().port + "/"
    );
    t.equal(result.headers["server-timing"], "origin;dur=5");
  }
);
