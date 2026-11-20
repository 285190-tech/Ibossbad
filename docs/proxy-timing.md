# Stream proxy timing diagnostics

Set `PROXY_SERVER_TIMING=true` on the server and restart it to add timing data to proxied **Stream** responses. It is off by default. In browser DevTools, inspect the network response's `Server-Timing` header or timing panel. A local programmatic deployment can instead pass `proxyServerTiming: true` to `createApp`.

Values are milliseconds measured with a monotonic clock. Names are prefixed with `iboss_`; any upstream `Server-Timing` values are preserved.

- `iboss_queue`: from creation of the upstream request until a socket is assigned. It includes scheduling as well as agent-pool waiting.
- `iboss_dns`: approximately socket assignment to the first DNS lookup event, when such an event occurs. This includes the application DNS cache lookup, so a cache hit is not a network DNS measurement.
- `iboss_tcp`: from DNS completion (or socket assignment for IP literals) to TCP connect.
- `iboss_tls`: from TCP connect to TLS handshake completion for HTTPS.
- `iboss_origin_wait`: from connection readiness (or socket assignment for reused connections) until response headers. It includes request upload as well as upstream processing and network latency; it is not purely server processing time.
- `iboss_headers`: total from upstream request creation to response headers. It does not include earlier app routing, full response transfer, rewriting, browser rendering, or client-to-proxy network latency.

DNS, TCP, and TLS entries are omitted when no new connection/lookup happens, such as a keep-alive socket reuse. Connection failures without response headers cannot report these metrics in `Server-Timing`. Metrics measure Stream only, not browser-side Scramjet or WISP. Upstream servers can also provide `Server-Timing`, so treat upstream-provided metrics as untrusted.

Enabling these response headers exposes coarse backend timing to proxy users. Use only when appropriate and disable after investigation. Measure representative pages and compare repeat runs; the instrumentation itself does not make the proxy faster. For a direct-versus-proxy comparison, use identical URLs, network location and cache conditions, and separately note browser rendering and full-transfer timings. Avoid testing with credentials or recording sensitive URLs in shared logs.

## Scramjet startup timings (browser-side)

In the app's top-level page, open DevTools and run:

```js
sessionStorage.setItem('ibossbad.proxyTiming', '1');
location.reload();
```

Navigate to a page through Scramjet, then run:

```js
performance.getEntriesByType('measure')
  .filter(entry => entry.name.startsWith('iboss.scramjet.'))
  .map(({ name, duration }) => ({ name, ms: Math.round(duration * 10) / 10 }));
```

To disable it, run `sessionStorage.removeItem('ibossbad.proxyTiming')` and reload. The flag is scoped to the current browser tab/session. Metrics contain fixed stage names and durations, not destination or relay URLs. Up to 100 entries are retained per stage; older entries are cleared when that stage reaches the limit. Entries include failed attempts, but do not encode success or failure. Use current browser DevTools and observe any errors separately.

- `iboss.scramjet.controller_init` and `service_worker_ready` measure parallel initialization tasks. Do not add their durations together.
- `relay_probe` measures each scanner probe, including failures/timeouts; multiple concurrent pool probes may appear. It does not measure a full TLS request to the page.
- `transport_install` measures BareMux's `setTransport` call. Depending on the transport, it may not include the eventual WISP connection, TLS handshake, or first request.
- `transport_ready` covers startup/selection through transport installation, not page load. Cached and already-ready paths differ: an already-ready call does not add another `transport_ready` entry.
- `navigation_dispatch` ends when `sjFrame.go()` is invoked, not when the response, rewriting, or rendering completes. Use the Performance and Network panels for page-load and service-worker activity; these measurements do not isolate service-worker rewrite time.

Enabling diagnostics requires a reload, which may preserve session-cached relay selection. When comparing cold and warm starts, control browser caches and the `ibossbad.fastRelay.v2` session entry deliberately; use the same site and network conditions. No authenticated deployed-site or real-browser benchmark is supplied by these diagnostics.

## Browser comparison benchmark (experimental)

Use Node 18+ and install dev dependencies and Playwright Chromium (`npm ci`, then `npx playwright install --with-deps chromium`). Run against an authorized app instance:

```sh
node scripts/benchmark-proxy.js --proxy https://your-app.example --proxy-revision DEPLOYED_SHA > /tmp/proxy-benchmark.json
```

Defaults are 10 measured runs each for example.com, github.com/nodejs/node and Wikimedia Commons, with a 3-second pause, a separate warm context per site and mode, and Shield off. A recorded warmup precedes each group. The order rotates across modes. For a fresh context per run use `--cache cold`; this does not clear OS caches or reset the server. If a warmup fails, `cachePrepared` is false. `--shield on` is a separate configuration; never combine its results with Shield-off samples. `--runs`, `--delay-ms`, and `--timeout-ms` are configurable; the `--latency-ms`, `--download-mbps`, and `--upload-mbps` flags apply only with `--throttle cdp`. The default is **no browser throttling**; treat results as relative comparisons only and record any external shaping separately. Experimental `--throttle cdp` enables a fixed default profile of 40 ms latency, 10 Mbps down and 5 Mbps up, adjustable with the profile flags. CDP shaping may not apply to WebSocket or worker traffic (including WISP) and never controls proxy-to-origin traffic; do not compare modes under CDP shaping until its coverage has been verified for your setup. For equal client-side shaping use an appropriately configured OS-level tool such as Linux `tc netem` or macOS Network Link Conditioner, and record its configuration separately.

Override sites with `--sites /path/to/sites.json`, a JSON array such as `[{"category":"fixture","url":"https://your-controlled-fixture.example/"}]`. You can include a self-hosted fixture alongside the defaults. Supply `--storage-state /private/path/state.json` for an already authorized Playwright storage state if needed; protect that file and keep it and benchmark output outside the repository. Results can contain site URLs, error messages and relay labels, so review them before sharing. No credentials should be passed in URLs. The runner records its own git revision and dirty state; `--proxy-revision` identifies the deployed revision separately, if known.

Each measured result retains failures, order, cache and Shield configuration, available navigation timing and startup measures, request counts, and completed response bytes. Summaries report failure rates and nearest-rank median/p95 of successful load times only. The proxy timer includes form dispatch but excludes initial app-shell startup. Browser navigation entries may be unavailable or describe a rewritten/proxied document, not origin timing. Byte/request counts may omit in-flight requests and service-worker or relay traffic. Relay labels are best effort. A successful load event is not proof the target rendered correctly; challenge and error detection is heuristic, so inspect failures and pages separately. Direct–proxy differences are **estimates**, not causal proxy overhead: network paths, site variance, caching, relay and Shield confound them. Scramjet startup measures do not isolate rewriting or full page load. This harness has not yet been validated end-to-end against a deployed proxy.

### Validation before interpreting results

This sandbox could not download Chromium, so the following browser checks remain **unverified**, including whether CDP limits WISP traffic. On the machine where you run it:

1. Use a controlled, non-sensitive site with `--runs 2`; check the JSON and inspect navigation, request counts, relay and timing availability. Null values are expected when the browser cannot expose a measurement. Confirm the pages actually rendered.
2. Include a dead hostname and a controlled endpoint slower than `--timeout-ms`. Verify both failure records and per-site failure rates; failed runs must not enter medians or p95. A failure may occur at different layers for direct and proxy paths.
3. Run the same tracker-heavy controlled page separately with `--shield off` and `--shield on`, inspect the recorded setting and verify the difference in requests using network logs. Counts observed by Playwright may omit worker traffic and are not by themselves proof of blocking.
4. Inspect `order`, `phase` and `cachePrepared`: warmups are recorded but excluded; each mode has its own warmup. Failed warmups or recreated contexts do not establish a warm cache. The mode order rotates across measured iterations. In cold mode every measured run uses a fresh context, but OS/server caches can still change.
5. Repeat an identical configuration on a quiet machine. If the between-run median variation exceeds the effect of interest, collect more samples or improve test isolation rather than drawing conclusions.
6. To investigate CDP coverage, test a controlled, sufficiently large uncached response at `--throttle cdp --download-mbps 0.05` against an unthrottled baseline; compare both direct and WISP transfer times and relay traffic. This is a diagnostic, not an apples-to-apples benchmark unless both paths are shown to be shaped. A timeout or cache hit is not evidence of throttling.

The manually triggered **Experimental proxy benchmark** GitHub Actions workflow uses the Playwright 1.56.1 Noble container (with Chromium and system dependencies preinstalled), starts the checked-out app locally, waits for readiness, creates temporary random credentials and an authentication state, then runs two unthrottled repetitions and uploads JSON for seven days, even on failure. The default is **two measured runs per site and mode per repetition: a smoke test, not a benchmark**. Set the `runs` input to at least 10 for comparisons. Credentials and browser state are not uploaded; output contains site URLs and possibly relay labels, so use only non-sensitive URLs and review artifacts before sharing. Anyone with repository Actions access may be able to read them. The workflow must exist on the default branch before it can be dispatched; after that a chosen branch/ref can be run via `gh`. The proxy revision is the checked-out commit, not a deployed Render revision. Compare both artifacts' medians manually before interpreting an effect. Hosted runners use shared hardware and fast datacenter networking: use them for relative commit comparisons under identical conditions, not real-world slow-connection speed estimates.

For partial results if interrupted, `--output /private/path/run.json` atomically checkpoints a valid JSON file after each completed run. `complete: false` means the benchmark did not finish; summaries cover only recorded measured runs, so compare them cautiously. Fatal failures before the first completed run cannot produce a checkpoint. Standard output mode instead writes JSON only on completion.

### JSON schema (version 2)

The top-level `schemaVersion`, `complete`, `createdAt`, `runnerGit` (commit and dirty), `runnerOS`, `browserVersion`, `proxyRevision`, `sessionProfile`, `proxyOrigin`, `cache`, `contextMode`, `warmupPolicy`, `shield`, `throttle` and descriptive scope strings establish the context. `runs` contains individual `category`, `url`, `mode`, `phase`, `iteration`, global `order`, `cache`, `cachePrepared`, `shield`, `relay`, `ok`, `error`, `failureStage`, `elapsedMs`, `navigation`, `document`, request/byte counts and `scramjetMeasures`. `document` reports the observed main-document status, content encoding, title, final destination origin/path when decodable, and content-check details (no query or fragment in the destination). `navigation` has `ttfbMs`, `domContentLoadedMs` and `loadMs` when exposed. `summary` groups measured runs per site and mode, with overall failures, setup failures, navigation attempts and failures, navigation failure rate excluding setup failures, successful duration count, minimum, maximum, and nearest-rank `medianLoadMs` and `p95LoadMs`. Validation failures are counted among navigation failures. Overall `failureRate` includes setup failures and must not be interpreted as proxy failure rate. `estimatedMedianDifferences` compares independent successful medians to direct and includes the interpretation caveat. Nulls mean unavailable or inapplicable, not zero; failures can legitimately have missing navigation and relay data. Preserve `schemaVersion` when comparing artifacts and check `complete` before using summaries.

### Initial CI smoke observations

A branch-only GitHub Actions smoke run against `https://example.com/` completed with two measured runs per mode and Shield configured off. Its [artifact](https://github.com/285190-tech/Ibossbad/actions/runs/44768424571) records commit `4b6fc255c1e92211898897120cd1b2f6f3c10710` and the self-hosted WISP relay. All three paths reported success, but this is a smoke test, not a meaningful performance comparison or independent proof of rendering or Shield behavior. A separate [failure-path run](https://github.com/285190-tech/Ibossbad/actions/runs/44768888799) retained and counted dead-host failures for all three modes, excluding them from statistics. The attempted slow endpoint returned HTTP 400 instead of timing out, so timeout handling remains unvalidated in a real browser. Shield on/off, controlled slow-endpoint behavior, meaningful repeatability, and CDP WebSocket shaping remain to be tested. Hosted-runner observations are not estimates of end-user experience.

In the first smoke artifact, the warm direct measurements reported zero completed transferred bytes and approximately 0.6–0.7 ms navigation TTFB, consistent with browser caching; Stream also reported zero completed bytes on its measured runs. This is not proof of identical caching behavior across modes. The recorded elapsed value is wall time until the browser load event, not fresh TLS latency, and the local app and relay eliminate a realistic user-to-server network leg. Differences can include timing overhead, startup, caching, network path and other factors, not just CPU, rewriting or handshake costs. The workflow's `cache` input can select `cold` to use a fresh context for each measured navigation; OS, server and intermediary caches remain uncontrolled.

`contextMode` is `fresh-per-run` for cold mode and `reused-per-site-and-mode` for warm mode. A fresh browser context avoids reuse of that context's HTTP cache, but does not clear OS, server, relay, DNS or intermediary caches. Context policy is only one of the differences that must be matched across comparisons.


Schema v2 changes what is counted as success: the observed main document must have HTTP status 200–399, a decodable final destination, nonempty body, no recognized challenge/error, and pass configured `titleIncludes` / `contentIncludes` assertions (case-insensitive). Default example.com, Node.js and Commons targets include title assertions; custom site JSON can set either or both. Without a configured marker the nonempty-body check is weak. These checks are heuristics, not proof that scripts, rendering, or the entire page work. HTTP status is the browser-observed response and can be generated or transformed by proxy/worker code; unknown status or destination fails validation. Validation is performed after the timed load event. The document title and path may be sensitive; use non-sensitive sites. Byte and request counts differ by transport, and are not comparable across direct and WISP.

The CI workflow authenticates once and loads the saved state into each fresh proxy context. Its throwaway loopback-only app uses an **admin session exempt from app rate limiting**, identified as `sessionProfile: ci-admin-rate-limit-exempt`; it does not represent normal-user rate-limit behavior. The previous script incorrectly called a non-200 `/api/status` response an authentication error: HTTP 429 responses omit the `authenticated` property. The server's 240/minute default makes that a plausible explanation for earlier failures, but the previous results do not record HTTP status and cannot prove it. Now non-200 status checks are reported by HTTP code as setup failures. CI sets revision metadata from `GITHUB_SHA` rather than relying on git's ownership policy inside a container.

Stream's rewrite middleware decompresses compressed response bodies when processing HTML/JS and removes `Content-Encoding`; the normal Stream response pipeline shown in `lib/unblocker.js` does not recompress rewritten responses. Main-document `contentEncoding` is now recorded for investigation, but observed per-mode totals include different traffic, so those totals alone cannot quantify compression savings. No speedup is implied by this instrumentation.

The two 10-run results from commit `14a7b5562694cdf3e324cd770930f3f5a8005f25` contain a destination-reporting defect: the GitHub Scramjet `finalOrigin` is the local proxy because nested rewritten URLs were decoded only once. Unwrapping the recorded nested path reaches `https://github.com/nodejs/node`, but those records should not be treated as independently verified final destinations. The decoder now unwraps nested proxy paths with a fixed limit and rejects unresolved proxy URLs; this change has unit tests but has not yet been revalidated in a real browser. Nested wrapping itself merits investigation and may affect performance; the timing numbers do not identify its cause or cost.

## Experimental rewritten Stream compression

`PROXY_STREAM_COMPRESSION=true` enables level-1 streaming gzip on eligible rewritten Stream responses; it is **off by default**. Local app callers can pass `proxyStreamCompression: true`. This is separate from shell static-asset compression and does not apply to Scramjet/WISP. It checks browser gzip negotiation, sends incremental output, adjusts `Vary`, removes stale length/validators and skips range/partial, already-encoded, private, no-store, no-transform, authorization-bearing, external-cookie and external-Set-Cookie responses. The proxy's own session cookies are excluded from the external-cookie check. These checks reduce exposure but cannot identify every personalized response (for example, a secret in a URL or content personalized by IP). HTTP compression can create information-leak risks for secrets reflected alongside attacker-controlled text; keep this experimental option off for sensitive environments unless separately assessed. It consumes CPU and may be slower on fast local links or incompressible content. Do not enable it on a public deployment based only on a synthetic test.

The GitHub workflow has an explicit `stream_compression` input. Its output `streamCompression` is the requested configuration, not proof a response was compressed; inspect each Stream `document.contentEncoding`. The CLI `--stream-compression on|off|unknown` records the operator-supplied configuration and does not change server settings. Compare runs with matching sites, cache, relay and session configuration, and review failures and browser rendering as well as timings. The local synthetic streaming test served its initial decoded content before the origin finished and compressed a repetitive fixture from roughly 76 KB to 900 bytes; this says nothing about production page-load latency.
