"use strict";

var tap = require("tap");
var locationRewriter = require("../lib/location-rewriter.js");
var client = require("../lib/client/unblocker-client.js");

tap.test(
  "AST locationRewriter rewrites member and bare location refs",
  function (t) {
    var rewritten = locationRewriter.rewriteLocationRefs(
      'var p = window.location.pathname; var h = document["location"].href; var q = location.search; location = "/play";'
    );

    t.match(rewritten, /__ibossSafe\(window\)\.__ibossLoc\$\.pathname/);
    t.match(rewritten, /__ibossSafe\(document\)\["__ibossLoc\$"\]\.href/);
    t.match(rewritten, /__ibossLoc\.search/);
    t.match(rewritten, /__ibossLoc = "\/play"/);
    t.end();
  }
);

tap.test(
  "AST locationRewriter skips files where location is locally declared",
  function (t) {
    var src = 'function demo() { const location = "/home"; return location; }';
    t.equal(locationRewriter.rewriteLocationRefs(src), src);
    t.end();
  }
);

tap.test(
  "AST locationRewriter preserves object literal keys named location",
  function (t) {
    var src =
      'var cfg = { location: "Charlotte" }; var host = window.location.host;';
    var out = locationRewriter.rewriteLocationRefs(src);
    t.match(out, /\{\s*location:\s*"Charlotte"\s*\}/);
    t.match(out, /__ibossSafe\(window\)\.__ibossLoc\$\.host/);
    t.end();
  }
);

tap.test(
  "rewriteInlineScriptsInHtml rewrites inline JS but leaves JSON & unblockerInit intact",
  function (t) {
    var html =
      "<html><head>" +
      '<script>unblockerInit({"prefix":"/proxy/","url":"https://neal.fun/"}, window);</script>' +
      '<script type="application/ld+json">{"location":"Earth"}</script>' +
      "<script>console.log(window.location.pathname);</script>" +
      "</head></html>";

    var out = locationRewriter.rewriteInlineScriptsInHtml(html);
    t.match(out, /unblockerInit\(/);
    t.match(out, /\{"location":"Earth"\}/);
    t.match(out, /__ibossSafe\(window\)\.__ibossLoc\$\.pathname/);
    t.end();
  }
);

tap.test(
  "client initLocationProxy & initStorageIsolation spoof origin and isolate storage",
  function (t) {
    var backing = {};
    var rawStorage = {
      getItem: function (k) {
        return Object.prototype.hasOwnProperty.call(backing, k)
          ? backing[k]
          : null;
      },
      setItem: function (k, v) {
        backing[k] = String(v);
      },
      removeItem: function (k) {
        delete backing[k];
      },
      key: function (i) {
        return Object.keys(backing)[i] || null;
      },
      get length() {
        return Object.keys(backing).length;
      },
    };

    var navigatedHref = null;
    var fakeWin = {
      URL: URL,
      Proxy: Proxy,
      location: {
        origin: "https://ibossbad.onrender.com",
        hostname: "ibossbad.onrender.com",
        pathname: "/proxy/https://neal.fun/infinite-craft/",
        search: "?mode=fast",
        hash: "#top",
        replace: function (u) {
          navigatedHref = u;
        },
      },
      document: {},
      localStorage: rawStorage,
    };

    client.initForWindow(
      {
        prefix: "/proxy/",
        url: "https://neal.fun/infinite-craft/?mode=fast#top",
        isolateStorage: true,
      },
      fakeWin
    );

    t.equal(fakeWin.__ibossLoc.origin, "https://neal.fun");
    t.equal(fakeWin.__ibossLoc.pathname, "/infinite-craft/");
    t.equal(fakeWin.__ibossLoc.search, "?mode=fast");
    t.equal(fakeWin.__ibossSafe(fakeWin).__ibossLoc$.hostname, "neal.fun");
    t.equal(fakeWin.origin, "https://neal.fun");
    t.equal(fakeWin.document.domain, "neal.fun");

    fakeWin.__ibossLoc.replace("/password-game/");
    t.equal(navigatedHref, "/proxy/https://neal.fun/password-game/");

    fakeWin.localStorage.setItem("saveData", "craft123");
    t.equal(fakeWin.localStorage.getItem("saveData"), "craft123");
    t.equal(backing["_iboss_s_https://neal.fun_saveData"], "craft123");
    t.end();
  }
);
