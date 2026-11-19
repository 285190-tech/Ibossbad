"use strict";

var fs = require("fs");
var path = require("path");
var tap = require("tap");
var JSDOM = require("jsdom").JSDOM;

tap.test(
  "Scramjet initializes in parallel with scanner while preserving handshake",
  async function (t) {
    var dom = new JSDOM("<!doctype html>", {
      url: "https://proxy.example/",
      runScripts: "outside-only",
    });
    var win = dom.window;
    t.teardown(function () {
      win.close();
    });
    var controllerInit = 0;
    var handshakes = 0;
    var transports = 0;
    var resolveFinder;
    var finderReady = new Promise(function (resolve) {
      resolveFinder = resolve;
    });
    Object.defineProperty(win.navigator, "serviceWorker", {
      value: {
        controller: {},
        ready: Promise.resolve(),
        register: async function () {
          return { update: async function () {} };
        },
        addEventListener: function () {},
      },
    });
    win.$scramjetLoadController = function () {
      return {
        ScramjetController: function () {
          this.addEventListener = function () {};
          this.init = async function () {
            controllerInit++;
          };
        },
      };
    };
    win.BareMux = {
      BareMuxConnection: function () {
        this.setTransport = async function () {
          transports++;
        };
      },
      BareClient: function () {},
    };
    win.eval(
      fs.readFileSync(
        path.join(__dirname, "../public/scramjet-engine.js"),
        "utf8"
      )
    );
    var engine = win.IbossScramjetEngine.create({
      ensureServerFinder: function () {
        return finderReady;
      },
    });
    var startup = engine.ensureReady();
    await new Promise(function (resolve) {
      setTimeout(resolve, 30);
    });
    t.equal(
      controllerInit,
      1,
      "controller initializes before scanner download completes"
    );
    t.equal(transports, 0, "relay is not selected before scanner is ready");
    win.IbossServerFinder = {
      probeWispHandshake: async function () {
        handshakes++;
        return { ok: true, latencyMs: 12 };
      },
      getServerProtocol: function () {
        return "WISP v1";
      },
    };
    resolveFinder();
    await startup;
    t.equal(handshakes, 1, "binary WISP handshake is still used");
    t.equal(transports, 1, "transport is initialized after successful probe");
  }
);

tap.test(
  "cached Scramjet relay protocol avoids waiting for the scanner",
  async function (t) {
    async function run(protocol) {
      var dom = new JSDOM("", {
        url: "https://proxy.example/",
        runScripts: "outside-only",
      });
      var win = dom.window;
      var cached = {
        url: "wss://relay.example/",
        label: "relay",
        latency: 10,
        ts: Date.now(),
      };
      if (protocol) cached.protocol = protocol;
      win.sessionStorage.setItem(
        "ibossbad.fastRelay.v2",
        JSON.stringify(cached)
      );
      var resolveFinder;
      var finder = new Promise(function (resolve) {
        resolveFinder = resolve;
      });
      var installs = [];
      Object.defineProperty(win.navigator, "serviceWorker", {
        value: {
          controller: {},
          ready: Promise.resolve(),
          register: async function () {
            return { update: async function () {} };
          },
          addEventListener: function () {},
        },
      });
      win.$scramjetLoadController = function () {
        return {
          ScramjetController: function () {
            this.addEventListener = function () {};
            this.init = async function () {};
          },
        };
      };
      win.BareMux = {
        BareMuxConnection: function () {
          this.setTransport = async function (path, opts) {
            installs.push({ path: path, opts: opts });
          };
        },
        BareClient: function () {},
      };
      win.eval(
        fs.readFileSync(
          path.join(__dirname, "../public/scramjet-engine.js"),
          "utf8"
        )
      );
      var startup = win.IbossScramjetEngine.create({
        ensureServerFinder: function () {
          return finder;
        },
      }).ensureReady();
      await new Promise(function (resolve) {
        setTimeout(resolve, 30);
      });
      var beforeFinder = installs.slice();
      win.IbossServerFinder = {
        getServerProtocol: function () {
          return "WISP v1";
        },
      };
      resolveFinder();
      await startup;
      var saved = JSON.parse(
        win.sessionStorage.getItem("ibossbad.fastRelay.v2")
      );
      dom.window.close();
      return { beforeFinder: beforeFinder, installs: installs, saved: saved };
    }
    var v1 = await run("WISP v1");
    t.equal(
      v1.beforeFinder.length,
      1,
      "cached v1 relay starts without waiting for scanner"
    );
    t.match(v1.installs[0].path, /^\/libcurl\//, "v1 keeps libcurl transport");
    t.equal(
      v1.saved.protocol,
      "WISP v1",
      "v1 protocol is saved for the next startup"
    );
    var v2 = await run("WISP v2");
    t.equal(
      v2.beforeFinder.length,
      1,
      "cached v2 relay starts without waiting for scanner"
    );
    t.match(v2.installs[0].path, /^\/epoxy\//, "v2 keeps epoxy transport");
    t.equal(
      v2.installs[0].opts[0].wisp_v2,
      true,
      "v2 protocol is configured on epoxy"
    );
    t.equal(v2.saved.protocol, "WISP v2");
    var legacy = await run(null);
    t.equal(
      legacy.beforeFinder.length,
      0,
      "old entries without protocol still wait for scanner"
    );
    t.equal(
      legacy.saved.protocol,
      "WISP v1",
      "old entries acquire protocol after initialization"
    );
  }
);
