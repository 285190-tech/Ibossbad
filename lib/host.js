"use strict";

var parseUrl = require("./parse-url.js");

module.exports = function (/*config*/) {
  return function hostHeader(data) {
    data.headers.host = parseUrl(data.url).host;
  };
};
