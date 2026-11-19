"use strict";

var fs = require("fs");
var path = require("path");
var tap = require("tap");
var JSDOM = require("jsdom").JSDOM;
var TextDecoder = require("util").TextDecoder;
var TextEncoder = require("util").TextEncoder;

function tick() {
  return new Promise(function (resolve) {
    setTimeout(resolve, 30);
  });
}

tap.test(
  "WISP page fetches independent CSS and scripts concurrently",
  async function (t) {
    var dom = new JSDOM("<!doctype html>", {
      url: "https://proxy.example/",
      runScripts: "outside-only",
    });
    var win = dom.window;
    t.teardown(function () {
      win.close();
    });
    var cssDecodes = 0;
    win.TextDecoder = function (encoding) {
      var decoder = new TextDecoder(encoding);
      this.decode = function (bytes) {
        var text = decoder.decode(bytes);
        if (text.indexOf('@import "/shared.css"') !== -1) cssDecodes++;
        return text;
      };
    };
    win.TextEncoder = TextEncoder;
    var parseCount = 0;
    var acorn = require("acorn");
    win.acorn = {
      parse: function (source, options) {
        parseCount++;
        return acorn.parse(source, options);
      },
      walk: require("acorn-walk"),
    };
    var outputBlob;
    win.URL.createObjectURL = function (blob) {
      outputBlob = blob;
      return "blob:test";
    };
    win.WebSocket = function () {
      var self = this;
      setTimeout(function () {
        if (self.onopen) self.onopen();
      }, 0);
      self.close = function () {};
    };
    var pending = {};
    var requested = [];
    function makeResponse(url, body, mime) {
      var data = Buffer.from(body, "utf8");
      return {
        url: url,
        status: 200,
        statusText: "OK",
        headers: {
          forEach: function (fn) {
            fn(mime, "content-type");
          },
        },
        arrayBuffer: async function () {
          return data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength
          );
        },
      };
    }
    var page =
      '<html><head><link rel="stylesheet" href="/site.css" media="screen"><link rel="stylesheet" href="/site.css" media="print"><style>body{background:url(/inline.png)}</style><style>p{background:url(/inline.png)}</style><script src="/classic.js"></script><script src="/classic.js"></script><script type="module" src="/module.js"></script><script type="module" src="/module.js"></script></head><body>hello</body></html>';
    win.libcurl = {
      load_wasm: function () {
        return Promise.resolve();
      },
      set_websocket: function () {},
      HTTPSession: function () {
        this.set_connections = function () {};
        this.fetch = function (url) {
          requested.push(url);
          if (url === "https://example.com/")
            return Promise.resolve(makeResponse(url, page, "text/html"));
          return new Promise(function (resolve) {
            pending[url] = resolve;
          });
        };
      },
    };
    win.eval(
      fs.readFileSync(path.join(__dirname, "../public/wisp-engine.js"), "utf8")
    );
    var engine = win.IbossWispEngine.create({});
    var pagePromise = engine.loadPage("https://example.com/", "tab-1");
    await tick();
    t.ok(
      requested.includes("https://example.com/site.css"),
      "stylesheet fetch started"
    );
    t.ok(
      requested.includes("https://example.com/inline.png"),
      "inline style asset starts before external stylesheet finishes"
    );
    t.ok(
      requested.includes("https://example.com/classic.js"),
      "classic script fetch starts before stylesheet finishes"
    );
    t.ok(
      requested.includes("https://example.com/module.js"),
      "module fetch starts before stylesheet finishes"
    );
    t.equal(
      requested.filter(function (url) {
        return url === "https://example.com/site.css";
      }).length,
      1,
      "duplicate stylesheets share one in-flight request"
    );
    t.equal(
      requested.filter(function (url) {
        return url === "https://example.com/classic.js";
      }).length,
      1,
      "duplicate classic scripts share one in-flight request"
    );
    t.equal(
      requested.filter(function (url) {
        return url === "https://example.com/inline.png";
      }).length,
      1,
      "inline styles share an identical in-flight image request"
    );
    if (pending["https://example.com/inline.png"])
      pending["https://example.com/inline.png"](
        makeResponse("https://example.com/inline.png", "image", "image/png")
      );
    if (pending["https://example.com/site.css"])
      pending["https://example.com/site.css"](
        makeResponse(
          "https://example.com/site.css",
          '@import "/shared.css";body{color:red;background:url(/bg.png)}',
          "text/css"
        )
      );
    await tick();
    t.equal(
      requested.filter(function (url) {
        return url === "https://example.com/shared.css";
      }).length,
      1,
      "duplicate stylesheet imports share one request"
    );
    if (pending["https://example.com/shared.css"])
      pending["https://example.com/shared.css"](
        makeResponse(
          "https://example.com/shared.css",
          "h1{color:blue}",
          "text/css"
        )
      );
    await tick();
    t.equal(
      requested.filter(function (url) {
        return url === "https://example.com/bg.png";
      }).length,
      1,
      "duplicate stylesheet image requests are shared"
    );
    if (pending["https://example.com/bg.png"])
      pending["https://example.com/bg.png"](
        makeResponse("https://example.com/bg.png", "image", "image/png")
      );
    if (pending["https://example.com/classic.js"])
      pending["https://example.com/classic.js"](
        makeResponse(
          "https://example.com/classic.js",
          "console.log(window.location.href);",
          "text/javascript"
        )
      );
    if (pending["https://example.com/module.js"])
      pending["https://example.com/module.js"](
        makeResponse(
          "https://example.com/module.js",
          "export default 1;",
          "text/javascript"
        )
      );
    var output = await pagePromise;
    t.equal(
      output.blobUrl,
      "blob:test",
      "document completes after assets finish"
    );
    var serialized = await new Promise(function (resolve, reject) {
      var reader = new win.FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsText(outputBlob);
    });
    t.match(
      serialized,
      /body\{color:red;/,
      "stylesheet remains in the document"
    );
    t.equal(
      cssDecodes,
      1,
      "duplicate stylesheet content is decoded and rewritten once"
    );
    var parsedDoc = new win.DOMParser().parseFromString(
      serialized,
      "text/html"
    );
    t.equal(
      parsedDoc.querySelectorAll('style[media="screen"]').length,
      1,
      "screen media is preserved"
    );
    t.equal(
      parsedDoc.querySelectorAll('style[media="print"]').length,
      1,
      "print media is preserved"
    );
    t.equal(
      parseCount,
      1,
      "duplicate classic scripts are parsed and rewritten once"
    );
    t.equal(
      (serialized.match(/body\{color:red;/g) || []).length,
      2,
      "both stylesheet elements are retained"
    );
    t.equal(
      new win.DOMParser()
        .parseFromString(serialized, "text/html")
        .querySelectorAll(
          'script[src^="data:text/javascript;charset=utf-8;base64,"]'
        ).length,
      4,
      "both classic and duplicate module elements retain valid data URLs"
    );
    t.match(
      serialized,
      /data:image\/png;base64,/,
      "inline style asset is rewritten"
    );
    t.match(
      serialized,
      /type="importmap"/,
      "module import map remains present"
    );
    t.match(
      serialized,
      /data:text\/javascript;charset=utf-8;base64,/,
      "scripts are rewritten to data URLs"
    );
  }
);

tap.test(
  "concurrent WISP connects share one probe and one session",
  async function (t) {
    var dom = new JSDOM("<!doctype html>", {
      url: "https://proxy.example/",
      runScripts: "outside-only",
    });
    var win = dom.window;
    t.teardown(function () {
      win.close();
    });
    var probes = [];
    var sessions = 0;
    var closes = 0;
    win.WebSocket = function (url) {
      var self = this;
      probes.push({ url: url, socket: self });
      self.close = function () {};
    };
    win.libcurl = {
      load_wasm: function () {
        return Promise.resolve();
      },
      set_websocket: function () {},
      HTTPSession: function () {
        sessions++;
        this.close = function () {
          closes++;
        };
      },
    };
    win.eval(
      fs.readFileSync(path.join(__dirname, "../public/wisp-engine.js"), "utf8")
    );
    var engine = win.IbossWispEngine.create({});
    var jobs = Array.from({ length: 20 }, function () {
      return engine.ensureConnected();
    });
    await tick();
    var initialProbeCount = probes.length;
    probes.slice().forEach(function (p) {
      p.socket.onopen();
    });
    await Promise.all(jobs);
    t.equal(
      initialProbeCount,
      1,
      "20 simultaneous callers initiate one relay probe"
    );
    t.equal(sessions, 1, "only one libcurl session is created");
    t.equal(closes, 0, "no in-flight caller replaces and closes the session");
  }
);

tap.test(
  "changing relay during an in-flight probe discards the stale result",
  async function (t) {
    var dom = new JSDOM("<!doctype html>", {
      url: "https://proxy.example/",
      runScripts: "outside-only",
    });
    var win = dom.window;
    t.teardown(function () {
      win.close();
    });
    var probes = [];
    var endpoints = [];
    var sessions = 0;
    win.WebSocket = function (url) {
      var self = this;
      self.close = function () {};
      probes.push({ url: url, socket: self });
    };
    win.libcurl = {
      load_wasm: function () {
        return Promise.resolve();
      },
      set_websocket: function (url) {
        endpoints.push(url);
      },
      HTTPSession: function () {
        sessions++;
        this.close = function () {};
      },
    };
    win.eval(
      fs.readFileSync(path.join(__dirname, "../public/wisp-engine.js"), "utf8")
    );
    var engine = win.IbossWispEngine.create({});
    var oldJob = engine.ensureConnected();
    await tick();
    t.equal(probes.length, 1, "self relay is being probed");
    engine.configure({ customWispUrl: "wss://relay.example/" });
    await tick();
    t.equal(probes.length, 2, "new custom relay begins its own probe");
    probes[1].socket.onopen();
    await tick();
    probes[0].socket.onopen();
    await oldJob;
    t.same(
      endpoints,
      ["wss://relay.example/"],
      "old probe cannot overwrite selected relay"
    );
    t.equal(sessions, 1, "stale probe does not replace active session");
  }
);

tap.test("failed WISP initialization can be retried", async function (t) {
  var dom = new JSDOM("<!doctype html>", {
    url: "https://proxy.example/",
    runScripts: "outside-only",
  });
  var win = dom.window;
  t.teardown(function () {
    win.close();
  });
  var calls = 0;
  win.WebSocket = function () {
    var self = this;
    self.close = function () {};
    setTimeout(function () {
      self.onopen();
    }, 0);
  };
  win.libcurl = {
    load_wasm: function () {
      calls++;
      return calls === 1
        ? Promise.reject(new Error("failed"))
        : Promise.resolve();
    },
    set_websocket: function () {},
    HTTPSession: function () {},
  };
  win.eval(
    fs.readFileSync(path.join(__dirname, "../public/wisp-engine.js"), "utf8")
  );
  var engine = win.IbossWispEngine.create({});
  await t.rejects(
    engine.ensureConnected(),
    /failed/,
    "first initialization failure is reported"
  );
  await engine.ensureConnected();
  t.equal(calls, 2, "subsequent call retries initialization");
});

tap.test(
  "WISP stylesheet downloads with distinct referers remain independent",
  async function (t) {
    var dom = new JSDOM("<!doctype html>", {
      url: "https://proxy.example/",
      runScripts: "outside-only",
    });
    var win = dom.window;
    t.teardown(function () {
      win.close();
    });
    win.TextDecoder = TextDecoder;
    win.TextEncoder = TextEncoder;
    win.URL.createObjectURL = function () {
      return "blob:test";
    };
    win.WebSocket = function () {
      var self = this;
      self.close = function () {};
      setTimeout(function () {
        self.onopen();
      }, 0);
    };
    var pending = [];
    var referers = [];
    function response(url, body, type) {
      var buf = Buffer.from(body);
      return {
        url: url,
        status: 200,
        headers: {
          forEach: function (fn) {
            fn(type, "content-type");
          },
        },
        arrayBuffer: async function () {
          return buf.buffer.slice(
            buf.byteOffset,
            buf.byteOffset + buf.byteLength
          );
        },
      };
    }
    win.libcurl = {
      load_wasm: async function () {},
      set_websocket: function () {},
      HTTPSession: function () {
        this.set_connections = function () {};
        this.fetch = function (url, opts) {
          if (url === "https://example.com/") {
            return Promise.resolve(
              response(
                url,
                '<link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/b.css">',
                "text/html"
              )
            );
          }
          if (/\.css$/.test(url)) {
            return Promise.resolve(
              response(url, "body{background:url(/same.png)}", "text/css")
            );
          }
          referers.push(opts.headers.Referer);
          return new Promise(function (resolve) {
            pending.push(resolve);
          });
        };
      },
    };
    win.eval(
      fs.readFileSync(path.join(__dirname, "../public/wisp-engine.js"), "utf8")
    );
    var job = win.IbossWispEngine.create({}).loadPage(
      "https://example.com/",
      "tab"
    );
    await tick();
    t.same(
      referers.sort(),
      ["https://example.com/a.css", "https://example.com/b.css"],
      "different referers are not coalesced"
    );
    pending.forEach(function (resolve) {
      resolve(response("https://example.com/same.png", "img", "image/png"));
    });
    await job;
  }
);

tap.test(
  "WISP stylesheet URL replacement preserves limits and untouched resources",
  async function (t) {
    var dom = new JSDOM("", {
      url: "https://proxy.example/",
      runScripts: "outside-only",
    });
    var win = dom.window;
    t.teardown(function () {
      win.close();
    });
    win.TextDecoder = TextDecoder;
    win.TextEncoder = TextEncoder;
    var blob;
    win.URL.createObjectURL = function (value) {
      blob = value;
      return "blob:test";
    };
    win.WebSocket = function () {
      var self = this;
      self.close = function () {};
      setTimeout(function () {
        self.onopen();
      }, 0);
    };
    var css =
      Array.from({ length: 62 }, function (_, i) {
        return ".i" + i + "{background:url(/img" + i + ".png)}";
      }).join("") +
      ".duplicate{background:url(/img0.png)}.skip{background:url(data:image/png;base64,QQ==)}";
    var requests = [];
    function response(url, value, mime) {
      var buf = Buffer.from(value);
      return {
        url: url,
        status: 200,
        headers: {
          forEach: function (fn) {
            fn(mime, "content-type");
          },
        },
        arrayBuffer: async function () {
          return buf.buffer.slice(
            buf.byteOffset,
            buf.byteOffset + buf.byteLength
          );
        },
      };
    }
    win.libcurl = {
      load_wasm: async function () {},
      set_websocket: function () {},
      HTTPSession: function () {
        this.set_connections = function () {};
        this.fetch = function (url) {
          requests.push(url);
          if (url === "https://example.com/")
            return Promise.resolve(
              response(url, "<style>" + css + "</style>", "text/html")
            );
          return Promise.resolve(
            response(url, /img3\.png$/.test(url) ? "" : "asset", "image/png")
          );
        };
      },
    };
    win.eval(
      fs.readFileSync(path.join(__dirname, "../public/wisp-engine.js"), "utf8")
    );
    await win.IbossWispEngine.create({}).loadPage(
      "https://example.com/",
      "tab"
    );
    var html = await new Promise(function (resolve, reject) {
      var reader = new win.FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    var style = new win.DOMParser()
      .parseFromString(html, "text/html")
      .querySelector("style").textContent;
    var embedded = 'url("data:image/png;base64,YXNzZXQ=")';
    t.match(style, ".i0{background:" + embedded + "}");
    t.match(
      style,
      ".duplicate{background:" + embedded + "}",
      "duplicate occurrences are replaced"
    );
    t.match(
      style,
      ".i3{background:url(/img3.png)}",
      "empty responses leave their original URL"
    );
    t.match(
      style,
      ".i60{background:url(/img60.png)}",
      "URLs beyond the 60-resource cap remain untouched"
    );
    t.match(
      style,
      "url(data:image/png;base64,QQ==)",
      "preexisting data URLs stay untouched"
    );
    t.equal(
      requests.length,
      61,
      "fetches the document and at most 60 unique assets"
    );
  }
);

tap.test(
  "duplicate module roots share work without deadlocking cyclic imports",
  async function (t) {
    var dom = new JSDOM("", {
      url: "https://proxy.example/",
      runScripts: "outside-only",
    });
    var win = dom.window;
    t.teardown(function () {
      win.close();
    });
    win.TextEncoder = TextEncoder;
    win.TextDecoder = TextDecoder;
    var blob;
    win.URL.createObjectURL = function (value) {
      blob = value;
      return "blob:test";
    };
    win.WebSocket = function () {
      var socket = this;
      socket.close = function () {};
      setTimeout(function () {
        socket.onopen();
      }, 0);
    };
    var fetched = [];
    function response(url, text, mime) {
      var buffer = Buffer.from(text);
      return {
        url: url,
        status: 200,
        headers: {
          forEach: function (fn) {
            fn(mime, "content-type");
          },
        },
        arrayBuffer: async function () {
          return buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength
          );
        },
      };
    }
    win.libcurl = {
      load_wasm: async function () {},
      set_websocket: function () {},
      HTTPSession: function () {
        this.set_connections = function () {};
        this.fetch = async function (url) {
          fetched.push(url);
          if (url === "https://example.com/")
            return response(
              url,
              '<script type="module" src="/a.js"></script><script type="module" src="/a.js"></script>',
              "text/html"
            );
          if (url.endsWith("/a.js"))
            return response(
              url,
              'import "./b.js"; export const a = 1;',
              "text/javascript"
            );
          return response(
            url,
            'import "./a.js"; export const b = 2;',
            "text/javascript"
          );
        };
      },
    };
    win.eval(
      fs.readFileSync(path.join(__dirname, "../public/wisp-engine.js"), "utf8")
    );
    var timer;
    try {
      await Promise.race([
        win.IbossWispEngine.create({}).loadPage("https://example.com/", "tab"),
        new Promise(function (_resolve, reject) {
          timer = setTimeout(function () {
            reject(new Error("cyclic module graph timed out"));
          }, 1000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    var html = await new Promise(function (resolve, reject) {
      var reader = new win.FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    var page = new win.DOMParser().parseFromString(html, "text/html");
    var modules = page.querySelectorAll(
      'script[type="module"][src^="data:text/javascript;"]'
    );
    t.equal(modules.length, 2, "both module elements get usable data URLs");
    t.equal(
      modules[0].src,
      modules[1].src,
      "both roots use the same rewritten module"
    );
    t.equal(
      fetched.filter(function (url) {
        return url.endsWith("/a.js");
      }).length,
      1
    );
    t.equal(
      fetched.filter(function (url) {
        return url.endsWith("/b.js");
      }).length,
      1
    );
    t.match(
      page.querySelector('script[type="importmap"]').textContent,
      /https:\/\/example\.com\/b\.js/,
      "dependency remains in import map"
    );
  }
);

tap.test(
  "WISP native byte Base64 matches the legacy path and falls back on failure",
  async function (t) {
    async function assemble(mode) {
      var dom = new JSDOM("", {
        url: "https://proxy.example/",
        runScripts: "outside-only",
      });
      var win = dom.window;
      win.TextDecoder = TextDecoder;
      win.TextEncoder = TextEncoder;
      var nativeCalls = 0;
      if (mode !== "legacy") {
        win.Uint8Array.prototype.toBase64 = function () {
          nativeCalls++;
          if (mode === "throws") throw new Error("unsupported");
          return Buffer.from(this).toString("base64");
        };
      }
      var blob;
      win.URL.createObjectURL = function (value) {
        blob = value;
        return "blob:test";
      };
      win.WebSocket = function () {
        var socket = this;
        socket.close = function () {};
        setTimeout(function () {
          socket.onopen();
        }, 0);
      };
      function response(url, body, mime) {
        var bytes = Buffer.from(body);
        return {
          url: url,
          status: 200,
          headers: {
            forEach: function (fn) {
              fn(mime, "content-type");
            },
          },
          arrayBuffer: async function () {
            return bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength
            );
          },
        };
      }
      win.libcurl = {
        load_wasm: async function () {},
        set_websocket: function () {},
        HTTPSession: function () {
          this.set_connections = function () {};
          this.fetch = async function (url) {
            if (url === "https://example.com/")
              return response(
                url,
                '<style>body{background:url(/img.png)}</style><script src="/app.js"></script>',
                "text/html"
              );
            if (url.endsWith(".js"))
              return response(url, "console.log('🌟');", "text/javascript");
            return response(
              url,
              Buffer.from([0, 1, 2, 127, 128, 254, 255]),
              "image/png"
            );
          };
        },
      };
      win.eval(
        fs.readFileSync(
          path.join(__dirname, "../public/wisp-engine.js"),
          "utf8"
        )
      );
      await win.IbossWispEngine.create({}).loadPage(
        "https://example.com/",
        "tab"
      );
      var html = await new Promise(function (resolve, reject) {
        var reader = new win.FileReader();
        reader.onload = function () {
          resolve(reader.result);
        };
        reader.onerror = reject;
        reader.readAsText(blob);
      });
      win.close();
      return { html: html, nativeCalls: nativeCalls };
    }
    var legacy = await assemble("legacy");
    var native = await assemble("native");
    var broken = await assemble("throws");
    t.ok(
      native.nativeCalls >= 2,
      "native encoding used for stylesheet assets and scripts"
    );
    t.equal(
      native.html,
      legacy.html,
      "native encoding preserves bytes and unicode"
    );
    t.ok(broken.nativeCalls >= 2, "broken native implementation was attempted");
    t.equal(
      broken.html,
      legacy.html,
      "exceptions fall back to the previous implementation"
    );
  }
);
