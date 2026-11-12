"use strict";

var http = require("http");
var createApp = require("./lib/app.js");

function startServer(options) {
  options = options || {};
  var port = Number(options.port || process.env.PORT || 8080);
  var bindHost = options.bindHost || "0.0.0.0";

  var instance = createApp(options);
  var server = http.createServer(instance.app);
  instance.attachUpgrade(server);

  server.listen(port, bindHost, function () {
    console.log(
      "Ibossbad proxy server live on http://" + bindHost + ":" + port
    );
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = startServer;
module.exports.createApp = createApp;
