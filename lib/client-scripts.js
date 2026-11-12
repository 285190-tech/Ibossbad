"use strict";

var path = require("path");
var Transform = require("stream").Transform;
var send = require("send");
var contentTypes = require("./content-types");

module.exports = function ({ prefix, isolateStorage }) {
  const clientDir = "client";
  const clientScriptPathWeb = prefix + clientDir + "/unblocker-client.js";
  const clientScriptPathFs = path.join(
    __dirname,
    clientDir,
    "unblocker-client.js"
  );
  const isProduction = process.env.NODE_ENV === "production";
  const sendOpts = {
    acceptRanges: false,
    immutable: isProduction,
    index: false,
    maxAge: "10m",
  };

  function server(req, res, next) {
    const cleanUrl = (req.url || "").split("?")[0];
    if (cleanUrl === clientScriptPathWeb) {
      send(req, clientScriptPathFs, sendOpts).pipe(res);
      return;
    }
    next();
  }

  function injector(data) {
    if (contentTypes.html.includes(data.contentType)) {
      let injected = false;
      const snippet = `\n<script src="${clientScriptPathWeb}"></script>\n<script>unblockerInit(${JSON.stringify(
        {
          prefix,
          url: data.url,
          isolateStorage: Boolean(isolateStorage),
        }
      )}, window);</script>\n`;

      data.stream = data.stream.pipe(
        new Transform({
          decodeStrings: false,
          transform: function (chunk, encoding, next) {
            let updated = chunk.toString();
            if (!injected) {
              if (/(<head[^>]*>)/i.test(updated)) {
                updated = updated.replace(/(<head[^>]*>)/i, `$1${snippet}`);
                injected = true;
              } else if (/(<body[^>]*>)/i.test(updated)) {
                updated = updated.replace(/(<body[^>]*>)/i, `${snippet}$1`);
                injected = true;
              }
            }
            this.push(updated, "utf8");
            next();
          },
        })
      );
    }
  }

  return {
    server,
    injector,
  };
};
