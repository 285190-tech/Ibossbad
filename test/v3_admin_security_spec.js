"use strict";

var http = require("http");
var tap = require("tap");
var createApp = require("../lib/app.js");

function requestJson(port, opts) {
  return new Promise(function (resolve, reject) {
    var bodyStr = opts.body ? JSON.stringify(opts.body) : "";
    var headers = Object.assign(
      {
        "Content-Type": "application/json",
        Connection: "close",
      },
      opts.headers || {}
    );
    if (bodyStr) {
      headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }
    var req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: opts.path,
        method: opts.method || "GET",
        headers: headers,
      },
      function (res) {
        var chunks = [];
        res.on("data", function (c) {
          chunks.push(c);
        });
        res.on("end", function () {
          var raw = Buffer.concat(chunks).toString("utf8");
          var json = null;
          try {
            json = JSON.parse(raw);
          } catch (_e) {
            json = null;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            raw: raw,
            json: json,
          });
        });
      }
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function extractCookies(setCookieHeader) {
  if (!setCookieHeader) return "";
  var arr = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];
  return arr
    .map(function (c) {
      return c.split(";")[0];
    })
    .join("; ");
}

tap.test(
  "Ibossbad v3.0 Security, Keys, IP Bans, Policies & Admin Suite",
  async function (t) {
    var prevPass = process.env.PROXY_PASSCODE;
    var prevAdmin = process.env.ADMIN_PASSWORD;
    var prevDisable = process.env.DISABLE_PASSCODE;

    process.env.PROXY_PASSCODE = "secretpass123";
    process.env.ADMIN_PASSWORD = "superadmin999";
    delete process.env.DISABLE_PASSCODE;

    var instance = createApp({ autoLoadSupabase: false });
    var server = http.createServer(instance.app);
    instance.attachUpgrade(server);

    await new Promise(function (resolve) {
      server.listen(0, "127.0.0.1", resolve);
    });
    var port = server.address().port;

    t.teardown(function () {
      if (prevPass === undefined) delete process.env.PROXY_PASSCODE;
      else process.env.PROXY_PASSCODE = prevPass;
      if (prevAdmin === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = prevAdmin;
      if (prevDisable === undefined) delete process.env.DISABLE_PASSCODE;
      else process.env.DISABLE_PASSCODE = prevDisable;
      return new Promise(function (resolve) {
        server.close(resolve);
      });
    });

    // 1) Cloud Account Passcode Bypass Fix
    var bypassLogin = await requestJson(port, {
      method: "POST",
      path: "/api/auth/login",
      body: { email: "user@example.com", password: "password123" },
    });
    t.equal(
      bypassLogin.status,
      401,
      "POST /api/auth/login rejects account login when site passcode is missing"
    );

    var bypassSignup = await requestJson(port, {
      method: "POST",
      path: "/api/auth/signup",
      body: { email: "user@example.com", password: "password123" },
    });
    t.equal(
      bypassSignup.status,
      401,
      "POST /api/auth/signup rejects account creation when site passcode is missing"
    );

    var bypassToken = await requestJson(port, {
      method: "POST",
      path: "/api/auth/token-session",
      body: { access_token: "fake.jwt.token" },
    });
    t.equal(
      bypassToken.status,
      401,
      "POST /api/auth/token-session rejects session minting when site passcode is missing"
    );

    // 2) Admin Authentication & 12-Hour Key Minting
    var badAdmin = await requestJson(port, {
      method: "POST",
      path: "/api/admin/login",
      body: { password: "wrongpassword" },
    });
    t.equal(badAdmin.status, 401, "Rejects wrong ADMIN_PASSWORD");

    var goodAdmin = await requestJson(port, {
      method: "POST",
      path: "/api/admin/login",
      headers: { "X-Forwarded-For": "10.0.0.1" },
      body: { password: "superadmin999" },
    });
    t.equal(
      goodAdmin.status,
      200,
      "Unlocks Admin Command Center with ADMIN_PASSWORD"
    );
    var adminCookie = extractCookies(goodAdmin.headers["set-cookie"]);

    var mintRes = await requestJson(port, {
      method: "POST",
      path: "/api/admin/keys",
      headers: { Cookie: adminCookie, "X-Forwarded-For": "10.0.0.1" },
      body: { label: "Test 12h Key", durationHours: 12, maxUses: 1 },
    });
    t.equal(mintRes.status, 200, "Mints 12h temporary access key");
    var mintedCode = mintRes.json.key.code;
    t.match(mintedCode, /^IBOSS-/, "Key uses IBOSS-XXXX-XXXX-12H format");

    // Unlock browser using minted 12h key
    var keyUnlock = await requestJson(port, {
      method: "POST",
      path: "/api/auth/passcode",
      headers: { "X-Forwarded-For": "203.0.113.50" },
      body: { passcode: mintedCode },
    });
    t.equal(keyUnlock.status, 200, "12h temporary key unlocks browser");
    t.equal(keyUnlock.json.user.mode, "key", "Session records key unlock mode");
    t.ok(
      keyUnlock.json.user.keyExpiresAt > Date.now(),
      "Session carries keyExpiresAt"
    );
    var userCookie = extractCookies(keyUnlock.headers["set-cookie"]);

    // Second attempt with maxUses=1 key should fail
    var reuseKey = await requestJson(port, {
      method: "POST",
      path: "/api/auth/passcode",
      headers: { "X-Forwarded-For": "203.0.113.51" },
      body: { passcode: mintedCode },
    });
    t.equal(
      reuseKey.status,
      401,
      "Single-use 12h key cannot be reused once exhausted"
    );

    // 3) IP Banning, CIDR Banning & Self-Ban Protection
    var selfBan = await requestJson(port, {
      method: "POST",
      path: "/api/admin/ban-ip",
      headers: { Cookie: adminCookie, "X-Forwarded-For": "10.0.0.1" },
      body: { ip: "10.0.0.1", reason: "Accidental self ban" },
    });
    t.equal(selfBan.status, 400, "Prevents Admin from banning their own IP");

    var banUser = await requestJson(port, {
      method: "POST",
      path: "/api/admin/ban-ip",
      headers: { Cookie: adminCookie, "X-Forwarded-For": "10.0.0.1" },
      body: { ip: "203.0.113.99", reason: "Abuse test" },
    });
    t.equal(banUser.status, 200, "Bans target IP");

    var bannedHit = await requestJson(port, {
      method: "GET",
      path: "/",
      headers: { "X-Forwarded-For": "203.0.113.99" },
    });
    t.equal(bannedHit.status, 403, "Banned IP receives 403 custom ban page");
    t.match(bannedHit.raw, /Abuse test/, "Ban page includes custom reason");

    var unbanRes = await requestJson(port, {
      method: "POST",
      path: "/api/admin/unban-ip",
      headers: { Cookie: adminCookie, "X-Forwarded-For": "10.0.0.1" },
      body: { ip: "203.0.113.99" },
    });
    t.equal(unbanRes.status, 200, "Unbans IP");

    var afterUnban = await requestJson(port, {
      method: "GET",
      path: "/api/status",
      headers: { "X-Forwarded-For": "203.0.113.99" },
    });
    t.equal(afterUnban.status, 200, "Unbanned IP regains access immediately");

    // CIDR /24 ban check
    await requestJson(port, {
      method: "POST",
      path: "/api/admin/ban-ip",
      headers: { Cookie: adminCookie, "X-Forwarded-For": "10.0.0.1" },
      body: { ip: "198.51.100.0/24", reason: "Subnet block" },
    });
    var cidrHit = await requestJson(port, {
      method: "GET",
      path: "/api/status",
      headers: { "X-Forwarded-For": "198.51.100.77" },
    });
    t.equal(cidrHit.status, 403, "CIDR /24 ban blocks matching subnet IP");

    // 4) Access History Logging, Domain Blacklist & Remote Session Commands
    var checkOk = await requestJson(port, {
      method: "GET",
      path:
        "/api/check-url?url=" +
        encodeURIComponent("https://neal.fun/infinite-craft/") +
        "&engine=scramjet",
      headers: { Cookie: userCookie, "X-Forwarded-For": "203.0.113.50" },
    });
    t.equal(
      checkOk.status,
      200,
      "Allowed URL passes policy check & logs visit"
    );

    await requestJson(port, {
      method: "PUT",
      path: "/api/admin/config",
      headers: { Cookie: adminCookie, "X-Forwarded-For": "10.0.0.1" },
      body: { domainBlacklist: ["forbidden-site.example"] },
    });

    var checkBlocked = await requestJson(port, {
      method: "GET",
      path:
        "/api/check-url?url=" +
        encodeURIComponent("https://sub.forbidden-site.example/play"),
      headers: { Cookie: userCookie, "X-Forwarded-For": "203.0.113.50" },
    });
    t.equal(
      checkBlocked.status,
      403,
      "Blacklisted domain & subdomains are blocked"
    );

    // Presence Heartbeat + Global Teacher Mass-Cloak
    var hb1 = await requestJson(port, {
      method: "POST",
      path: "/api/presence/heartbeat",
      headers: { Cookie: userCookie, "X-Forwarded-For": "203.0.113.50" },
      body: { url: "https://neal.fun/", title: "Neal.fun", engine: "scramjet" },
    });
    t.equal(hb1.status, 200, "Heartbeat registers online user");

    await requestJson(port, {
      method: "POST",
      path: "/api/admin/mass-cloak",
      headers: { Cookie: adminCookie, "X-Forwarded-For": "10.0.0.1" },
    });

    var hb2 = await requestJson(port, {
      method: "POST",
      path: "/api/presence/heartbeat",
      headers: { Cookie: userCookie, "X-Forwarded-For": "203.0.113.50" },
      body: { url: "https://neal.fun/", title: "Neal.fun", engine: "scramjet" },
    });
    t.equal(
      hb2.json.commands && hb2.json.commands[0] && hb2.json.commands[0].type,
      "cloak",
      "Mass-Cloak delivers instant cloak command to connected user"
    );

    // 5) Game Request Inbox -> Admin Approve -> Live Catalog + Vendor JSZip + Games Catalog Count
    var reqSubmit = await requestJson(port, {
      method: "POST",
      path: "/api/requests",
      headers: { Cookie: userCookie, "X-Forwarded-For": "203.0.113.50" },
      body: {
        title: "PolyTrack",
        url: "https://kodub.com/apps/polytrack",
        kind: "game",
      },
    });
    t.equal(reqSubmit.status, 200, "User submits game request");

    var dash = await requestJson(port, {
      method: "GET",
      path: "/api/admin/dashboard",
      headers: { Cookie: adminCookie, "X-Forwarded-For": "10.0.0.1" },
    });
    t.ok(
      dash.json.snapshot.logs.length >= 1,
      "Admin dashboard includes logged user visits"
    );
    var reqId = dash.json.snapshot.gameRequests[0].id;

    var approveRes = await requestJson(port, {
      method: "POST",
      path: "/api/admin/requests/" + encodeURIComponent(reqId),
      headers: { Cookie: adminCookie, "X-Forwarded-For": "10.0.0.1" },
      body: { action: "approve" },
    });
    t.equal(approveRes.status, 200, "Admin approves game request into catalog");

    var gamesApi = await requestJson(port, {
      method: "GET",
      path: "/api/games",
    });
    t.equal(
      gamesApi.json.customGames.length,
      1,
      "Approved game appears in /api/games"
    );

    var jszipRes = await requestJson(port, {
      method: "GET",
      path: "/vendor/jszip/jszip.min.js",
    });
    t.equal(
      jszipRes.status,
      200,
      "Serves /vendor/jszip/jszip.min.js for .zip extensions"
    );

    // Verify GamesCatalog has 170+ real games
    global.window = {};
    require("../public/games-catalog.js");
    t.ok(
      global.window.IbossGamesCatalog.builtInGames.length >= 170,
      "Built-in MonkeyGG2 + Web catalog contains 170+ real games (" +
        global.window.IbossGamesCatalog.builtInGames.length +
        ")"
    );
    delete global.window;
  }
);
