"use strict";

var dns = require("dns");
var net = require("net");

function createDnsCache(opts) {
  var options = opts || {};
  var maxEntries = options.maxEntries || 8192;
  var ttlMs = options.ttlMs || 5 * 60 * 1000;
  var negativeTtlMs = options.negativeTtlMs || 15 * 1000;

  var cache = new Map();
  var inflight = new Map();
  var stats = {
    hits: 0,
    misses: 0,
    deduped: 0,
  };

  function evictIfNeeded() {
    while (cache.size >= maxEntries) {
      var oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cache.delete(oldestKey);
    }
  }

  function deliverResult(entry, wantAll, callback) {
    if (entry.err) {
      var errCopy = new Error(entry.err.message || "DNS lookup failed");
      errCopy.code = entry.err.code || "ENOTFOUND";
      errCopy.hostname = entry.err.hostname;
      return process.nextTick(function () {
        callback(errCopy);
      });
    }
    if (wantAll) {
      return process.nextTick(function () {
        callback(null, entry.records);
      });
    }
    return process.nextTick(function () {
      callback(null, entry.address, entry.family);
    });
  }

  function lookup(hostname, lookupOpts, cb) {
    var callback = cb;
    var reqOpts = lookupOpts;
    if (typeof lookupOpts === "function") {
      callback = lookupOpts;
      reqOpts = {};
    } else if (typeof lookupOpts === "number") {
      reqOpts = { family: lookupOpts };
    } else {
      reqOpts = lookupOpts || {};
    }

    if (!hostname || typeof callback !== "function") {
      return dns.lookup(hostname, reqOpts, callback);
    }

    var ipFamily = net.isIP(hostname);
    if (ipFamily) {
      if (reqOpts.all) {
        return process.nextTick(function () {
          callback(null, [{ address: hostname, family: ipFamily }]);
        });
      }
      return process.nextTick(function () {
        callback(null, hostname, ipFamily);
      });
    }

    var family = reqOpts.family || 0;
    var wantAll = Boolean(reqOpts.all);
    var key = String(hostname).toLowerCase() + "|" + family;
    var now = Date.now();
    var cached = cache.get(key);

    if (cached && cached.expiresAt > now) {
      stats.hits++;
      // Refresh LRU order
      cache.delete(key);
      cache.set(key, cached);
      return deliverResult(cached, wantAll, callback);
    }
    if (cached) {
      cache.delete(key);
    }

    var pending = inflight.get(key);
    if (pending) {
      stats.deduped++;
      pending.push({ wantAll: wantAll, callback: callback });
      return;
    }

    stats.misses++;
    var waiters = [{ wantAll: wantAll, callback: callback }];
    inflight.set(key, waiters);

    var osOpts = { all: true };
    if (family === 4 || family === 6) {
      osOpts.family = family;
    }

    dns.lookup(hostname, osOpts, function (err, addresses) {
      inflight.delete(key);
      var entry;

      if (err || !addresses || !addresses.length) {
        var lookupErr = err || new Error("No DNS records for " + hostname);
        entry = {
          err: {
            message: lookupErr.message,
            code: lookupErr.code || "ENOTFOUND",
            hostname: hostname,
          },
          expiresAt: Date.now() + negativeTtlMs,
        };
      } else {
        // Prefer IPv4 first when family is unspecified to avoid blackholed IPv6 SYN stalls
        var sorted = addresses.slice().sort(function (a, b) {
          if (a.family === b.family) return 0;
          return a.family === 4 ? -1 : 1;
        });
        entry = {
          err: null,
          address: sorted[0].address,
          family: sorted[0].family,
          records: sorted,
          expiresAt: Date.now() + ttlMs,
        };
      }

      evictIfNeeded();
      cache.set(key, entry);

      for (var i = 0; i < waiters.length; i++) {
        deliverResult(entry, waiters[i].wantAll, waiters[i].callback);
      }
    });
  }

  function clear() {
    cache.clear();
  }

  function getStats() {
    return {
      hits: stats.hits,
      misses: stats.misses,
      deduped: stats.deduped,
      size: cache.size,
      maxEntries: maxEntries,
      ttlMs: ttlMs,
    };
  }

  return {
    lookup: lookup,
    clear: clear,
    getStats: getStats,
  };
}

module.exports = createDnsCache;
