"use strict";

var WhatwgURL = require("url").URL;

var MAX_CACHE_ENTRIES = 2048;
var parsedCache = new Map();

function buildQueryObject(searchStr) {
  var out = Object.create(null);
  if (!searchStr || searchStr === "?") return out;
  var raw = searchStr.charAt(0) === "?" ? searchStr.slice(1) : searchStr;
  if (!raw) return out;
  var params = new URLSearchParams(raw);
  params.forEach(function (val, key) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      if (Array.isArray(out[key])) {
        out[key].push(val);
      } else {
        out[key] = [out[key], val];
      }
    } else {
      out[key] = val;
    }
  });
  return out;
}

function parseRelativePath(raw, parseQuery) {
  var str = String(raw || "");
  var hashIdx = str.indexOf("#");
  var hash = null;
  if (hashIdx !== -1) {
    hash = str.slice(hashIdx) || null;
    str = str.slice(0, hashIdx);
  }
  var qIdx = str.indexOf("?");
  var search = null;
  var queryStr = null;
  var pathname = str;
  if (qIdx !== -1) {
    search = str.slice(qIdx) || null;
    queryStr = str.slice(qIdx + 1);
    pathname = str.slice(0, qIdx);
  }
  return {
    protocol: null,
    slashes: null,
    auth: null,
    host: null,
    port: null,
    hostname: null,
    hash: hash,
    search: search,
    query: parseQuery ? buildQueryObject(search) : queryStr,
    pathname: pathname || null,
    path: (pathname || "") + (search || "") || null,
    href: String(raw || ""),
  };
}

function cloneEntry(entry) {
  return {
    protocol: entry.protocol,
    slashes: entry.slashes,
    auth: entry.auth,
    host: entry.host,
    port: entry.port,
    hostname: entry.hostname,
    hash: entry.hash,
    search: entry.search,
    query: entry.query,
    pathname: entry.pathname,
    path: entry.path,
    href: entry.href,
  };
}

function parseUrl(input, parseQuery) {
  var raw = String(input || "");
  if (!parseQuery && parsedCache.has(raw)) {
    var hit = parsedCache.get(raw);
    parsedCache.delete(raw);
    parsedCache.set(raw, hit);
    return cloneEntry(hit);
  }

  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    var rel = parseRelativePath(raw, Boolean(parseQuery));
    if (!parseQuery && raw.length <= 512) {
      if (parsedCache.size >= MAX_CACHE_ENTRIES) {
        parsedCache.delete(parsedCache.keys().next().value);
      }
      parsedCache.set(raw, rel);
      return cloneEntry(rel);
    }
    return rel;
  }

  try {
    var u = new WhatwgURL(raw);
    var hostname = u.hostname || "";
    if (
      hostname.charAt(0) === "[" &&
      hostname.charAt(hostname.length - 1) === "]"
    ) {
      hostname = hostname.slice(1, -1);
    }
    var auth = u.username
      ? decodeURIComponent(u.username) +
        (u.password ? ":" + decodeURIComponent(u.password) : "")
      : null;
    var search = u.search || null;
    var queryVal = parseQuery
      ? buildQueryObject(search)
      : search
      ? search.slice(1)
      : null;
    var entry = {
      protocol: u.protocol || null,
      slashes: raw.indexOf(u.protocol + "//") === 0 ? true : null,
      auth: auth,
      host: u.host || null,
      port: u.port || null,
      hostname: hostname ? hostname.toLowerCase() : null,
      hash: u.hash || null,
      search: search,
      query: queryVal,
      pathname: u.pathname || "/",
      path: (u.pathname || "/") + (u.search || ""),
      href: u.href,
    };
    if (!parseQuery && raw.length <= 512) {
      if (parsedCache.size >= MAX_CACHE_ENTRIES) {
        parsedCache.delete(parsedCache.keys().next().value);
      }
      parsedCache.set(raw, entry);
      return cloneEntry(entry);
    }
    return entry;
  } catch (_err) {
    return parseRelativePath(raw, Boolean(parseQuery));
  }
}

module.exports = parseUrl;
