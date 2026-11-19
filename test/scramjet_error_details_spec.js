"use strict";

var fs = require("fs");
var vm = require("vm");
var path = require("path");
var tap = require("tap");

function loadWorker() {
  var sandbox = {
    URL: URL,
    Response: global.Response,
    Set: Set,
    Map: Map,
    Promise: Promise,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    importScripts: function () {},
    $scramjetLoadWorker: function () {
      return { ScramjetServiceWorker: function () {} };
    },
    self: {
      location: { origin: "https://proxy.example" },
      addEventListener: function () {},
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../public/sw.js"), "utf8"),
    sandbox
  );
  return sandbox;
}

tap.test(
  "Scramjet recovery extracts real encoded error traces without executing them",
  async function (t) {
    var map = JSON.parse(
      fs.readFileSync(
        path.join(
          __dirname,
          "../node_modules/@mercuryworkshop/scramjet/dist/scramjet.all.js.map"
        ),
        "utf8"
      )
    );
    var index = map.sources.findIndex(function (source) {
      return source.endsWith("/src/worker/error.ts");
    });
    t.ok(index >= 0, "uses the installed Scramjet error template");
    var templateSource = map.sourcesContent[index]
      .split("export function renderError")[0]
      .replace(
        "export function errorTemplate(trace: string, fetchedURL: string)",
        "function errorTemplate(trace, fetchedURL)"
      )
      .replace(/\(globalThis as any\)/g, "globalThis");
    var makeTemplate = new Function(
      "location",
      "globalThis",
      templateSource + "\nreturn errorTemplate;"
    )({ hostname: "proxy.example" }, {});
    var worker = loadWorker();
    var trace =
      'Error: TLS handshake failed for <script>alert("x")</script>\n    at transport.fetch';
    var realTemplate = makeTemplate(trace, "https://example.com/");
    var parsed = worker.extractScramjetError(realTemplate);
    t.equal(
      parsed,
      trace.split("\n")[0],
      "extracts first line of the actual Scramjet trace"
    );
    var recovery = await worker
      .buildSmartRecoveryResponse("https://example.com/", parsed)
      .text();
    t.match(
      recovery,
      /TLS handshake failed/,
      "recovery page reports actionable details"
    );
    t.match(
      recovery,
      /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/,
      "error content is escaped"
    );
    t.notMatch(
      recovery,
      /<script>alert\("x"\)<\/script>/,
      "trace cannot inject executable HTML"
    );
    t.match(recovery, /Open via Stream/, "Stream fallback remains available");
    t.equal(
      worker.extractScramjetError(
        "Message: Request failed with error code 52\n"
      ),
      "Request failed with error code 52",
      "legacy format remains supported"
    );
    t.equal(
      worker.extractScramjetError(
        '<script src="data:application/javascript,%ZZ"></script>'
      ),
      "Scramjet did not provide error details",
      "malformed encoded script safely falls back"
    );
    t.equal(
      worker.extractScramjetError(
        '<script src="data:application/javascript,alert(1)"></script>'
      ),
      "Scramjet did not provide error details",
      "arbitrary script is never evaluated"
    );
  }
);
