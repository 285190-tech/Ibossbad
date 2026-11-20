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
