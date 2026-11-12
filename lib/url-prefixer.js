"use strict";

/**
 * This file creates a node.js Stream that re-writes chunks of HTML on-the-fly so that all
 * non-relative URLS are prefixed with the given string.
 */

var URL = require("url");
var Transform = require("stream").Transform;
var contentTypes = require("./content-types.js");
var debug = require("debug")("unblocker:url-prefixer");

function urlPrefixer(config) {
  var re_abs_url = /("|'|=|url\(\s*)(https?:)/gi, // "http:, 'http:, =http:, or url( http:, also matches https versions
    re_rel_proto = /("|'|=|url\(\s*)(\/\/\w)/gi, // matches //site.com style urls where the protocol is auto-sensed
    re_rel_root = /((href=|src=|poster=|action=|url\(\s*)['"]?)(\/.)/gi, // matches root-relative urls like /foo/bar.html
    // partial's dont cause anything to get changed, they just cause last few characters to be buffered and checked with the next batch
    re_html_partial = /((url\(\s*)?\s[^\s]+\s*)$/, // capture the last two "words" and any space after them
    // things that shouldn't be proxied
    re_proxied_xmlns = new RegExp('(xmlns(:[a-z]+)?=")' + config.prefix, "ig"),
    re_proxied_doctype = new RegExp('(<!DOCTYPE[^>]+")' + config.prefix, "i"),
    re_integrity = /(\s)integrity=(['"])/gi;

  function rewriteUrls(chunk, uri, prefix) {
    // first upgrade // links to regular http/https links because otherwise they look like root-relative (/whatever.html) links
    chunk = chunk.replace(re_rel_proto, "$1" + uri.protocol + "$2");
    // next replace urls that are relative to the root of the domain (/whatever.html) because this is how proxied urls look
    chunk = chunk.replace(
      re_rel_root,
      "$1" + uri.protocol + "//" + uri.host + "$3"
    );
    // last replace any complete urls
    chunk = chunk.replace(re_abs_url, "$1" + prefix + "$2");

    // fix xmlns & doctype attributes that were broken because they contained urls
    chunk = chunk.replace(re_proxied_xmlns, "$1");
    chunk = chunk.replace(re_proxied_doctype, "$1");

    // neutralize subresource integrity hashes that would block rewritten scripts/stylesheets
    chunk = chunk.replace(re_integrity, "$1data-unblocker-integrity=$2");

    return chunk;
  }

  function createStream(uri) {
    var chunk_remainder;

    return new Transform({
      decodeStrings: false,

      transform: function (chunk, encoding, next) {
        chunk = chunk.toString();
        if (chunk_remainder) {
          chunk = chunk_remainder + chunk;
          chunk_remainder = undefined;
        }

        var partial_hits = chunk.match(re_html_partial);
        if (partial_hits && partial_hits[1]) {
          var snip = partial_hits[1].length;
          chunk_remainder = chunk.substr(-1 * snip);
          chunk = chunk.substr(0, chunk.length - snip);
        }

        chunk = rewriteUrls(chunk, uri, config.prefix);

        this.push(chunk);
        next();
      },

      flush: function (done) {
        if (chunk_remainder) {
          this.push(rewriteUrls(chunk_remainder, uri, config.prefix));
          chunk_remainder = undefined;
        }
        done();
      },
    });
  }

  function prefixUrls(data) {
    if (contentTypes.shouldProcess(config, data)) {
      var uri = URL.parse(data.url);
      debug("prefixing all urls with %s", config.prefix);
      data.stream = data.stream.pipe(createStream(uri));
    }
  }

  prefixUrls.rewriteUrls = rewriteUrls; // for testing
  prefixUrls.createStream = createStream;

  return prefixUrls;
}

module.exports = urlPrefixer;
