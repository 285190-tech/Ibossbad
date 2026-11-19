"use strict";

var fs = require("fs");
var vm = require("vm");
var path = require("path");
var tap = require("tap");

tap.test(
  "Scramjet cache ledger loads entries concurrently with bounded work",
  async function (t) {
    var requests = Array.from({ length: 40 }, function (_, i) {
      return { url: "https://cache.test/" + i };
    });
    var active = 0;
    var maxActive = 0;
    var cache = {
      keys: async function () {
        return requests;
      },
      match: async function (request) {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(function (resolve) {
          setTimeout(resolve, 5);
        });
        active--;
        var n = Number(request.url.split("/").pop());
        return {
          headers: {
            get: function (key) {
              return key === "x-iboss-bytes" ? String(n + 1) : null;
            },
          },
        };
      },
    };
    var listeners = {};
    var sandbox = {
      URL: URL,
      Set: Set,
      Map: Map,
      Promise: Promise,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      importScripts: function () {},
      caches: {
        open: async function () {
          return cache;
        },
      },
      $scramjetLoadWorker: function () {
        return { ScramjetServiceWorker: function () {} };
      },
      self: {
        location: { origin: "https://iboss.local" },
        addEventListener: function (type, fn) {
          listeners[type] = fn;
        },
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../public/sw.js"), "utf8"),
      sandbox
    );
    await sandbox.hydrateAssetCacheLedger();
    var stats = sandbox.getAssetCacheStats();
    t.ok(maxActive > 1, "cache reads run concurrently");
    t.ok(maxActive <= 16, "concurrency stays bounded");
    t.equal(stats.entries, 40, "all cached assets accounted for");
    t.equal(stats.totalBytes, 820, "byte accounting remains correct");
  }
);

tap.test(
  "concurrent Scramjet asset-cache opens are shared and retryable",
  async function (t) {
    var opens = 0;
    var pending = [];
    var cache = {};
    var sandbox = {
      URL: URL,
      Set: Set,
      Map: Map,
      Promise: Promise,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      importScripts: function () {},
      caches: {
        open: function () {
          opens++;
          return new Promise(function (resolve, reject) {
            pending.push({ resolve: resolve, reject: reject });
          });
        },
        delete: async function () {
          return true;
        },
      },
      $scramjetLoadWorker: function () {
        return { ScramjetServiceWorker: function () {} };
      },
      self: {
        location: { origin: "https://iboss.local" },
        addEventListener: function () {},
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../public/sw.js"), "utf8"),
      sandbox
    );
    var jobs = Array.from({ length: 40 }, function () {
      return sandbox.openAssetCache();
    });
    await Promise.resolve();
    t.equal(opens, 1, "40 simultaneous callers share one CacheStorage open");
    pending.shift().resolve(cache);
    var results = await Promise.all(jobs);
    t.ok(
      results.every(function (result) {
        return result === cache;
      }),
      "all callers receive the same handle"
    );
    var failing = sandbox.openAssetCache();
    await Promise.resolve();
    pending.shift().reject(new Error("cache unavailable"));
    await t.rejects(failing, /cache unavailable/, "reports a failed open");
    var retry = sandbox.openAssetCache();
    await Promise.resolve();
    t.equal(opens, 3, "failed open can be retried");
    pending.shift().resolve(cache);
    await retry;
    var oldOpen = sandbox.openAssetCache();
    await Promise.resolve();
    await sandbox.clearAssetCache();
    var newOpen = sandbox.openAssetCache();
    await Promise.resolve();
    t.equal(opens, 5, "clear does not reuse an earlier pending open");
    pending.shift().resolve({ old: true });
    pending.shift().resolve({ new: true });
    t.same(await oldOpen, { old: true });
    t.same(await newOpen, { new: true });
  }
);
