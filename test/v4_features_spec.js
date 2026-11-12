"use strict";

const tap = require("tap");
const http = require("http");
const createApp = require("../lib/app");

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
  "v4.0: Invite links, MOTD, live chat polls, SSRF-safe downloader & v4 UI assets",
  async (t) => {
    const instance = createApp({
      passcode: "v4-pass-999",
      adminPassword: "v4-admin-secret-999",
      cookieSecret: "v4-cookie-secret-999",
      autoLoadSupabase: false,
    });
    const server = http.createServer(instance.app);
    instance.attachUpgrade(server);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    t.teardown(() => new Promise((resolve) => server.close(resolve)));

    const adminHeaders = { "X-Admin-Password": "v4-admin-secret-999" };

    // 1. Shareable 1-Click Invite Links (maxUses enforcement + revocation)
    const createInvRes = await request(port, "POST", "/api/admin/invites", {
      headers: adminHeaders,
      body: { label: "Study Group Link", durationHours: 6, maxUses: 2 },
    });
    t.equal(createInvRes.status, 200, "Admin creates invite link");
    const invCode = createInvRes.json.invite.code;
    t.match(invCode, /^INV-/, "Invite code has INV- prefix");

    const redeem1 = await request(port, "POST", "/api/auth/invite", {
      body: { code: invCode },
    });
    t.equal(redeem1.status, 200, "First click redeems invite link");
    const user1Cookie = extractCookies(redeem1);

    const status1 = await request(port, "GET", "/api/status", {
      headers: { Cookie: user1Cookie },
    });
    t.equal(
      status1.json.authenticated,
      true,
      "Invited client is authenticated"
    );
    t.equal(status1.json.user.mode, "invite", "Session mode is invite");
    t.ok(status1.json.user.keyExpiresAt > Date.now(), "keyExpiresAt populated");

    const redeem2 = await request(port, "POST", "/api/auth/invite", {
      body: { code: invCode },
    });
    t.equal(redeem2.status, 200, "Second click redeems invite link");
    const user2Cookie = extractCookies(redeem2);

    const redeem3 = await request(port, "POST", "/api/auth/invite", {
      body: { code: invCode },
    });
    t.equal(redeem3.status, 401, "Third click rejected after maxUses=2");

    // Create & immediately revoke another invite
    const inv2 = await request(port, "POST", "/api/admin/invites", {
      headers: adminHeaders,
      body: { label: "Revokable", durationHours: 12, maxUses: 5 },
    });
    const delInv = await request(
      port,
      "DELETE",
      "/api/admin/invites/" + encodeURIComponent(inv2.json.invite.code),
      { headers: adminHeaders }
    );
    t.equal(delInv.status, 200, "Admin revokes invite link");
    const redeemRevoked = await request(port, "POST", "/api/auth/invite", {
      body: { code: inv2.json.invite.code },
    });
    t.equal(redeemRevoked.status, 401, "Revoked invite link cannot be used");

    // 2. Login MOTD / Announcement Popup
    const motdSet = await request(port, "POST", "/api/admin/motd", {
      headers: adminHeaders,
      body: {
        enabled: true,
        title: "Welcome to v4.0!",
        body: "Try iboss://emulator and iboss://media!",
      },
    });
    t.equal(motdSet.status, 200, "Admin sets MOTD");

    const statusWithMotd = await request(port, "GET", "/api/status", {
      headers: { Cookie: user1Cookie },
    });
    t.ok(statusWithMotd.json.motd, "Active MOTD included in /api/status");
    t.equal(statusWithMotd.json.motd.title, "Welcome to v4.0!");

    await request(port, "POST", "/api/admin/motd", {
      headers: adminHeaders,
      body: { enabled: false, title: "", body: "" },
    });
    const statusNoMotd = await request(port, "GET", "/api/status", {
      headers: { Cookie: user1Cookie },
    });
    t.equal(statusNoMotd.json.motd, null, "Disabled MOTD omitted");

    // 3. Live Interactive Chat Polls
    const pollCreate = await request(port, "POST", "/api/admin/poll", {
      headers: adminHeaders,
      body: {
        question: "Favorite new v4 feature?",
        options: ["EmulatorJS", "Media & Radio", "WebOS Desktop"],
      },
    });
    t.equal(pollCreate.status, 200, "Admin creates live chat poll");

    await request(port, "POST", "/api/chat/vote", {
      headers: { Cookie: user1Cookie },
      body: { optionId: "opt-0" },
    });
    await request(port, "POST", "/api/chat/vote", {
      headers: { Cookie: user2Cookie },
      body: { optionId: "opt-1" },
    });
    // User 1 changes vote from opt-0 -> opt-1 (should move vote, not double-count)
    const revoteRes = await request(port, "POST", "/api/chat/vote", {
      headers: { Cookie: user1Cookie },
      body: { optionId: "opt-1" },
    });
    t.equal(
      revoteRes.json.poll.totalVotes,
      2,
      "Changing vote does not double-count"
    );
    t.equal(
      revoteRes.json.poll.options[0].votes,
      0,
      "Previous option decremented"
    );
    t.equal(revoteRes.json.poll.options[1].votes, 2, "New option incremented");

    await request(port, "POST", "/api/admin/poll", {
      headers: adminHeaders,
      body: { action: "close" },
    });
    const chatAfterClose = await request(port, "GET", "/api/chat", {
      headers: { Cookie: user1Cookie },
    });
    t.equal(chatAfterClose.json.poll, null, "Closed poll removed from chat");

    // 4. Safe-Filename Proxy Downloader SSRF & Blacklist Guards
    const ssrfLoopback = await request(
      port,
      "GET",
      "/api/safe-download?url=" +
        encodeURIComponent("http://127.0.0.1:" + port + "/api/status") +
        "&filename=notes.pdf",
      { headers: { Cookie: user1Cookie } }
    );
    t.equal(
      ssrfLoopback.status,
      403,
      "Safe-download blocks loopback SSRF targets"
    );

    const ssrfMeta = await request(
      port,
      "GET",
      "/api/safe-download?url=" +
        encodeURIComponent("http://169.254.169.254/latest/meta-data/") +
        "&filename=notes.txt",
      { headers: { Cookie: user1Cookie } }
    );
    t.equal(
      ssrfMeta.status,
      403,
      "Safe-download blocks cloud metadata SSRF IPs"
    );

    await request(port, "PUT", "/api/admin/config", {
      headers: adminHeaders,
      body: { domainBlacklist: ["blocked-dl.example.com"] },
    });
    const blockedDomDl = await request(
      port,
      "GET",
      "/api/safe-download?url=" +
        encodeURIComponent("https://blocked-dl.example.com/file.zip"),
      { headers: { Cookie: user1Cookie } }
    );
    t.equal(
      blockedDomDl.status,
      403,
      "Safe-download enforces Admin domain blacklist"
    );

    // 5. Verify v4.0 static UI modules & HTML elements
    const mediaMod = await request(port, "GET", "/ui/media-emulator.js");
    t.equal(mediaMod.status, 200, "/ui/media-emulator.js served");
    t.match(mediaMod.text, /IbossMediaEmulator/, "Exports IbossMediaEmulator");

    const extMod = await request(port, "GET", "/ui/extensions-engine.js");
    t.equal(extMod.status, 200, "/ui/extensions-engine.js served");
    t.match(extMod.text, /eruda-devtools/, "Includes 1-click Eruda DevTools");

    const rootHtml = await request(port, "GET", "/");
    t.equal(rootHtml.status, 200, "Root shell served");
    t.match(rootHtml.text, /radioMiniBar/, "Includes persistent radio bar");
    t.match(rootHtml.text, /desmosCanvas/, "Includes Desmos decoy calculator");
  }
);
