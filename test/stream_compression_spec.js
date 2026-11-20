"use strict";

var http = require("http");
var zlib = require("zlib");
var tap = require("tap");
var createApp = require("../lib/app");
var acceptsGzip = require("../lib/stream-compression").acceptsGzip;

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

tap.test("gzip negotiation respects explicit rejection", function (t) {
  t.ok(acceptsGzip("br, gzip"));
  t.ok(acceptsGzip("*;q=0.5"));
  t.notOk(acceptsGzip("gzip;q=0, *;q=1"));
  t.notOk(acceptsGzip("gzip;q=invalid"));
  t.notOk(acceptsGzip("br"));
  t.end();
});

tap.test(
  "opt-in gzip preserves streaming, rewriting and private-response safety",
  async function (t) {
    var finishSlow;
    var upstream = http.createServer(function (req, res) {
      var headers = {
        "Content-Type": "text/html; charset=utf-8",
        ETag: '"upstream"',
      };
      if (req.url === "/cookie")
        headers["Set-Cookie"] = "user_session=secret; Path=/";
      if (req.url === "/private") headers["Cache-Control"] = "private";
      if (req.url === "/no-transform")
        headers["Cache-Control"] = "no-transform";
      if (req.url === "/range") {
        res.writeHead(206, {
          "Content-Type": "text/html",
          "Content-Range": "bytes 0-4/10",
        });
        return res.end("hello");
      }
      res.writeHead(200, headers);
      res.write(
        "<!doctype html><html><head><title>Fixture</title></head><body>" +
          "repeatable content ".repeat(4000)
      );
      if (req.url === "/slow")
        finishSlow = function () {
          res.end("tail</body></html>");
        };
      else res.end("tail</body></html>");
    });
    await listen(upstream);
    var app = createApp({
      authRequired: false,
      allowPrivateProxyTargets: true,
      autoLoadSupabase: false,
      skipInternetProbe: true,
      proxyStreamCompression: true,
    });
    var proxy = http.createServer(app.app);
    await listen(proxy);
    t.teardown(async function () {
      if (finishSlow) finishSlow();
      await Promise.all([close(proxy), close(upstream)]);
    });
    function get(path, headers, stream) {
      return new Promise(function (resolve, reject) {
        var req = http.get(
          {
            host: "127.0.0.1",
            port: proxy.address().port,
            path: "/proxy/http://127.0.0.1:" + upstream.address().port + path,
            headers: headers,
          },
          function (res) {
            var chunks = [];
            var wireBytes = 0;
            res.on("data", function (chunk) {
              wireBytes += chunk.length;
            });
            var response =
              res.headers["content-encoding"] === "gzip"
                ? res.pipe(zlib.createGunzip())
                : res;
            response.on("error", reject);
            response.on("data", function (chunk) {
              chunks.push(chunk);
              if (stream && finishSlow) {
                var finish = finishSlow;
                finishSlow = null;
                finish();
              }
            });
            response.on("end", function () {
              resolve({
                headers: res.headers,
                status: res.statusCode,
                body: Buffer.concat(chunks).toString("utf8"),
                wireBytes: wireBytes,
              });
            });
          }
        );
        req.setTimeout(4000, function () {
          req.destroy(
            new Error("stream did not produce data before upstream finished")
          );
        });
        req.on("error", reject);
      });
    }
    var gzip = await get(
      "/slow",
      { "accept-encoding": "gzip", cookie: "__ibossbad_session=local" },
      true
    );
    t.equal(gzip.headers["content-encoding"], "gzip");
    t.match(gzip.body, /repeatable content/);
    t.match(gzip.body, /tail<\/body>/);
    var identity = await get("/", { "accept-encoding": "identity" });
    t.ok(
      gzip.wireBytes < identity.wireBytes / 2,
      "compresses the representative response by over half"
    );
    t.comment(
      "local fixture wire bytes: gzip " +
        gzip.wireBytes +
        ", identity " +
        identity.wireBytes
    );
    t.match(gzip.body, /unblockerInit\(/);
    t.notOk(gzip.headers["content-length"]);
    t.notOk(gzip.headers.etag);
    t.match(gzip.headers.vary, /Accept-Encoding/i);
    t.match(gzip.headers.vary, /Cookie/i);
    for (var opts of [
      { path: "/", headers: { "accept-encoding": "gzip;q=0" } },
      {
        path: "/",
        headers: { "accept-encoding": "gzip", cookie: "user_session=private" },
      },
      {
        path: "/",
        headers: { "accept-encoding": "gzip", authorization: "Bearer private" },
      },
      { path: "/cookie", headers: { "accept-encoding": "gzip" } },
      { path: "/private", headers: { "accept-encoding": "gzip" } },
      { path: "/no-transform", headers: { "accept-encoding": "gzip" } },
      {
        path: "/range",
        headers: { "accept-encoding": "gzip", range: "bytes=0-4" },
      },
    ]) {
      var plain = await get(opts.path, opts.headers);
      t.not(
        plain.headers["content-encoding"],
        "gzip",
        "sensitive, disabled or partial response is not compressed: " +
          opts.path
      );
    }
  }
);
