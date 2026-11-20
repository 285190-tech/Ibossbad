"use strict";
/* global window, localStorage, sessionStorage, fetch, performance */

// Browser benchmark: no credentials are read from arguments or written by this script.
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");

const DEFAULT_SITES = [
  { category: "light", url: "https://example.com/" },
  { category: "script-heavy", url: "https://github.com/nodejs/node" },
  {
    category: "media-heavy",
    url: "https://commons.wikimedia.org/wiki/Main_Page",
  },
];
const DEFAULT_THROTTLE = { latencyMs: 40, downloadMbps: 10, uploadMbps: 5 };

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
function summarize(runs) {
  const measured = runs.filter((r) => r.phase === "measured");
  const groups = {};
  measured.forEach((r) => {
    const key = r.category + "|" + r.url + "|" + r.mode;
    if (!groups[key])
      groups[key] = {
        category: r.category,
        url: r.url,
        mode: r.mode,
        total: 0,
        failed: 0,
        durations: [],
      };
    const group = groups[key];
    group.total++;
    if (!r.ok) group.failed++;
    else if (Number.isFinite(r.elapsedMs)) group.durations.push(r.elapsedMs);
  });
  return Object.values(groups).map((g) => ({
    category: g.category,
    url: g.url,
    mode: g.mode,
    runs: g.total,
    failures: g.failed,
    failureRate: g.total ? g.failed / g.total : null,
    successfulDurations: g.durations.length,
    medianLoadMs: percentile(g.durations, 0.5),
    p95LoadMs: percentile(g.durations, 0.95),
  }));
}
function estimateDeltas(summary) {
  return summary
    .filter((s) => s.mode !== "direct")
    .map((s) => {
      const direct = summary.find(
        (d) =>
          d.category === s.category && d.url === s.url && d.mode === "direct"
      );
      return {
        category: s.category,
        url: s.url,
        mode: s.mode,
        estimatedMedianDifferenceMs:
          direct && direct.medianLoadMs !== null && s.medianLoadMs !== null
            ? s.medianLoadMs - direct.medianLoadMs
            : null,
        caveat:
          "Difference of independent sample medians, not a causal overhead measurement; origin variability, paths, caching, relay, order and Shield can affect it.",
      };
    });
}
function parseArgs(argv) {
  const options = {
    proxy: "",
    runs: 10,
    delayMs: 3000,
    timeoutMs: 45000,
    cache: "warm",
    shield: "off",
    sites: DEFAULT_SITES,
    storageState: "",
    proxyRevision: null,
    output: "",
    throttle: { mode: "none", ...DEFAULT_THROTTLE },
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--help") return { help: true };
    if (
      ![
        "--proxy",
        "--runs",
        "--delay-ms",
        "--timeout-ms",
        "--cache",
        "--shield",
        "--sites",
        "--storage-state",
        "--proxy-revision",
        "--output",
        "--throttle",
        "--latency-ms",
        "--download-mbps",
        "--upload-mbps",
      ].includes(key) ||
      i + 1 >= argv.length
    )
      throw new Error("Unknown or incomplete argument: " + key);
    const value = argv[++i];
    if (key === "--proxy") options.proxy = value;
    if (key === "--runs") options.runs = Number(value);
    if (key === "--delay-ms") options.delayMs = Number(value);
    if (key === "--timeout-ms") options.timeoutMs = Number(value);
    if (key === "--cache") options.cache = value;
    if (key === "--shield") options.shield = value;
    if (key === "--sites")
      options.sites = JSON.parse(fs.readFileSync(value, "utf8"));
    if (key === "--storage-state") options.storageState = value;
    if (key === "--proxy-revision") options.proxyRevision = value;
    if (key === "--output") options.output = value;
    if (key === "--throttle") options.throttle.mode = value;
    if (key === "--latency-ms") options.throttle.latencyMs = Number(value);
    if (key === "--download-mbps")
      options.throttle.downloadMbps = Number(value);
    if (key === "--upload-mbps") options.throttle.uploadMbps = Number(value);
  }
  let proxy;
  try {
    proxy = new URL(options.proxy);
  } catch (_e) {
    throw new Error("Pass --proxy with an HTTP(S) app URL.");
  }
  if (
    !["http:", "https:"].includes(proxy.protocol) ||
    proxy.username ||
    proxy.password ||
    proxy.pathname !== "/" ||
    proxy.search ||
    proxy.hash
  )
    throw new Error(
      "--proxy must be an HTTP(S) origin without credentials or a path."
    );
  options.proxy = proxy.origin;
  if (
    !["none", "cdp"].includes(options.throttle.mode) ||
    !Number.isFinite(options.throttle.latencyMs) ||
    options.throttle.latencyMs < 0 ||
    !Number.isFinite(options.throttle.downloadMbps) ||
    options.throttle.downloadMbps <= 0 ||
    !Number.isFinite(options.throttle.uploadMbps) ||
    options.throttle.uploadMbps <= 0
  )
    throw new Error("Invalid throttle profile.");
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 100)
    throw new Error("--runs must be an integer from 1 to 100.");
  if (
    !Number.isInteger(options.delayMs) ||
    options.delayMs < 0 ||
    options.delayMs > 600000
  )
    throw new Error("Invalid --delay-ms.");
  if (
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs < 1000 ||
    options.timeoutMs > 300000
  )
    throw new Error("Invalid --timeout-ms.");
  if (
    !["cold", "warm"].includes(options.cache) ||
    !["on", "off"].includes(options.shield)
  )
    throw new Error(
      "--cache must be cold or warm; --shield must be on or off."
    );
  if (
    !Array.isArray(options.sites) ||
    !options.sites.length ||
    options.sites.length > 20
  )
    throw new Error("Sites JSON must be a nonempty array (max 20).");
  options.sites.forEach((site) => {
    let url;
    try {
      url = new URL(site.url);
    } catch (_e) {
      throw new Error("Invalid site URL.");
    }
    if (
      typeof site.category !== "string" ||
      !site.category ||
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error(
        "Each site needs a category and an HTTP(S) URL without credentials."
      );
  });
  return options;
}
function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function gitInfo() {
  try {
    return {
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      dirty: Boolean(
        execFileSync("git", ["status", "--porcelain"], {
          encoding: "utf8",
        }).trim()
      ),
    };
  } catch (_e) {
    return { commit: null, dirty: null };
  }
}
async function makeSession(browser, mode, opts) {
  const context = await browser.newContext(
    opts.storageState && mode !== "direct"
      ? { storageState: opts.storageState }
      : {}
  );
  try {
    if (mode !== "direct") {
      await context.addInitScript(
        ({ origin, engine, shield }) => {
          if (window.top !== window || window.location.origin !== origin)
            return;
          let settings = {};
          try {
            settings = JSON.parse(
              localStorage.getItem("ibossbad_settings_v1") || "{}"
            );
          } catch (_e) {
            settings = {};
          }
          if (
            !settings ||
            typeof settings !== "object" ||
            Array.isArray(settings)
          )
            settings = {};
          settings.proxyEngine = engine;
          settings.shieldEnabled = shield;
          localStorage.setItem(
            "ibossbad_settings_v1",
            JSON.stringify(settings)
          );
          localStorage.removeItem("ibossbad_open_tabs_v1");
          sessionStorage.setItem("ibossbad.proxyTiming", "1");
        },
        { origin: opts.proxy, engine: mode, shield: opts.shield === "on" }
      );
    }
    const page = await context.newPage();
    if (opts.throttle.mode === "cdp") {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: opts.throttle.latencyMs,
        downloadThroughput: (opts.throttle.downloadMbps * 1000000) / 8,
        uploadThroughput: (opts.throttle.uploadMbps * 1000000) / 8,
      });
    }
    if (mode !== "direct") {
      await page.goto(opts.proxy, {
        waitUntil: "domcontentloaded",
        timeout: opts.timeoutMs,
      });
      const status = await page.evaluate(async () => {
        const r = await fetch("/api/status");
        return r.json();
      });
      if (!status.authenticated)
        throw new Error(
          "Proxy requires authentication; supply an authorized Playwright storage state."
        );
      await page
        .locator("#omniboxInput")
        .waitFor({ state: "visible", timeout: opts.timeoutMs });
    }
    return { context, page, warmupSucceeded: false };
  } catch (error) {
    await context.close();
    throw error;
  }
}
async function collectNavigation(frame) {
  return frame.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0];
    if (!entry) return null;
    return {
      ttfbMs: entry.responseStart || null,
      domContentLoadedMs: entry.domContentLoadedEventEnd || null,
      loadMs: entry.loadEventEnd || null,
    };
  });
}
async function runOne(session, site, mode, opts, phase, iteration, order) {
  const page = session.page;
  const result = {
    category: site.category,
    url: site.url,
    mode,
    phase,
    iteration,
    order,
    cache: opts.cache,
    cachePrepared: opts.cache === "warm" ? session.warmupSucceeded : null,
    shield: mode === "direct" ? "not-applicable" : opts.shield,
    relay: null,
    ok: false,
    error: null,
    elapsedMs: null,
    navigation: null,
    requests: 0,
    failedRequests: 0,
    transferredBytes: 0,
    byteMeasurementFailures: 0,
    scramjetMeasures: [],
  };
  const pending = [];
  const navigationStatuses = new Map();
  const onResponse = (response) => {
    try {
      if (response.request().isNavigationRequest())
        navigationStatuses.set(response.frame(), response.status());
    } catch (_e) {
      /* Some worker responses have no frame. */
    }
  };
  const onRequest = () => {
    result.requests++;
  };
  const onFailed = () => {
    result.failedRequests++;
  };
  const onFinished = (req) => {
    pending.push(
      req
        .sizes()
        .then((sizes) => {
          result.transferredBytes +=
            sizes.responseBodySize + sizes.responseHeadersSize;
        })
        .catch(() => {
          result.byteMeasurementFailures++;
        })
    );
  };
  const stopCounting = () => {
    page.off("response", onResponse);
    page.off("request", onRequest);
    page.off("requestfailed", onFailed);
    page.off("requestfinished", onFinished);
  };
  page.on("response", onResponse);
  page.on("request", onRequest);
  page.on("requestfailed", onFailed);
  page.on("requestfinished", onFinished);
  const start = Date.now();
  try {
    let frame;
    if (mode === "direct") {
      const response = await page.goto(site.url, {
        waitUntil: "load",
        timeout: opts.timeoutMs,
      });
      if (!response || response.status() >= 400)
        throw new Error(
          "Direct navigation returned no response or HTTP " +
            (response ? response.status() : "unknown")
        );
      frame = page.mainFrame();
      result.elapsedMs = Date.now() - start;
      stopCounting();
    } else {
      await page.evaluate(() => {
        performance
          .getEntriesByType("measure")
          .filter((e) => e.name.startsWith("iboss.scramjet."))
          .forEach((e) => performance.clearMeasures(e.name));
      });
      // A bound origin avoids treating unrelated embedded iframes as the page.
      const framePrefix =
        opts.proxy + (mode === "scramjet" ? "/scramjet/" : "/proxy/");
      await page.locator("#omniboxInput").fill(site.url);
      const navigation = page.waitForEvent("framenavigated", {
        timeout: opts.timeoutMs,
        predicate: (f) =>
          f.parentFrame() === page.mainFrame() &&
          (f.url().startsWith(framePrefix) || f.url().startsWith("blob:")),
      });
      const results = await Promise.all([
        navigation,
        page.locator("#omniboxForm").evaluate((form) => form.requestSubmit()),
      ]);
      frame = results[0];
      await frame.waitForLoadState("load", { timeout: opts.timeoutMs });
      result.elapsedMs = Date.now() - start;
      stopCounting();
      if (
        navigationStatuses.has(frame) &&
        navigationStatuses.get(frame) >= 400
      ) {
        throw new Error(
          "Proxy navigation returned HTTP " + navigationStatuses.get(frame)
        );
      }
      if (frame.url().startsWith("blob:"))
        throw new Error(
          "Proxy displayed a fallback/error frame; target load not verified."
        );
      const body = await frame
        .locator("body")
        .innerText({ timeout: 3000 })
        .catch(() => "");
      if (
        /Could not reach target page|Couldn't reach that site|Unable to open site|Authentication required to use proxy|Performing security verification|Just a moment\.\.\./i.test(
          body
        )
      )
        throw new Error("Proxy displayed an error or authentication page.");
      if (mode === "scramjet") {
        result.relay = await page
          .locator("#inspectorRelayBadge")
          .textContent()
          .catch(() => null);
      }
      result.scramjetMeasures = await page.evaluate(() =>
        performance
          .getEntriesByType("measure")
          .filter((e) => e.name.startsWith("iboss.scramjet."))
          .map((e) => ({ name: e.name, durationMs: e.duration }))
      );
    }
    result.navigation = await collectNavigation(frame).catch(() => null);
    result.ok = true;
  } catch (error) {
    if (result.elapsedMs === null) result.elapsedMs = Date.now() - start;
    result.error = String((error && error.message) || error)
      .split("\n")[0]
      .slice(0, 500);
    if (mode === "scramjet") {
      result.relay = await page
        .locator("#inspectorRelayBadge")
        .textContent()
        .catch(() => null);
      result.scramjetMeasures = await page
        .evaluate(() =>
          performance
            .getEntriesByType("measure")
            .filter((e) => e.name.startsWith("iboss.scramjet."))
            .map((e) => ({ name: e.name, durationMs: e.duration }))
        )
        .catch(() => []);
    }
  } finally {
    stopCounting();
    await Promise.all(pending);
  }
  return result;
}

async function execute(browser, opts, checkpoint) {
  const runs = [];
  const modes = ["direct", "stream", "scramjet"];
  let order = 0;
  async function collect(site, mode, phase, iteration, session) {
    order++;
    process.stderr.write(
      "Run " +
        order +
        ": " +
        site.category +
        " / " +
        mode +
        " / " +
        phase +
        "\n"
    );
    let owned = false;
    try {
      if (!session) {
        session = await makeSession(browser, mode, opts);
        owned = true;
      }
      return await runOne(session, site, mode, opts, phase, iteration, order);
    } catch (error) {
      return {
        category: site.category,
        url: site.url,
        mode,
        phase,
        iteration,
        order,
        cache: opts.cache,
        cachePrepared: false,
        shield: mode === "direct" ? "not-applicable" : opts.shield,
        relay: null,
        ok: false,
        error:
          "Setup failed: " +
          String((error && error.message) || error)
            .split("\n")[0]
            .slice(0, 500),
        elapsedMs: null,
        navigation: null,
        requests: 0,
        failedRequests: 0,
        transferredBytes: 0,
        byteMeasurementFailures: 0,
        scramjetMeasures: [],
      };
    } finally {
      if (owned && session) await session.context.close();
    }
  }
  for (const site of opts.sites) {
    const sessions = {};
    try {
      if (opts.cache === "warm") {
        for (const mode of modes) {
          try {
            sessions[mode] = await makeSession(browser, mode, opts);
          } catch (_e) {
            sessions[mode] = null;
          }
          const warmup = await collect(site, mode, "warmup", 0, sessions[mode]);
          runs.push(warmup);
          if (checkpoint) checkpoint(report(false));
          if (sessions[mode]) sessions[mode].warmupSucceeded = warmup.ok;
          await pause(opts.delayMs);
        }
      }
      for (let i = 1; i <= opts.runs; i++) {
        // Rotate ordering rather than always giving one mode the earliest run.
        const sequence = modes
          .slice((i - 1) % modes.length)
          .concat(modes.slice(0, (i - 1) % modes.length));
        for (const mode of sequence) {
          runs.push(await collect(site, mode, "measured", i, sessions[mode]));
          if (checkpoint) checkpoint(report(false));
          await pause(opts.delayMs);
        }
      }
    } finally {
      await Promise.all(
        Object.values(sessions)
          .filter(Boolean)
          .map((s) => s.context.close())
      );
    }
  }
  return report(true);
  function report(complete) {
    const summary = summarize(runs);
    return {
      schemaVersion: 1,
      complete,
      runnerOS: {
        platform: os.platform(),
        release: os.release(),
        architecture: os.arch(),
      },
      createdAt: new Date().toISOString(),
      runnerGit: gitInfo(),
      proxyRevision: opts.proxyRevision,
      proxyOrigin: opts.proxy,
      browserVersion: browser.version(),
      cache: opts.cache,
      contextMode:
        opts.cache === "cold" ? "fresh-per-run" : "reused-per-site-and-mode",
      cacheDefinition:
        opts.cache === "warm"
          ? "Separate context per site and mode; one recorded warmup precedes measured runs."
          : "Fresh browser context per measured run; proxy app shell initializes before the timed navigation. Browser process and OS caches may still be warm.",
      shield: opts.shield,
      throttle:
        opts.throttle.mode === "none" ? { mode: "none" } : opts.throttle,
      throttleScope:
        opts.throttle.mode === "none"
          ? "No browser throttling applied; any external network shaping is not detected."
          : "Experimental CDP page throttling; WebSocket and worker traffic may not be throttled, and proxy-to-origin traffic is not throttled. Do not compare paths until independently validated.",
      warmupPolicy:
        opts.cache === "warm"
          ? "One recorded warmup per site and mode is excluded from summaries."
          : "No warmup; each measured run uses a fresh browser context.",
      navigationDefinition:
        "Wall clock from benchmark navigation start through load event; proxy measurement includes app form dispatch and navigation, not initial app startup. Timings and bytes may be unavailable or incomplete.",
      countsDefinition:
        "Browser requests observed until the load event; transferred bytes are completed response headers and encoded response bodies, excluding in-flight/failed responses and overhead.",
      runs,
      summary,
      estimatedMedianDifferences: estimateDeltas(summary),
    };
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(
      "Usage: node scripts/benchmark-proxy.js --proxy https://your-proxy.example [--runs 10] [--delay-ms 3000] [--timeout-ms 45000] [--cache warm|cold] [--shield off|on] [--sites sites.json] [--storage-state private-file.json] [--proxy-revision SHA] [--output file.json] [--throttle none|cdp] [--latency-ms 40] [--download-mbps 10] [--upload-mbps 5]\n"
    );
    return;
  }
  const chromium = require("playwright").chromium;
  const browser = await chromium.launch({ headless: true });
  try {
    const save = opts.output
      ? (result) => {
          const temp = opts.output + ".tmp";
          fs.writeFileSync(temp, JSON.stringify(result, null, 2) + "\n", {
            mode: 0o600,
          });
          fs.renameSync(temp, opts.output);
        }
      : null;
    const result = await execute(browser, opts, save);
    if (save) save(result);
    else process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally {
    await browser.close();
  }
}
if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(
      "Benchmark failed: " + String((err && err.message) || err) + "\n"
    );
    process.exitCode = 1;
  });
}
module.exports = {
  parseArgs,
  percentile,
  summarize,
  estimateDeltas,
  execute,
  runOne,
};
