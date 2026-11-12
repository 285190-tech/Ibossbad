"use strict";

var http = require("http");
var Unblocker = require("../../lib/unblocker.js");

var unblocker = Unblocker({
  host: "ibossbad.onrender.com"
});

var server = http
  .createServer(function (req, res) {
    unblocker(req, res, function (err) {
      var headers = { "content-type": "text/plain" };
      if (err) {
        res.writeHead(500, headers);
        return res.end(err.stack || err);
      }
      if (req.url === "/") {
        res.writeHead(200, headers);
        return res.end(
          "Proxy is running. Use /proxy/<url> to browse.\nExample: /proxy/https://example.com"
        );
      }
      res.writeHead(404, headers);
      return res.end("Error 404: file not found.");
    });
  })
  .listen(process.env.PORT || 8080, "0.0.0.0");

server.on("upgrade", unblocker.onUpgrade);

console.log("proxy server live on port " + (process.env.PORT || 8080));