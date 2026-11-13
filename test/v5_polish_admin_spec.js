"use strict";

const tap = require("tap");
const http = require("http");
const createApp = require("../lib/app");

function b64Url(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function makeFakeSupabaseJwt(supabaseUrl, uid, email) {
  const header = b64Url({ alg: "HS256", typ: "JWT" });
  const payload = b64Url({
    iss: supabaseUrl + "/auth/v1",
    sub: uid,
    email,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return header + "." + payload + ".test-sig";
}

function request(port, method, reqPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload =
      body === null
        ? null
        : typeof body === "string"
        ? body
        : JSON.stringify(body);
    const reqHeaders = Object.assign({ Connection: "close" }, headers);
    if (payload !== null && !reqHeaders["Content-Type"]) {
      reqHeaders["Content-Type"] = "application/json";
    }
    if (payload !== null) {
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: reqPath,
        method,
        headers: reqHeaders,
      },
      (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (_e) {
            // non-JSON response
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text,
            json,
          });
        });
      }
    );
    req.on("error", reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function extractCookies(res) {
  const raw = res.headers["set-cookie"] || [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

tap.test(
  "v5.0: Permanent Cloud Account ADMIN binding, ADMIN_EMAILS, audit trail, chat slow-mode/word-filter & PWA/UI polish",
  async (t) => {
    const supaUrl = "https://mock-supa.example.co";
    const instance = createApp({
      passcode: "v5-pass-123",
      adminPassword: "v5-admin-secret-123",
      adminEmails: "founder@example.com",
      supabaseUrl: supaUrl,
      supabaseAnonKey: "mock-anon-key",
      autoLoadSupabase: false,
    });
    const server = http.createServer(instance.app);
    instance.attachUpgrade(server);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    t.teardown(() => new Promise((resolve) => server.close(resolve)));

    const adminHeaders = { "X-Admin-Password": "v5-admin-secret-123" };

    // 1. ADMIN_EMAILS env-bound Cloud Account gets instant ADMIN access without passcode or ADMIN_PASSWORD
    const founderJwt = makeFakeSupabaseJwt(
      supaUrl,
      "11111111-1111-4111-8111-111111111111",
      "founder@example.com"
    );
    const founderSessRes = await request(
      port,
      "POST",
      "/api/auth/token-session",
      {
        body: { access_token: founderJwt },
      }
    );
    t.equal(
      founderSessRes.status,
      200,
      "ADMIN_EMAILS account bypasses passcode gate on token-session"
    );
    const founderCookie = extractCookies(founderSessRes);

    const founderStatus = await request(port, "GET", "/api/status", {
      headers: { Cookie: founderCookie },
    });
    t.equal(
      founderStatus.json.isAdmin,
      true,
      "ADMIN_EMAILS user has isAdmin=true"
    );
    t.equal(founderStatus.json.user.role, "ADMIN", "User role is ADMIN");

    const founderDash = await request(port, "GET", "/api/admin/dashboard", {
      headers: { Cookie: founderCookie },
    });
    t.equal(
      founderDash.status,
      200,
      "ADMIN_EMAILS account accesses /api/admin/dashboard directly"
    );

    // 2. Regular Cloud Account promoted to ADMIN via PUT /api/admin/roles
    const userJwt = makeFakeSupabaseJwt(
      supaUrl,
      "22222222-2222-4222-8222-222222222222",
      "member@example.com"
    );
    const memberSessRes = await request(
      port,
      "POST",
      "/api/auth/token-session",
      {
        body: { access_token: userJwt, passcode: "v5-pass-123" },
      }
    );
    t.equal(memberSessRes.status, 200, "Member signs in with passcode");
    const memberCookie = extractCookies(memberSessRes);

    const deniedDash = await request(port, "GET", "/api/admin/dashboard", {
      headers: { Cookie: memberCookie },
    });
    t.equal(
      deniedDash.status,
      401,
      "Non-admin member cannot open admin dashboard"
    );

    const grantRole = await request(port, "PUT", "/api/admin/roles", {
      headers: adminHeaders,
      body: { identifier: "member@example.com", role: "ADMIN" },
    });
    t.equal(
      grantRole.status,
      200,
      "Admin promotes member@example.com to ADMIN"
    );

    const allowedDash = await request(port, "GET", "/api/admin/dashboard", {
      headers: { Cookie: memberCookie },
    });
    t.equal(
      allowedDash.status,
      200,
      "Promoted ADMIN Cloud Account immediately accesses /api/admin/dashboard"
    );

    // Demote member back to USER for chat moderation tests
    await request(port, "PUT", "/api/admin/roles", {
      headers: adminHeaders,
      body: { identifier: "member@example.com", role: "NONE" },
    });

    // 3. Chat Blocked-Word Filter & Slow-Mode
    const cfgRes = await request(port, "PUT", "/api/admin/config", {
      headers: adminHeaders,
      body: {
        chatSlowModeSec: 10,
        chatBlockedWords: ["spambot", "toxicword"],
      },
    });
    t.equal(
      cfgRes.status,
      200,
      "Admin configures chat slow-mode & word filter"
    );

    const blockedChat = await request(port, "POST", "/api/chat", {
      headers: { Cookie: memberCookie },
      body: { text: "hello from a SpAmBoT link" },
    });
    t.equal(
      blockedChat.status,
      400,
      "Blocked word rejected case-insensitively"
    );

    const cleanChat1 = await request(port, "POST", "/api/chat", {
      headers: { Cookie: memberCookie },
      body: { text: "hey everyone!" },
    });
    t.equal(cleanChat1.status, 200, "First clean chat message accepted");

    const rapidChat2 = await request(port, "POST", "/api/chat", {
      headers: { Cookie: memberCookie },
      body: { text: "second message right away" },
    });
    t.equal(
      rapidChat2.status,
      400,
      "Second rapid message blocked by slow-mode"
    );
    t.match(
      rapidChat2.json.error,
      /Slow mode active/,
      "Returns slow-mode countdown"
    );

    const adminBypassChat = await request(port, "POST", "/api/chat", {
      headers: { Cookie: founderCookie },
      body: { text: "Admin announcement bypasses slow-mode & spambot filter" },
    });
    t.equal(
      adminBypassChat.status,
      200,
      "ADMIN account bypasses slow-mode & word filter"
    );

    // 4. Admin Security Audit Trail
    const snapAfter = await request(port, "GET", "/api/admin/dashboard", {
      headers: adminHeaders,
    });
    const auditActions = snapAfter.json.snapshot.auditLog.map((a) => a.action);
    t.ok(
      auditActions.includes("Assign Role"),
      "Audit log records role changes"
    );
    t.ok(
      auditActions.includes("Update Policies"),
      "Audit log records policy updates"
    );

    // 5. PWA Manifest & v5.0 UI Assets
    const manifestRes = await request(port, "GET", "/manifest.webmanifest");
    t.equal(manifestRes.status, 200, "Serves /manifest.webmanifest");
    t.equal(
      manifestRes.json.display,
      "standalone",
      "PWA manifest is standalone"
    );

    const diagJs = await request(port, "GET", "/ui/diagnostics-tools.js");
    t.equal(diagJs.status, 200, "Serves /ui/diagnostics-tools.js");
    t.match(
      diagJs.text,
      /IbossDiagnosticsTools/,
      "Exports IbossDiagnosticsTools"
    );

    const rootHtml = await request(port, "GET", "/");
    t.match(
      rootHtml.text,
      /commandPaletteModal/,
      "Includes Ctrl+K Command Palette"
    );
    t.match(
      rootHtml.text,
      /omniboxSuggestions/,
      "Includes Smart Omnibox Autocomplete"
    );
    t.match(
      rootHtml.text,
      /tabContextMenu/,
      "Includes Tab Right-Click Context Menu"
    );
    t.match(rootHtml.text, /adminLivePill/, "Includes Live Admin Crown Pill");
  }
);
