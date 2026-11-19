"use strict";
var contentType = require("content-type");

var html = ["text/html", "application/xml+xhtml", "application/xhtml+xml"];
var css = ["text/css"];
var javascript = [
  "text/javascript",
  "application/javascript",
  "application/x-javascript",
];

function shouldProcess(config, data) {
  return config.processContentTypes.indexOf(data.contentType) != -1;
}

// Content-Type values repeat across virtually every proxied resource. Keep a
// bounded cache of parser results; key by the current header so middleware
// changes are observed and never retain unusually large attacker-controlled keys.
var parsedTypes = new Map();
var MAX_PARSED_TYPES = 128;
var MAX_TYPE_HEADER_LENGTH = 1024;

function parse(data) {
  var header = data.headers["content-type"];
  var cacheable =
    typeof header === "string" && header.length <= MAX_TYPE_HEADER_LENGTH;
  if (cacheable && parsedTypes.has(header)) return parsedTypes.get(header);

  var parsed;
  try {
    parsed = contentType.parse(header);
  } catch (ex) {
    parsed = { type: "", parameters: {} };
  }
  if (cacheable) {
    if (parsedTypes.size >= MAX_PARSED_TYPES) {
      parsedTypes.delete(parsedTypes.keys().next().value);
    }
    parsedTypes.set(header, parsed);
  }
  return parsed;
}

function setHeader(data) {
  var type = getType(data);
  if (type) {
    data.headers["content-type"] = contentType.format({
      type: type,
      parameters: {
        charset: "UTF-8",
      },
    });
  }
}

function getType(data) {
  return parse(data).type;
}

function getCharset(data) {
  return parse(data).parameters.charset;
}

module.exports.shouldProcess = shouldProcess;
module.exports.getType = getType;
module.exports.getCharset = getCharset;
module.exports.setHeader = setHeader;
module.exports.html = html;
module.exports.css = css;
module.exports.js = javascript;
module.exports.javascript = javascript; // for backwards-compatibility
