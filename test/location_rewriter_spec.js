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

tap.test(
  "HTML rewriting streams prefixes and preserves split inline scripts",
  async function (t) {
    var PassThrough = require("stream").PassThrough;
    var html =
      '<html><head><title>🌟</title><script src="/a.js"></script>' +
      '<script type="application/ld+json">{"location":"Earth"}</script>' +
      "<script>unblockerInit({location:1},window)</script>" +
      '<ScRiPt>console.log(window.location.pathname, "🌍");</sCrIpT>' +
      "<script>const partial=location.href" +
      "</head></html>";
    var expected = locationRewriter.rewriteInlineScriptsInHtml(html);
    var inputBytes = Buffer.from(html);
    for (var size of [1, 2, 3, 7, 16, 1024]) {
      var input = new PassThrough();
      var data = {
        stream: input,
        contentType: "text/html",
        url: "https://example.com/",
      };
      locationRewriter({ rewriteLocation: true })(data);
      var chunks = [];
      var complete = new Promise(function (resolve, reject) {
        data.stream.on("data", function (chunk) {
          chunks.push(chunk);
        });
        data.stream.on("end", resolve);
        data.stream.on("error", reject);
      });
      for (var i = 0; i < inputBytes.length; i += size)
        input.write(inputBytes.subarray(i, i + size));
      input.end();
      await complete;
      t.equal(
        Buffer.concat(chunks).toString(),
        expected,
        "matches original rewrite for chunk size " + size
      );
    }
  }
);

tap.test(
  "oversized JavaScript streams without waiting for end or changing bytes",
  async function (t) {
    var PassThrough = require("stream").PassThrough;
    var input = new PassThrough();
    var data = {
      stream: input,
      contentType: "application/javascript",
      url: "https://example.com/a.js",
    };
    locationRewriter({ rewriteLocation: true })(data);
    var firstChunk = new Promise(function (resolve) {
      data.stream.once("data", resolve);
    });
    var chunks = [];
    data.stream.on("data", function (chunk) {
      chunks.push(chunk);
    });
    var complete = new Promise(function (resolve) {
      data.stream.on("end", resolve);
    });
    var large = Buffer.alloc(6 * 1024 * 1024 + 1, 97);
    input.write(large);
    var first = await firstChunk;
    t.equal(
      first.length,
      large.length,
      "forwards oversized content before upstream ends"
    );
    input.end(Buffer.from("end"));
    await complete;
    t.same(
      Buffer.concat(chunks),
      Buffer.concat([large, Buffer.from("end")]),
      "passes through every byte"
    );
  }
);

tap.test(
  "oversized inline scripts bypass rewriting while continuing to stream UTF-8",
  async function (t) {
    var PassThrough = require("stream").PassThrough;
    var input = new PassThrough();
    var data = {
      stream: input,
      contentType: "text/html",
      url: "https://example.com/",
    };
    locationRewriter({ rewriteLocation: true })(data);
    var chunks = [];
    data.stream.on("data", function (chunk) {
      chunks.push(chunk);
    });
    var complete = new Promise(function (resolve) {
      data.stream.on("end", resolve);
    });
    var prefix = Buffer.from("<script>" + "a".repeat(6 * 1024 * 1024 + 1));
    input.write(prefix);
    t.ok(
      chunks.length > 0,
      "large unfinished script is forwarded before origin ends"
    );
    var suffix = Buffer.from("🌟</script><p>end</p>");
    input.write(suffix.subarray(0, 2));
    input.end(suffix.subarray(2));
    await complete;
    t.same(
      Buffer.concat(chunks),
      Buffer.concat([prefix, suffix]),
      "oversized content and split UTF-8 remain intact"
    );
  }
);

tap.test(
  "batched location edits match the previous algorithm, including nested edits",
  function (t) {
    var fs = require("fs");
    var path = require("path");
    var Module = require("module");
    var JSDOM = require("jsdom").JSDOM;
    var legacyLoop = [
      "var out = src;",
      "for (var i = 0; i < edits.length; i++) {",
      "  var e = edits[i];",
      "  out = out.slice(0, e.start) + e.text + out.slice(e.end);",
      "}",
      "return out;",
    ].join("\n");
    function useLegacyLoop(src, indent) {
      var marker = indent + "// Assemble non-overlapping edits";
      var start = src.indexOf(marker);
      var end = src.indexOf("\n" + indent.slice(0, -2) + "}", start);
      if (start < 0 || end < 0) throw new Error("rewrite assembly not found");
      return (
        src.slice(0, start) +
        indent +
        legacyLoop.replace(/\n/g, "\n" + indent) +
        src.slice(end)
      );
    }
    var file = path.join(__dirname, "../lib/location-rewriter.js");
    var legacyModule = new Module(file, module);
    legacyModule.filename = file;
    legacyModule.paths = module.paths;
    legacyModule._compile(
      useLegacyLoop(fs.readFileSync(file, "utf8"), "  "),
      file
    );
    var dom = new JSDOM("", {
      url: "https://proxy.example/",
      runScripts: "outside-only",
    });
    t.teardown(function () {
      dom.window.close();
    });
    dom.window.acorn = Object.assign({}, require("acorn"), {
      walk: require("acorn-walk"),
    });
    var browserSource = fs.readFileSync(
      path.join(__dirname, "../public/wisp-engine.js"),
      "utf8"
    );
    dom.window.eval(useLegacyLoop(browserSource, "    "));
    var legacyBrowser = dom.window.IbossWispEngine.rewriteLocationRefs;
    dom.window.eval(browserSource);
    var optimizedBrowser = dom.window.IbossWispEngine.rewriteLocationRefs;
    var samples = [
      "window.location.href; location = '/'; document['location'].hash;",
      "window.location.location; obj?.location?.href; (a,b).location;",
      "location[location]; obj[location] = window.location;",
      "const o = {location: 1}; window.location;",
      "const location = 1; window.location;",
      "window.location.href;".repeat(1500),
    ];
    samples.forEach(function (source, i) {
      t.equal(
        locationRewriter.rewriteLocationRefs(source),
        legacyModule.exports.rewriteLocationRefs(source),
        "Stream output matches legacy case " + i
      );
      t.equal(
        optimizedBrowser(source),
        legacyBrowser(source),
        "GUST output matches legacy case " + i
      );
    });
    t.end();
  }
);

tap.test(
  "large inline scripts preserve split closing tags and stream past the size limit",
  async function (t) {
    var PassThrough = require("stream").PassThrough;
    async function run(html, size, beforeEnd) {
      var input = new PassThrough();
      var data = {
        stream: input,
        contentType: "text/html",
        url: "https://example.test/",
      };
      locationRewriter({ rewriteLocation: true })(data);
      var chunks = [];
      data.stream.on("data", function (c) {
        chunks.push(c);
      });
      var complete = new Promise(function (resolve, reject) {
        data.stream.on("end", resolve);
        data.stream.on("error", reject);
      });
      var bytes = Buffer.from(html);
      var split = beforeEnd || bytes.length;
      for (var i = 0; i < split; i += size)
        input.write(bytes.subarray(i, Math.min(i + size, split)));
      var forwardedBeforeEnd = Buffer.concat(chunks).length;
      input.end(bytes.subarray(split));
      await complete;
      return {
        output: Buffer.concat(chunks).toString(),
        forwarded: forwardedBeforeEnd,
      };
    }
    var html =
      "<p>start</p><script>/*" +
      "x".repeat(1024 * 1024) +
      "🌟*/window.location.href</script><p>end</p>";
    var rewritten = await run(html, 1021);
    t.equal(
      rewritten.output,
      locationRewriter.rewriteInlineScriptsInHtml(html),
      "rewrites a chunked megabyte script exactly"
    );
    var prefix = "<script>" + "x".repeat(6 * 1024 * 1024 + 128);
    var large = prefix + "🌟</script><p>end</p>";
    var bypass = await run(large, 8192, Buffer.byteLength(prefix));
    t.ok(
      bypass.forwarded >= Buffer.byteLength(prefix),
      "forwards an oversized unfinished script without waiting for the closing tag"
    );
    t.equal(
      bypass.output,
      large,
      "oversized chunked script and following content remain intact"
    );
  }
);
