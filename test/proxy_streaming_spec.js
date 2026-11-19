"use strict";

var http = require("http");
var tap = require("tap");
var createApp = require("../lib/app");

tap.test(
  "stream proxy forwards HTML before the origin completes",
  async function (t) {
    var finishOrigin;
    var upstream = http.createServer(function (_req, res) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.write(
        "<!doctype html><html><head><title>Example</title><script>window.location.pathname</script></head><body>First bytes "
      );
      finishOrigin = function () {
        res.end("final bytes</body></html>");
      };
    });
    await new Promise(function (resolve) {
      upstream.listen(0, "127.0.0.1", resolve);
    });
    var app = createApp({
      authRequired: false,
      allowPrivateProxyTargets: true,
      autoLoadSupabase: false,
      skipInternetProbe: true,
    });
    var proxy = http.createServer(app.app);
    await new Promise(function (resolve) {
      proxy.listen(0, "127.0.0.1", resolve);
    });
    t.teardown(function () {
      if (finishOrigin) finishOrigin();
      return Promise.all([
        new Promise(function (resolve) {
          proxy.close(resolve);
        }),
        new Promise(function (resolve) {
          upstream.close(resolve);
        }),
      ]);
    });
    var result = await new Promise(function (resolve, reject) {
      var req = http.get(
        {
          host: "127.0.0.1",
          port: proxy.address().port,
          path: "/proxy/http://127.0.0.1:" + upstream.address().port + "/",
          headers: { accept: "text/html" },
        },
        function (res) {
          var chunks = [];
          var gotDataBeforeEnd = false;
          res.on("data", function (chunk) {
            chunks.push(chunk);
            if (!gotDataBeforeEnd) {
              gotDataBeforeEnd = true;
              finishOrigin();
              finishOrigin = null;
            }
          });
          res.on("end", function () {
            resolve({
              status: res.statusCode,
              body: Buffer.concat(chunks).toString(),
              streamed: gotDataBeforeEnd,
            });
          });
        }
      );
      req.setTimeout(2000, function () {
        req.destroy(new Error("proxy did not stream before origin finished"));
      });
      req.on("error", reject);
    });
    t.equal(result.status, 200);
    t.ok(result.streamed, "received HTML while origin was still open");
    t.match(
      result.body,
      /__ibossSafe\(window\)\.__ibossLoc\$\.pathname/,
      "inline location rewriting is preserved"
    );
    t.match(
      result.body,
      /unblockerInit\(/,
      "client bootstrap remains injected"
    );
    t.match(
      result.body,
      /final bytes/,
      "response completes without losing content"
    );
  }
);
