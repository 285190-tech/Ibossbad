"use strict";

var http = require("http");
var test = require("tap").test;
var Unblocker = require("../lib/unblocker.js");

function listen(server) {
  return new Promise(function (resolve, reject) {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise(function (resolve) {
    if (!server.listening) return resolve();
    server.close(resolve);
  });
}

test("proxy accepts upstream response headers above Node's 16 KiB default", async function (t) {
  var largeHeader = "x".repeat(20 * 1024);
  var upstream = http.createServer(function (_req, res) {
    res.writeHead(200, { "x-large-upstream-header": largeHeader });
    res.end("YouTube-like response headers are accepted");
  });
  var unblocker = new Unblocker({ clientScripts: false });
  var proxyServer = http.createServer(function (req, res) {
    unblocker(req, res, function () {
      res.writeHead(404);
      res.end("Not found");
    });
  });

  await listen(upstream);
  await listen(proxyServer);

  try {
    var response = await new Promise(function (resolve, reject) {
      var req = http.get(
        {
          hostname: "127.0.0.1",
          port: proxyServer.address().port,
          path:
            "/proxy/http://127.0.0.1:" +
            upstream.address().port +
            "/large-headers",
          maxHeaderSize: 64 * 1024,
          agent: false,
          headers: { connection: "close" },
        },
        function (res) {
          var chunks = [];
          res.on("data", function (chunk) {
            chunks.push(chunk);
          });
          res.on("end", function () {
            resolve({
              status: res.statusCode,
              header: res.headers["x-large-upstream-header"],
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        }
      );
      req.on("error", reject);
    });

    t.equal(response.status, 200, "proxied response succeeds");
    t.equal(
      response.header.length,
      largeHeader.length,
      "large upstream response header is preserved"
    );
    t.equal(
      response.body,
      "YouTube-like response headers are accepted",
      "response body is relayed"
    );
  } finally {
    await Promise.all([close(proxyServer), close(upstream)]);
  }
});
