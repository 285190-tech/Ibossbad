"use strict";

var net = require("net");
var ipaddr = require("ipaddr.js");

function isPublicAddress(address) {
  if (typeof address !== "string" || net.isIP(address) === 0) {
    return false;
  }

  try {
    // process() normalizes IPv4-mapped IPv6 addresses before checking ranges.
    return ipaddr.process(address).range() === "unicast";
  } catch (_err) {
    return false;
  }
}

function createAccessDeniedError(hostname) {
  var error = new Error(
    "Proxy destinations must resolve to public unicast IP addresses."
  );
  error.code = "EACCES";
  error.hostname = hostname;
  return error;
}

function parseLookupArguments(lookupOptions, callback) {
  if (typeof lookupOptions === "function") {
    return { options: {}, callback: lookupOptions };
  }
  if (typeof lookupOptions === "number") {
    return { options: { family: lookupOptions }, callback: callback };
  }
  return {
    options: lookupOptions || {},
    callback: callback,
  };
}

function normalizeRecords(addresses, family) {
  if (Array.isArray(addresses)) return addresses;
  if (typeof addresses === "string") {
    return [{ address: addresses, family: family || net.isIP(addresses) }];
  }
  return [];
}

function createPublicLookup(baseLookup) {
  if (typeof baseLookup !== "function") {
    throw new TypeError("A DNS lookup function is required.");
  }

  return function publicLookup(hostname, lookupOptions, callback) {
    var parsed = parseLookupArguments(lookupOptions, callback);
    var options = parsed.options;
    var done = parsed.callback;

    if (typeof done !== "function") {
      throw new TypeError("A DNS lookup callback is required.");
    }

    var baseOptions = { all: true };
    if (options.family === 4 || options.family === 6) {
      baseOptions.family = options.family;
    }

    try {
      return baseLookup(
        hostname,
        baseOptions,
        function (err, addresses, family) {
          if (err) return done(err);

          var records = normalizeRecords(addresses, family);
          var safeRecords = [];
          for (var i = 0; i < records.length; i++) {
            var record = records[i];
            if (!record || !isPublicAddress(record.address)) continue;
            var recordFamily = record.family || net.isIP(record.address);
            if (options.family && recordFamily !== options.family) continue;
            safeRecords.push({ address: record.address, family: recordFamily });
          }

          if (!safeRecords.length) {
            return done(createAccessDeniedError(hostname));
          }
          if (options.all) return done(null, safeRecords);
          return done(null, safeRecords[0].address, safeRecords[0].family);
        }
      );
    } catch (err) {
      return done(err);
    }
  };
}

function createPinnedLookup(record) {
  if (!record || !isPublicAddress(record.address)) {
    throw new TypeError("A public unicast IP address is required.");
  }

  var pinnedRecord = {
    address: record.address,
    family: record.family || net.isIP(record.address),
  };

  return function pinnedLookup(_hostname, lookupOptions, callback) {
    var parsed = parseLookupArguments(lookupOptions, callback);
    var options = parsed.options;
    var done = parsed.callback;

    if (typeof done !== "function") {
      throw new TypeError("A DNS lookup callback is required.");
    }
    if (options.family && options.family !== pinnedRecord.family) {
      var error = new Error("Pinned address does not match requested family.");
      error.code = "EAI_ADDRFAMILY";
      return done(error);
    }
    if (options.all) return done(null, [pinnedRecord]);
    return done(null, pinnedRecord.address, pinnedRecord.family);
  };
}

module.exports = {
  isPublicAddress: isPublicAddress,
  createAccessDeniedError: createAccessDeniedError,
  createPublicLookup: createPublicLookup,
  createPinnedLookup: createPinnedLookup,
};
