"use strict";
const tap = require("tap");
const benchmark = require("../scripts/benchmark-proxy");

tap.test("defaults and configurable throttle", (t) => {
  const options = benchmark.parseArgs([
    "--proxy",
    "http://localhost:8080",
    "--throttle",
    "cdp",
    "--latency-ms",
    "20",
    "--download-mbps",
    "5",
  ]);
  t.equal(options.runs, 10);
  t.equal(options.shield, "off");
  t.equal(options.sites.length, 3);
  t.equal(options.throttle.latencyMs, 20);
  t.equal(options.throttle.downloadMbps, 5);
  t.throws(() =>
    benchmark.parseArgs(["--proxy", "http://user:pass@localhost"])
  );
  t.throws(() =>
    benchmark.parseArgs(["--proxy", "http://localhost", "--upload-mbps", "0"])
  );
  t.end();
});

tap.test("summaries exclude failed runs and warmups", (t) => {
  const base = {
    category: "fixture",
    url: "http://example.test/",
    mode: "direct",
    phase: "measured",
  };
  const summary = benchmark.summarize([
    { ...base, ok: true, elapsedMs: 10 },
    { ...base, ok: true, elapsedMs: 30 },
    { ...base, ok: false, elapsedMs: 900 },
    { ...base, phase: "warmup", ok: true, elapsedMs: 1000 },
  ])[0];
  t.equal(summary.runs, 3);
  t.equal(summary.failureRate, 1 / 3);
  t.equal(summary.medianLoadMs, 10);
  t.equal(summary.p95LoadMs, 30);
  t.match(
    benchmark.estimateDeltas([{ ...summary, mode: "stream" }, summary])[0]
      .caveat,
    /not a causal/
  );
  t.end();
});

tap.test(
  "setup failures are retained, order rotates and warmups are excluded",
  async (t) => {
    const opts = benchmark.parseArgs([
      "--proxy",
      "http://localhost:8080",
      "--runs",
      "3",
      "--delay-ms",
      "0",
    ]);
    opts.sites = [{ category: "dead", url: "http://dead.invalid/" }];
    const browser = {
      version: () => "test",
      newContext: async () => {
        throw new Error("unavailable");
      },
    };
    const checkpoints = [];
    const output = await benchmark.execute(browser, opts, (record) => {
      checkpoints.push(JSON.parse(JSON.stringify(record)));
    });
    t.equal(checkpoints.length, 12);
    t.equal(checkpoints[0].complete, false);
    t.equal(checkpoints[0].runs.length, 1);
    t.equal(output.complete, true);
    t.equal(typeof output.runnerOS.platform, "string");
    t.equal(output.throttle.mode, "none");
    t.equal(output.contextMode, "reused-per-site-and-mode");
    t.match(output.warmupPolicy, /excluded/);
    t.equal(output.runs.length, 12);
    t.same(
      output.runs.filter((r) => r.phase === "measured").map((r) => r.mode),
      [
        "direct",
        "stream",
        "scramjet",
        "stream",
        "scramjet",
        "direct",
        "scramjet",
        "direct",
        "stream",
      ]
    );
    t.ok(
      output.summary.every(
        (row) =>
          row.runs === 3 &&
          row.failures === 3 &&
          row.medianLoadMs === null &&
          row.p95LoadMs === null
      )
    );
    t.same(JSON.parse(JSON.stringify(output)).runs.length, 12);
  }
);

tap.test(
  "navigation timeouts are retained and excluded from statistics",
  async (t) => {
    const { EventEmitter } = require("events");
    const page = new EventEmitter();
    const opts = benchmark.parseArgs([
      "--proxy",
      "http://localhost:8080",
      "--timeout-ms",
      "5000",
    ]);
    let clock = 1000;
    const originalNow = Date.now;
    Date.now = () => clock;
    page.goto = async (_url, options) => {
      t.equal(
        options.timeout,
        5000,
        "passes the per-navigation timeout to Playwright"
      );
      clock += options.timeout;
      throw new Error("page.goto: Timeout 5000ms exceeded");
    };
    try {
      const site = { category: "slow", url: "https://example.test/" };
      const result = await benchmark.runOne(
        { page, warmupSucceeded: false },
        site,
        "direct",
        opts,
        "measured",
        1,
        1
      );
      t.equal(result.ok, false);
      t.match(result.error, /Timeout 5000ms/);
      t.equal(result.elapsedMs, 5000);
      t.equal(
        page.listenerCount("request"),
        0,
        "listeners are removed after timeout"
      );
      const summary = benchmark.summarize([result])[0];
      t.equal(summary.failures, 1);
      t.equal(summary.failureRate, 1);
      t.equal(summary.medianLoadMs, null);
      t.equal(summary.p95LoadMs, null);
    } finally {
      Date.now = originalNow;
    }
  }
);

tap.test("proxy frame timeout is a retained failure", async (t) => {
  const { EventEmitter } = require("events");
  const page = new EventEmitter();
  const opts = benchmark.parseArgs([
    "--proxy",
    "http://localhost:8080",
    "--timeout-ms",
    "5000",
  ]);
  page.evaluate = async () => {};
  page.locator = () => ({ fill: async () => {}, evaluate: async () => {} });
  page.waitForEvent = async (_event, options) => {
    t.equal(options.timeout, 5000);
    throw new Error("page.waitForEvent: Timeout 5000ms exceeded");
  };
  const result = await benchmark.runOne(
    { page, warmupSucceeded: false },
    { category: "slow", url: "https://example.test/" },
    "stream",
    opts,
    "measured",
    1,
    1
  );
  t.equal(result.ok, false);
  t.match(result.error, /Timeout 5000ms/);
  t.equal(benchmark.summarize([result])[0].medianLoadMs, null);
  t.equal(page.listenerCount("response"), 0);
});

tap.test("cold run records fresh context policy", async (t) => {
  const opts = benchmark.parseArgs([
    "--proxy",
    "http://localhost:8080",
    "--cache",
    "cold",
    "--runs",
    "1",
    "--delay-ms",
    "0",
  ]);
  opts.sites = [{ category: "fixture", url: "https://example.test/" }];
  const browser = {
    version: () => "test",
    newContext: async () => {
      throw new Error("unavailable");
    },
  };
  const result = await benchmark.execute(browser, opts);
  t.equal(result.contextMode, "fresh-per-run");
  t.equal(result.runs.length, 3);
  t.ok(result.runs.every((run) => run.phase === "measured"));
});

tap.test("setup failures do not count as navigation failures", (t) => {
  const base = {
    category: "test",
    url: "https://example.test/",
    mode: "stream",
    phase: "measured",
  };
  const summary = benchmark.summarize([
    { ...base, ok: false, failureStage: "setup" },
    { ...base, ok: false, failureStage: "navigation" },
    { ...base, ok: true, elapsedMs: 20 },
  ])[0];
  t.equal(summary.setupFailures, 1);
  t.equal(summary.navigationAttempts, 2);
  t.equal(summary.navigationFailures, 1);
  t.equal(summary.navigationFailureRate, 0.5);
  t.equal(summary.minLoadMs, 20);
  t.equal(summary.maxLoadMs, 20);
  t.end();
});

tap.test(
  "document validation records destination, status and marker failures",
  async (t) => {
    const target = "https://github.com/nodejs/node";
    const key = [90, 51, 113, 25];
    const token = Buffer.from(
      Buffer.from(target).map((byte, i) => byte ^ key[i % 4])
    ).toString("base64url");
    const frame = {
      url: () => "http://localhost:8080/scramjet/u1_" + token,
      title: async () => "GitHub - nodejs/node",
      locator: () => ({ innerText: async () => "nodejs node repository" }),
    };
    const opts = { proxy: "http://localhost:8080" };
    const valid = await benchmark.inspectDocument(
      frame,
      "scramjet",
      opts,
      { titleIncludes: "nodejs/node" },
      200
    );
    t.equal(valid.finalOrigin, "https://github.com");
    t.equal(valid.finalPath, "/nodejs/node");
    t.equal(valid.status, 200);
    t.equal(valid.contentCheck.passed, true);
    t.equal(
      (
        await benchmark.inspectDocument(
          frame,
          "scramjet",
          opts,
          { titleIncludes: "not there" },
          200
        )
      ).contentCheck.passed,
      false
    );
    t.equal(
      (await benchmark.inspectDocument(frame, "scramjet", opts, {}, 429))
        .contentCheck.passed,
      false
    );
    t.equal(
      (await benchmark.inspectDocument(frame, "scramjet", opts, {}, undefined))
        .contentCheck.passed,
      false
    );
    t.same(
      benchmark.finalDestination(
        "https://example.com/test?private=1#x",
        "direct",
        opts.proxy
      ),
      { origin: "https://example.com", path: "/test" }
    );
  }
);

tap.test(
  "status 429 is not mislabeled as authentication failure",
  async (t) => {
    let closed = false;
    const page = {
      goto: async () => {},
      evaluate: async () => ({
        code: 429,
        body: { error: "Rate limit exceeded" },
      }),
    };
    const context = {
      addInitScript: async () => {},
      newPage: async () => page,
      close: async () => {
        closed = true;
      },
    };
    const browser = { newContext: async () => context };
    const opts = benchmark.parseArgs(["--proxy", "http://localhost:8080"]);
    await t.rejects(
      benchmark.makeSession(browser, "stream", opts),
      /HTTP 429 \(rate limited\)/
    );
    t.equal(closed, true);
  }
);
