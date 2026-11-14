"use strict";

var http = require("http");
var test = require("tap").test;
var createApp = require("../lib/app.js");

function requestJson(port, method, requestPath, body, headers) {
  return new Promise(function (resolve, reject) {
    var payload = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    var requestHeaders = Object.assign({}, headers || {});
    if (payload) {
      requestHeaders["Content-Type"] = "application/json";
      requestHeaders["Content-Length"] = String(payload.length);
    }
    var req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: requestPath,
        method: method,
        headers: requestHeaders,
      },
      function (res) {
        var chunks = [];
        res.on("data", function (chunk) {
          chunks.push(chunk);
        });
        res.on("end", function () {
          var raw = Buffer.concat(chunks).toString("utf8");
          var json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch (_err) {
            // Keep the helper useful for non-JSON error responses.
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: raw,
            json: json,
          });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function listen(server) {
  return new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise(function (resolve) {
    if (!server || !server.listening) return resolve();
    server.close(resolve);
  });
}

async function startAppServer(options) {
  var instance = createApp(options);
  var server = http.createServer(instance.app);
  instance.attachUpgrade(server);
  await listen(server);
  return { instance: instance, server: server, port: server.address().port };
}

async function login(port, passcode) {
  var response = await requestJson(port, "POST", "/api/auth/passcode", {
    passcode: passcode,
  });
  var setCookie = response.headers["set-cookie"] || [];
  return {
    response: response,
    cookie: setCookie.length ? setCookie[0].split(";")[0] : "",
  };
}

test("Game availability API checks mirror games through configured fallbacks", async function (t) {
  var primaryHits = 0;
  var fallbackHits = 0;
  var primary = http.createServer(function (req, res) {
    primaryHits++;
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not present on primary");
  });
  var fallback = http.createServer(function (req, res) {
    fallbackHits++;
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("Mirror fallback game");
  });
  var appServer;
  await listen(primary);
  await listen(fallback);

  try {
    appServer = await startAppServer({
      passcode: "catalog-pass",
      adminPassword: "catalog-admin",
      autoLoadSupabase: false,
      skipInternetProbe: true,
      mggMirrors: [
        "http://127.0.0.1:" + primary.address().port + "/",
        "http://127.0.0.1:" + fallback.address().port + "/",
      ],
    });

    var unauthenticated = await requestJson(
      appServer.port,
      "POST",
      "/api/games/check",
      { urls: ["/mgg-games/slope/"] }
    );
    t.equal(
      unauthenticated.status,
      401,
      "availability checks require an unlocked session"
    );

    var loginResult = await login(appServer.port, "catalog-pass");
    t.equal(
      loginResult.response.status,
      200,
      "passcode login creates a session"
    );
    var checked = await requestJson(
      appServer.port,
      "POST",
      "/api/games/check",
      { urls: ["/mgg-games/slope/"] },
      { Cookie: loginResult.cookie }
    );

    t.equal(checked.status, 200, "catalog game can be checked");
    t.equal(
      primaryHits,
      2,
      "the primary receives a mirror health probe and per-game check"
    );
    t.equal(
      fallbackHits,
      2,
      "the fallback is probed and then serves after primary returns 404"
    );
    t.equal(
      checked.json.availability["/mgg-games/slope/"].status,
      "available",
      "per-game availability reflects the successful fallback"
    );
    t.equal(
      checked.json.availability["/mgg-games/slope/"].mirrorId,
      "mirror-2",
      "status records identify the mirror that served the game"
    );
    t.ok(
      checked.json.availability["/mgg-games/slope/"].lastCheckedAt,
      "per-game status includes a last-checked timestamp"
    );
    t.equal(
      checked.json.mirrors[0].httpStatus,
      404,
      "mirror health records the primary's response"
    );
    t.equal(
      checked.json.mirrors[1].status,
      "available",
      "mirror health shows the working alternate"
    );

    var cached = await requestJson(appServer.port, "GET", "/api/games");
    t.equal(
      cached.json.availability["/mgg-games/slope/"].mirrorId,
      "mirror-2",
      "the Games API exposes the cached per-game result"
    );

    var served = await requestJson(
      appServer.port,
      "GET",
      "/mgg-games/slope/",
      null,
      { Cookie: loginResult.cookie }
    );
    t.equal(
      served.status,
      200,
      "the actual game route uses the healthy fallback"
    );
    t.match(
      served.body,
      /Mirror fallback game/,
      "fallback content reaches the caller"
    );

    var tooMany = await requestJson(
      appServer.port,
      "POST",
      "/api/games/check",
      { urls: new Array(25).fill("/mgg-games/slope/") },
      { Cookie: loginResult.cookie }
    );
    t.equal(
      tooMany.status,
      400,
      "batch size is capped to limit outbound checks"
    );
    var unlisted = await requestJson(
      appServer.port,
      "POST",
      "/api/games/check",
      { urls: ["https://not-in-the-game-catalog.invalid/"] },
      { Cookie: loginResult.cookie }
    );
    t.equal(unlisted.status, 400, "arbitrary URLs cannot be checked");
  } finally {
    if (appServer) {
      appServer.instance.stopGameAvailabilitySchedule();
      await close(appServer.server);
    }
    await close(primary);
    await close(fallback);
  }
});

test("Game availability checks block private targets even when an admin added them", async function (t) {
  var targetHits = 0;
  var target = http.createServer(function (_req, res) {
    targetHits++;
    res.writeHead(200);
    res.end("private target");
  });
  var appServer;
  await listen(target);

  try {
    appServer = await startAppServer({
      passcode: "catalog-pass",
      adminPassword: "catalog-admin",
      autoLoadSupabase: false,
      skipInternetProbe: true,
      mggMirrors: ["http://127.0.0.1:1/"],
    });
    var loginResult = await login(appServer.port, "catalog-pass");
    t.equal(
      loginResult.response.status,
      200,
      "user session is available for catalog checks"
    );

    var privateUrl = "http://127.0.0.1:" + target.address().port + "/probe";
    var added = await requestJson(
      appServer.port,
      "POST",
      "/api/admin/games",
      { title: "Private test", url: privateUrl, category: "apps" },
      { "X-Admin-Password": "catalog-admin" }
    );
    t.equal(added.status, 200, "admin can add a test catalog entry");

    var checked = await requestJson(
      appServer.port,
      "POST",
      "/api/games/check",
      { urls: [privateUrl] },
      { Cookie: loginResult.cookie }
    );
    t.equal(checked.status, 200, "an allowlisted custom entry is processed");
    t.equal(
      checked.json.availability[privateUrl].status,
      "unknown",
      "private hosts are reported as unverified instead of contacted"
    );
    t.equal(targetHits, 0, "the private target receives no probe request");
  } finally {
    if (appServer) {
      appServer.instance.stopGameAvailabilitySchedule();
      await close(appServer.server);
    }
    await close(target);
  }
});
