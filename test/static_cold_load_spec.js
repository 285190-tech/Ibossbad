"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var zlib = require("zlib");
var test = require("tap").test;
var createApp = require("../lib/app");

function get(port, method, headers, requestPath) {
  return new Promise(function (resolve, reject) {
    var req = http.request(
      {
        host: "127.0.0.1",
        port: port,
        path: requestPath || "/",
        method: method,
        headers: headers,
      },
      function (res) {
        var chunks = [];
        res.on("data", function (chunk) {
          chunks.push(chunk);
        });
        res.on("end", function () {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

test("cold static requests share file reads and compression", async function (t) {
  var server = http.createServer(
    createApp({
      passcode: "test",
      adminPassword: "test",
      autoLoadSupabase: false,
      skipInternetProbe: true,
    }).app
  );
  await new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", resolve);
  });
  var port = server.address().port;
  var originalRead = fs.readFile;
  var originalBr = zlib.brotliCompress;
  var originalGzip = zlib.gzip;
  var reads = 0,
    br = 0,
    gzip = 0;
  fs.readFile = function (file, callback) {
    if (file === path.resolve(__dirname, "../public/index.html")) {
      reads++;
      return setTimeout(function () {
        originalRead.call(fs, file, callback);
      }, 50);
    }
    return originalRead.apply(fs, arguments);
  };
  zlib.brotliCompress = function () {
    br++;
    return originalBr.apply(zlib, arguments);
  };
  zlib.gzip = function () {
    gzip++;
    return originalGzip.apply(zlib, arguments);
  };
  try {
    var responses = await Promise.all(
      Array.from({ length: 30 }, function (_, i) {
        return get(port, i === 0 ? "HEAD" : "GET", {
          "Accept-Encoding": i % 2 ? "br" : "gzip",
        });
      })
    );
    t.equal(reads, 1, "one disk read for simultaneous cold requests");
    t.equal(br, 1, "one Brotli job");
    t.equal(gzip, 1, "one gzip job");
    var original = fs.readFileSync(
      path.resolve(__dirname, "../public/index.html")
    );
    responses.forEach(function (res, i) {
      t.equal(res.status, 200, "request succeeds");
      if (i === 0) {
        t.equal(res.body.length, 0, "HEAD has no body");
      } else {
        t.same(
          (i % 2 ? zlib.brotliDecompressSync : zlib.gunzipSync)(res.body),
          original,
          "compressed body matches source"
        );
      }
    });
    var cached = await get(port, "GET", {
      "Accept-Encoding": "br",
      "If-None-Match": responses[1].headers.etag,
    });
    t.equal(cached.status, 304, "conditional requests still revalidate");
    t.equal(br, 1, "warm response does not recompress");
  } finally {
    fs.readFile = originalRead;
    zlib.brotliCompress = originalBr;
    zlib.gzip = originalGzip;
    await new Promise(function (resolve) {
      server.close(resolve);
    });
  }
});

test("failed compression falls back to raw bytes and retries", async function (t) {
  var server = http.createServer(
    createApp({
      passcode: "test",
      adminPassword: "test",
      autoLoadSupabase: false,
      skipInternetProbe: true,
    }).app
  );
  await new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", resolve);
  });
  var original = zlib.gzip;
  var attempts = 0;
  zlib.gzip = function (data, options, callback) {
    attempts++;
    if (attempts === 1)
      return setTimeout(function () {
        callback(new Error("test failure"));
      }, 30);
    return original.call(zlib, data, options, callback);
  };
  try {
    var port = server.address().port;
    var results = await Promise.all(
      Array.from({ length: 10 }, function () {
        return get(
          port,
          "GET",
          { "Accept-Encoding": "gzip" },
          "/ui/styles.css"
        );
      })
    );
    t.equal(attempts, 1, "failed compression is shared");
    results.forEach(function (res) {
      t.equal(
        res.headers["content-encoding"],
        undefined,
        "serves raw fallback"
      );
      t.ok(res.body.length > 1000, "fallback contains content");
    });
    var retried = await get(
      port,
      "GET",
      { "Accept-Encoding": "gzip" },
      "/ui/styles.css"
    );
    t.equal(attempts, 2, "later request retries");
    t.equal(
      retried.headers["content-encoding"],
      "gzip",
      "retry compressed successfully"
    );
  } finally {
    zlib.gzip = original;
    await new Promise(function (resolve) {
      server.close(resolve);
    });
  }
});
