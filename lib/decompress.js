"use strict";

var PassThrough = require("stream").PassThrough;
var zlib = require("zlib");
var contentTypes = require("./content-types.js");
var debug = require("debug")("unblocker:decompress");

function isZlibHeader(chunk) {
  if (!chunk || chunk.length < 2) {
    return false;
  }
  return (chunk[0] & 0x0f) === 8 && ((chunk[0] << 8) + chunk[1]) % 31 === 0;
}

module.exports = function (config) {
  function acceptableCompression(data) {
    // Request gzip when supported; if upstream still responds with br or deflate we handle it below
    if (
      data.headers["accept-encoding"] &&
      data.headers["accept-encoding"].includes("gzip")
    ) {
      data.headers["accept-encoding"] = "gzip";
    } else {
      delete data.headers["accept-encoding"];
    }
  }

  function shouldProcess(data) {
    // no body to process on 204 No Content or 304 Not Modified
    if ([204, 304].includes(data.remoteResponse.statusCode)) {
      return false;
    }

    var headers = data.headers;

    // skip requests that declare a 0-length body
    if (parseInt(headers["content-length"], 10) === 0) {
      return false;
    }

    var encoding = (headers["content-encoding"] || "").trim().toLowerCase();

    // decompress gzip, x-gzip, deflate, or brotli (br)
    return (
      encoding === "gzip" ||
      encoding === "x-gzip" ||
      encoding === "deflate" ||
      (encoding === "br" && typeof zlib.createBrotliDecompress === "function")
    );
  }

  function decompressResponse(data) {
    var needsDecompress =
      contentTypes.shouldProcess(config, data) ||
      (config.rewriteLocation && contentTypes.js.includes(data.contentType));
    if (needsDecompress && shouldProcess(data)) {
      var encoding = (data.headers["content-encoding"] || "")
        .trim()
        .toLowerCase();

      debug(
        "decompressing %s encoding and deleting content-encoding header",
        encoding
      );

      var sourceStream = data.stream;
      var placeHolder = new PassThrough();
      data.stream = placeHolder;

      var handleData = function handleData() {
        var firstChunk = sourceStream.read();

        if (firstChunk === null) {
          placeHolder.end();
          return;
        }

        var decompressStream;
        if (encoding === "br") {
          decompressStream = zlib.createBrotliDecompress();
        } else if (encoding === "deflate") {
          decompressStream = isZlibHeader(firstChunk)
            ? zlib.createInflate()
            : zlib.createInflateRaw();
        } else {
          decompressStream = zlib.createUnzip();
        }

        decompressStream.on("error", function (err) {
          debug("decompression stream error (%s): %s", encoding, err.message);
          placeHolder.end();
        });

        decompressStream.write(firstChunk);

        sourceStream.pipe(decompressStream).pipe(placeHolder);
      };

      sourceStream.once("readable", handleData);

      delete data.headers["content-encoding"];
    }
  }

  return {
    handleRequest: acceptableCompression,
    handleResponse: decompressResponse,
  };
};
