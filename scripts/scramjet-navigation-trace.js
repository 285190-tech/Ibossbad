"use strict";

// Temporary public-site diagnostic: emit only event types, timings and nesting
// depths, never raw URLs, cookies, credentials or response bodies.
const { chromium } = require("playwright");
const benchmark = require("./benchmark-proxy");

function depth(raw, origin) {
  try {
    let url = new URL(raw);
    let count = 0;
    while (
      url.origin === origin &&
      url.pathname.startsWith("/scramjet/") &&
      count < 12
    ) {
      let token = url.pathname.slice("/scramjet/".length);
      if (!token.startsWith("u1_")) break;
      const bytes = Buffer.from(token.slice(3), "base64url");
      const key = [90, 51, 113, 25];
      url = new URL(
        Buffer.from(bytes.map((value, i) => value ^ key[i % 4])).toString(
          "utf8"
        )
      );
      count++;
    }
    return {
      depth: count,
      target:
        url.origin === "https://github.com" && url.pathname === "/nodejs/node",
      proxy: url.origin === origin,
    };
  } catch (_e) {
    return { depth: null, target: false, proxy: false };
  }
}

(async () => {
  const opts = benchmark.parseArgs([
    "--proxy",
    "http://127.0.0.1:8080",
    "--cache",
    "cold",
    "--timeout-ms",
    "20000",
    "--storage-state",
    process.env.RUNNER_TEMP + "/benchmark-state.json",
  ]);
  const browser = await chromium.launch({ headless: true });
  let session;
  try {
    session = await benchmark.makeSession(browser, "scramjet", opts);
    const page = session.page;
    const start = Date.now();
    const events = [];
    page.on("framenavigated", (frame) => {
      if (frame.parentFrame() === page.mainFrame() && events.length < 30)
        events.push({
          type: "frame",
          ms: Date.now() - start,
          ...depth(frame.url(), opts.proxy),
        });
    });
    page.on("response", (response) => {
      try {
        const req = response.request();
        if (
          !req.isNavigationRequest() ||
          response.frame().parentFrame() !== page.mainFrame() ||
          events.length >= 30
        )
          return;
        const location = response.headers().location;
        events.push({
          type: "response",
          ms: Date.now() - start,
          status: response.status(),
          serviceWorker: response.fromServiceWorker(),
          ...depth(response.url(), opts.proxy),
          redirectDepth: location
            ? depth(new URL(location, response.url()).href, opts.proxy).depth
            : null,
          redirectedFrom: Boolean(req.redirectedFrom()),
        });
      } catch (_e) {
        /* Ignore detached frames. */
      }
    });
    const result = await benchmark.runOne(
      session,
      {
        category: "trace",
        url: "https://github.com/nodejs/node",
        titleIncludes: "nodejs/node",
      },
      "scramjet",
      opts,
      "measured",
      1,
      1
    );
    await page.waitForTimeout(1500);
    console.log(
      "::notice title=Scramjet navigation trace::" +
        JSON.stringify({ ok: result.ok, elapsedMs: result.elapsedMs, events })
    );
    if (!result.ok) throw new Error("Trace page did not validate");
    const navigations = events.filter((e) => e.type === "frame" && e.target);
    if (navigations.length < 2)
      throw new Error("Page did not exercise same-document navigation");
    if (navigations.some((e) => e.depth !== 1))
      throw new Error("Nested Scramjet URL persisted");
  } finally {
    if (session) await session.context.close();
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
