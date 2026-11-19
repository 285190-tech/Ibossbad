"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const test = require("tap").test;
const publicDir = path.join(__dirname, "../public");

function read(name) {
  return fs.readFileSync(path.join(publicDir, name), "utf8");
}
function response(body) {
  return { ok: true, status: 200, json: async () => body };
}
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

test("slow games response does not block startup; games wait for catalog", async (t) => {
  const dom = new JSDOM(read("index.html"), {
    url: "http://localhost/",
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
  let resolveGames;
  let statusCalls = 0;
  w.fetch = (url) => {
    if (url === "/api/games") {
      return new Promise((resolve) => {
        resolveGames = resolve;
      });
    }
    if (url === "/api/status") {
      statusCalls++;
      return Promise.resolve(
        response({ authenticated: true, authRequired: false })
      );
    }
    return Promise.resolve(response({}));
  };
  const append = w.document.head.appendChild.bind(w.document.head);
  w.document.head.appendChild = (node) => {
    if (
      node.tagName === "SCRIPT" &&
      node.src.includes("/ui/internal-pages.js")
    ) {
      const added = append(node);
      w.eval(read("internal-pages.js"));
      setTimeout(() => node.onload(), 0);
      return added;
    }
    return append(node);
  };
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
  t.equal(
    statusCalls,
    1,
    "status request runs while games request remains pending"
  );
  t.ok(resolveGames, "catalog request is pending");
  const button = w.document.getElementById("gamesHubBtn");
  button.click();
  const view = w.document.getElementById("internalPageView");
  t.match(
    view.textContent,
    /Loading games/,
    "game navigation is interactive before catalog completes"
  );
  resolveGames(
    response({
      customGames: [
        {
          title: "Test Game",
          url: "https://example.com",
          category: "community",
        },
      ],
      availability: {},
      mirrors: [],
    })
  );
  await tick();
  await tick();
  t.match(
    view.textContent,
    /Test Game/,
    "games page renders the fetched catalog"
  );
});

test("server finder loads on demand and retries after a load failure", async (t) => {
  const dom = new JSDOM(read("index.html"), {
    url: "http://localhost/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  t.teardown(() => w.close());
  w.localStorage.setItem(
    "ibossbad_settings_v1",
    JSON.stringify({ proxyEngine: "stream" })
  );
  w.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {},
    beginPath() {},
    arc() {},
    fill() {},
  });
  w.requestAnimationFrame = () => 0;
  w.fetch = (url) =>
    Promise.resolve(
      response(
        url === "/api/status"
          ? { authenticated: true, authRequired: false }
          : {}
      )
    );
  let finderLoads = 0;
  const append = w.document.head.appendChild.bind(w.document.head);
  w.document.head.appendChild = (node) => {
    const added = append(node);
    if (
      node.tagName === "SCRIPT" &&
      node.src.includes("/ui/internal-pages.js")
    ) {
      w.eval(read("internal-pages.js"));
      setTimeout(() => node.onload(), 0);
    } else if (
      node.tagName === "SCRIPT" &&
      node.src.includes("/ui/server-finder.js")
    ) {
      finderLoads++;
      if (finderLoads === 1) setTimeout(() => node.onerror(), 0);
      else {
        w.eval(read("server-finder.js"));
        setTimeout(() => node.onload(), 0);
      }
    }
    return added;
  };
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
  t.equal(finderLoads, 0, "stream startup does not download the scanner");
  w.document.getElementById("serverFinderPill").click();
  await tick();
  const view = w.document.getElementById("internalPageView");
  t.match(
    view.textContent,
    /Unable to load server finder/,
    "load failure is reported"
  );
  w.document.getElementById("serverFinderPill").click();
  await tick();
  t.equal(finderLoads, 2, "subsequent navigation retries loading");
  t.ok(w.IbossServerFinder, "scanner is available after retry");
  t.notMatch(
    view.textContent,
    /Unable to load server finder|Loading server finder/,
    "finder page rendered"
  );
});

test("WISP helpers download together and never start target before policy approval", async (t) => {
  const dom = new JSDOM(read("index.html"), {
    url: "http://localhost/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  t.teardown(() => w.close());
  w.localStorage.setItem(
    "ibossbad_settings_v1",
    JSON.stringify({ proxyEngine: "wisp" })
  );
  w.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {},
    beginPath() {},
    arc() {},
    fill() {},
  });
  w.requestAnimationFrame = () => 0;
  let policyResolve;
  let targetLoads = 0;
  w.URL.revokeObjectURL = () => {};
  w.URL.createObjectURL = () => "blob:blocked";
  const scripts = {};
  w.fetch = (url) => {
    if (String(url).startsWith("/api/check-url"))
      return new Promise((resolve) => {
        policyResolve = resolve;
      });
    return Promise.resolve(
      response(
        url === "/api/status"
          ? { authenticated: false, authRequired: true }
          : {}
      )
    );
  };
  const append = w.document.head.appendChild.bind(w.document.head);
  w.document.head.appendChild = (node) => {
    if (node.tagName === "SCRIPT") scripts[new URL(node.src).pathname] = node;
    return append(node);
  };
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
  w.document.getElementById("omniboxInput").value = "https://example.com";
  w.document
    .getElementById("omniboxForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  t.ok(policyResolve, "navigation waits for the policy check");
  t.equal(
    Object.keys(scripts).length,
    0,
    "no navigation scripts requested before approval"
  );
  policyResolve({ status: 403, json: async () => ({ reason: "Blocked" }) });
  await tick();
  t.equal(
    Object.keys(scripts).length,
    0,
    "denied navigation does not load engine or helpers"
  );
  t.equal(targetLoads, 0, "denied navigation never reaches target");
  w.document.getElementById("omniboxInput").value = "https://example.com";
  w.document
    .getElementById("omniboxForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  policyResolve(response({ ok: true }));
  await tick();
  t.ok(scripts["/ui/wisp-engine.js"], "engine requested");
  t.ok(scripts["/vendor/acorn/acorn.js"], "parser requested");
  t.ok(
    scripts["/vendor/acorn-walk/walk.js"],
    "walker requested before parser finishes"
  );
  t.equal(
    scripts["/vendor/acorn/acorn.js"].async,
    false,
    "parser executes in insertion order"
  );
  t.equal(
    scripts["/vendor/acorn-walk/walk.js"].async,
    false,
    "walker executes in insertion order"
  );
  t.equal(targetLoads, 0, "no target load before dependencies are ready");
  w.IbossWispEngine = {
    create: () => ({
      configure() {},
      loadPage: async () => {
        targetLoads++;
        return {
          blobUrl: "blob:test",
          finalUrl: "https://example.com",
          title: "Example",
        };
      },
    }),
  };
  scripts["/ui/wisp-engine.js"].onload();
  w.eval(fs.readFileSync(require.resolve("acorn"), "utf8"));
  scripts["/vendor/acorn/acorn.js"].onload();
  w.eval(fs.readFileSync(require.resolve("acorn-walk"), "utf8"));
  scripts["/vendor/acorn-walk/walk.js"].onload();
  t.equal(typeof w.acorn.parse, "function", "parser initialized");
  t.equal(
    typeof w.acorn.walk.simple,
    "function",
    "walker attaches to parser global"
  );
  await tick();
  t.equal(targetLoads, 1, "target starts once approved and helpers are ready");

  w.document.getElementById("omniboxInput").value = "https://old.example";
  w.document
    .getElementById("omniboxForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  const oldPolicy = policyResolve;
  w.document.getElementById("omniboxInput").value = "https://new.example";
  w.document
    .getElementById("omniboxForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  const newPolicy = policyResolve;
  newPolicy(response({ ok: true }));
  await tick();
  oldPolicy(response({ ok: true }));
  await tick();
  t.equal(
    targetLoads,
    2,
    "a stale policy response cannot start the old navigation"
  );
});

test("Scramjet can initialize while the optional scanner is still loading", async (t) => {
  const dom = new JSDOM(read("index.html"), {
    url: "http://localhost/",
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
  w.fetch = (url) =>
    Promise.resolve(
      response(
        url === "/api/status"
          ? { authenticated: true, authRequired: false }
          : {}
      )
    );
  let readyCalls = 0;
  let scannerScript;
  const append = w.document.head.appendChild.bind(w.document.head);
  w.document.head.appendChild = (node) => {
    const added = append(node);
    if (node.tagName !== "SCRIPT") return added;
    if (node.src.includes("server-finder.js")) {
      scannerScript = node;
    } else if (node.src.includes("scramjet-engine.js")) {
      w.IbossScramjetEngine = {
        create: () => ({
          configure() {},
          ensureReady() {
            readyCalls++;
            return Promise.resolve();
          },
        }),
      };
      setTimeout(() => node.onload(), 0);
    } else if (
      node.src.includes("scramjet.all.js") ||
      node.src.includes("baremux/index.js")
    ) {
      setTimeout(() => node.onload(), 0);
    }
    return added;
  };
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
  t.ok(scannerScript, "optional scanner begins downloading");
  t.equal(
    readyCalls,
    1,
    "proxy initialization does not wait for scanner download"
  );
  w.eval(read("server-finder.js"));
  scannerScript.onload();
  await tick();
  t.ok(w.IbossServerFinder, "scanner is available after it loads");
});
