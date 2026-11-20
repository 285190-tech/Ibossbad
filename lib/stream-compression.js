"use strict";

var zlib = require("zlib");
var contentTypes = require("./content-types");

function acceptsGzip(header) {
  var explicit = null;
  var wildcard = null;
  String(header || "")
    .split(",")
    .forEach(function (part) {
      var pieces = part.trim().toLowerCase().split(";");
      var name = pieces.shift().trim();
      if (name !== "gzip" && name !== "*") return;
      var quality = 1;
      pieces.forEach(function (param) {
        var match = param
          .trim()
          .match(/^q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/);
        if (match) quality = Number(match[1]);
        else if (/^q\s*=/i.test(param.trim())) quality = 0;
      });
      if (name === "gzip") explicit = quality;
      else wildcard = quality;
    });
  return (explicit === null ? wildcard : explicit) > 0;
}

function hasExternalCookies(header) {
  return String(header || "")
    .split(";")
    .some(function (part) {
      var name = part.trim().split("=")[0];
      return (
        name &&
        name.indexOf("__ibossbad_") !== 0 &&
        name.indexOf("__unblocker_") !== 0
      );
    });
}

function appendVary(headers, values) {
  var vary = String(headers.vary || "");
  if (vary.trim() === "*") return;
  var fields = vary
    ? vary
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean)
    : [];
  values.forEach(function (value) {
    if (
      !fields.some(function (s) {
        return s.toLowerCase() === value.toLowerCase();
      })
    )
      fields.push(value);
  });
  headers.vary = fields.join(", ");
}

// Opt-in: streaming gzip after all rewriting, without buffering the response.
module.exports = function compressRewritten(data, config) {
  var req = data.clientRequest;
  var status = data.remoteResponse.statusCode;
  var headers = data.headers;
  var requestHeaders = req.headers || {};
  var type = data.contentType;
  if (
    !config.proxyStreamCompression ||
    req.method !== "GET" ||
    status !== 200 ||
    requestHeaders.range ||
    headers["content-range"] ||
    headers["content-encoding"] ||
    /\b(?:no-transform|private|no-store)\b/i.test(
      headers["cache-control"] || ""
    ) ||
    !(
      contentTypes.shouldProcess(config, data) ||
      (config.rewriteLocation && contentTypes.js.includes(type))
    ) ||
    data.stream === data.remoteResponse
  )
    return false;

  // Avoid compressing authenticated or personalized upstream content. The
  // proxy's own session cookies never reach the upstream and are not counted.
  appendVary(headers, ["Accept-Encoding", "Cookie", "Authorization"]);
  if (requestHeaders.authorization || hasExternalCookies(requestHeaders.cookie))
    return false;
  var setCookies = headers["set-cookie"] || [];
  if (!Array.isArray(setCookies)) setCookies = [setCookies];
  if (
    setCookies.some(function (cookie) {
      return !/^\s*__(?:ibossbad|unblocker)_/i.test(String(cookie));
    })
  )
    return false;
  if (!acceptsGzip(requestHeaders["accept-encoding"])) return false;

  var source = data.stream;
  var gzip = zlib.createGzip({ level: 1, flush: zlib.constants.Z_SYNC_FLUSH });
  source.on("error", function (err) {
    gzip.destroy(err);
  });
  source.pipe(gzip);
  data.clientResponse.on("close", function () {
    if (!data.clientResponse.writableFinished) {
      gzip.destroy();
      source.destroy();
      data.remoteResponse.destroy();
    }
  });
  data.stream = gzip;
  headers["content-encoding"] = "gzip";
  delete headers["content-length"];
  delete headers.etag;
  delete headers["content-md5"];
  delete headers.digest;
  delete headers["accept-ranges"];
  return true;
};
module.exports.acceptsGzip = acceptsGzip;
