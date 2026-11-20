"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { JSDOM } = require("jsdom");
const test = require("tap").test;
const createApp = require("../lib/app.js");
const read = (file) =>
  fs.readFileSync(path.join(__dirname, "../public", file), "utf8");
const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

function request(port, url) {
  return new Promise((resolve, reject) => {
    http
      .get({ hostname: "127.0.0.1", port, path: url }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          })
        );
      })
      .on("error", reject);
  });
}

test("URL policy rejects malformed, non-web and private literals", async (t) => {
  const app = createApp({
    authRequired: false,
    autoLoadSupabase: false,
    skipInternetProbe: true,
  });
  const server = http.createServer(app.app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.teardown(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  for (const target of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "http://user:pass@example.com",
    "not a url",
  ]) {
    const res = await request(
      port,
      "/api/check-url?url=" + encodeURIComponent(target)
    );
    t.equal(res.status, 400, "rejects " + target);
  }
  for (const target of [
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/",
  ]) {
    const res = await request(
      port,
      "/api/check-url?url=" + encodeURIComponent(target)
    );
    t.equal(res.status, 403, "rejects " + target);
  }
  app.adminManager.state.domainBlacklist = ["blocked.example"];
  t.equal(
    (
      await request(
        port,
        "/api/check-url?url=" + encodeURIComponent("https://blocked.example/")
      )
    ).status,
    403,
    "configured domain policy applies"
  );
  t.equal(
    (
      await request(
        port,
        "/api/check-url?url=" + encodeURIComponent("https://example.com/")
      )
    ).status,
    200,
    "valid public URL can pass policy"
  );
  const status = await request(port, "/api/status");
  t.equal(status.headers["x-content-type-options"], "nosniff");
  t.notOk(JSON.parse(status.body).speed.dnsCache, "DNS internals not public");
  t.notOk(JSON.parse(status.body).clientIp, "client IP not in public status");
});

test("WISP message bridge accepts only the registered tab source and origin", async (t) => {
  const dom = new JSDOM("<!doctype html>", {
    url: "https://proxy.example/",
    runScripts: "outside-only",
  });
  const w = dom.window;
  t.teardown(() => w.close());
  w.eval(read("wisp-engine.js"));
  const frame = w.document.createElement("iframe");
  w.document.body.appendChild(frame);
  const calls = [];
  w.IbossWispEngine.create({
    isTabMessageSource: (id, source, origin) =>
      id === "tab1" &&
      source === frame.contentWindow &&
      origin === w.location.origin,
    onNavigate: (...args) => calls.push(args),
  });
  function send(source, origin, tabId) {
    w.dispatchEvent(
      new w.MessageEvent("message", {
        source,
        origin,
        data: {
          __ibossWisp: true,
          tabId,
          action: "navigate",
          url: "https://example.com/",
        },
      })
    );
  }
  send(w, w.location.origin, "tab1");
  send(frame.contentWindow, "https://attacker.example", "tab1");
  send(frame.contentWindow, w.location.origin, "tab2");
  t.equal(calls.length, 0, "rejects foreign windows, origins and tab IDs");
  send(frame.contentWindow, w.location.origin, "tab1");
  t.same(
    calls[0],
    ["tab1", "https://example.com/", false],
    "legitimate tab can navigate"
  );
});

test("chat fields render as text and untrusted messages cannot execute code", async (t) => {
  const dom = new JSDOM(read("index.html"), {
    url: "https://proxy.example/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  t.teardown(() => w.close());
  w.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {},
    beginPath() {},
    arc() {},
    fill() {},
  });
  w.requestAnimationFrame = () => 0;
  w.localStorage.setItem(
    "ibossbad_settings_v1",
    JSON.stringify({ proxyEngine: "stream" })
  );
  const attack =
    '"><img src=x onerror="window.pwned=1">&lt;svg onload=alert(1)&gt;';
  w.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () =>
      url === "/api/status"
        ? { authenticated: true, authRequired: false }
        : url === "/api/chat"
        ? {
            enabled: true,
            poll: {
              question: attack,
              totalVotes: attack,
              options: [{ id: attack, label: attack, votes: attack }],
            },
            messages: [{ role: attack, author: attack, text: attack }],
          }
        : {},
  });
  [
    "visual-art",
    "games-catalog",
    "cine-cloud",
    "extensions-engine",
    "media-emulator",
    "diagnostics-tools",
    "app",
  ].forEach((name) => w.eval(read(name + ".js")));
  await tick();
  w.document.getElementById("chatToggleBtn").click();
  await tick();
  const chat = w.document.getElementById("chatDrawer");
  t.notOk(chat.querySelector("img,svg"), "attacker markup is not parsed");
  t.match(chat.textContent, /&lt;svg/, "entities stay literal text");
  const button = chat.querySelector("[data-vote-opt]");
  t.equal(
    button.getAttribute("data-vote-opt"),
    attack,
    "poll ID stays in its attribute"
  );
  w.dispatchEvent(
    new w.MessageEvent("message", {
      origin: "https://evil.example",
      source: w,
      data: { __ibossExtExec: true, code: "window.pwned=1" },
    })
  );
  await tick();
  t.notOk(w.pwned, "foreign extension execution is ignored");
  w.dispatchEvent(
    new w.MessageEvent("message", {
      origin: w.location.origin,
      source: w,
      data: { __ibossExtExec: true, code: "window.pwned=1" },
    })
  );
  await tick();
  t.notOk(w.pwned, "same-origin non-popup cannot invoke extension execution");
  const omnibox = w.document.getElementById("omniboxInput");
  omnibox.value = "javascript:window.pwned=1";
  w.document
    .getElementById("omniboxForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  t.notOk(w.pwned, "omnibox does not execute JavaScript");
});
