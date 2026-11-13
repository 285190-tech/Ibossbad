"use strict";

importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const CORE_PRECACHE_NAME = "ibossbad-core-v1";
const ASSET_CACHE_NAME = "ibossbad-scramjet-v1";
const MAX_SINGLE_ASSET_BYTES = 30 * 1024 * 1024; // 30 MB per asset ceiling
const MAX_TOTAL_CACHE_BYTES = 120 * 1024 * 1024; // 120 MB total Chromebook ceiling

const CORE_PRECACHE_URLS = [
  "/scram/scramjet.wasm.wasm",
  "/scram/scramjet.all.js",
  "/scram/scramjet.sync.js",
  "/baremux/index.js",
];

// O(1) domain suffix Set covering 260+ ad, tracker, telemetry & crash-reporting hosts
const AD_BLOCK_DOMAINS = [
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "google-analytics.com",
  "googletagmanager.com",
  "googletagservices.com",
  "pagead2.googlesyndication.com",
  "adservice.google.com",
  "2mdn.net",
  "adnxs.com",
  "adsrvr.org",
  "criteo.com",
  "criteo.net",
  "taboola.com",
  "outbrain.com",
  "scorecardresearch.com",
  "rubiconproject.com",
  "pubmatic.com",
  "openx.net",
  "casalemedia.com",
  "moatads.com",
  "quantserve.com",
  "adform.net",
  "smartadserver.com",
  "popads.net",
  "popcash.net",
  "propellerads.com",
  "adsterra.com",
  "exoclick.com",
  "juicyads.com",
  "trafficjunky.net",
  "revcontent.com",
  "mgid.com",
  "zemanta.com",
  "teads.tv",
  "sharethrough.com",
  "triplelift.com",
  "indexexchange.com",
  "33across.com",
  "sovrn.com",
  "lijit.com",
  "bidswitch.net",
  "contextweb.com",
  "advertising.com",
  "adtechus.com",
  "amazon-adsystem.com",
  "media.net",
  "yieldmo.com",
  "gumgum.com",
  "kargo.com",
  "spotxchange.com",
  "spotx.tv",
  "springserve.com",
  "innovid.com",
  "flashtalking.com",
  "sizmek.com",
  "serving-sys.com",
  "celtra.com",
  "iasds01.com",
  "adsafeprotected.com",
  "doubleverify.com",
  "demdex.net",
  "omtrdc.net",
  "everesttech.net",
  "krxd.net",
  "bluekai.com",
  "bkrtx.com",
  "exelator.com",
  "rlcdn.com",
  "pippio.com",
  "liveintent.com",
  "tapad.com",
  "agkn.com",
  "mathtag.com",
  "turn.com",
  "eyeota.net",
  "lotame.com",
  "crwdcntrl.net",
  "zeotap.com",
  "id5-sync.com",
  "uidapi.com",
  "adsymptotic.com",
  "adition.com",
  "admixer.net",
  "adotmob.com",
  "adriver.ru",
  "adscale.de",
  "adspeed.net",
  "adspirit.de",
  "adtelligent.com",
  "adthrive.com",
  "mediavine.com",
  "ezoic.net",
  "ezodn.com",
  "freestar.io",
  "pub.network",
  "snigelweb.com",
  "playwire.com",
  "intergi.com",
  "venatusmedia.com",
  "nitropay.com",
  "adinplay.com",
  "poki-analytics.com",
  "gameanalytics.com",
  "unityads.unity3d.com",
  "applovin.com",
  "applvn.com",
  "vungle.com",
  "chartboost.com",
  "ironsrc.com",
  "ironsource.mobi",
  "inmobi.com",
  "fyber.com",
  "smaato.net",
  "startappservice.com",
  "adcolony.com",
  "tapjoy.com",
  "adjust.com",
  "appsflyer.com",
  "branch.io",
  "app.link",
  "kochava.com",
  "singular.net",
  "hotjar.com",
  "hotjar.io",
  "mouseflow.com",
  "fullstory.com",
  "luckyorange.com",
  "crazyegg.com",
  "inspectlet.com",
  "smartlook.com",
  "clarity.ms",
  "logrocket.io",
  "logrocket.com",
  "lr-ingest.io",
  "mixpanel.com",
  "mxpnl.com",
  "amplitude.com",
  "segment.io",
  "segment.com",
  "heapanalytics.com",
  "kissmetrics.com",
  "posthog.com",
  "rudderlabs.com",
  "snowplowanalytics.com",
  "statcounter.com",
  "histats.com",
  "newrelic.com",
  "nr-data.net",
  "datadoghq-browser-agent.com",
  "browser-intake-datadoghq.com",
  "bugsnag.com",
  "raygun.io",
  "rollbar.com",
  "trackjs.com",
  "sentry-cdn.com",
  "ingest.sentry.io",
  "o0.ingest.sentry.io",
  "braze.com",
  "iad-01.braze.com",
  "clevertap.com",
  "onesignal.com",
  "leanplum.com",
  "iterable.com",
  "klaviyo.com",
  "hubspot.com",
  "hs-analytics.net",
  "hsadspixel.net",
  "pardot.com",
  "marketo.net",
  "mktoresp.com",
  "intercom.io",
  "driftt.com",
  "connect.facebook.net",
  "analytics.tiktok.com",
  "ads-twitter.com",
  "static.ads-twitter.com",
  "t.co",
  "tr.snapchat.com",
  "sc-static.net",
  "ct.pinterest.com",
  "px.ads.linkedin.com",
  "snap.licdn.com",
  "bat.bing.com",
  "clarity.bing.com",
  "yandex.ru/metrika",
  "mc.yandex.ru",
  "hm.baidu.com",
  "cnzz.com",
  "umeng.com",
  "cookiebot.com",
  "onetrust.com",
  "cookielaw.org",
  "trustarc.com",
  "consensu.org",
  "quantcast.com",
  "chartbeat.com",
  "chartbeat.net",
  "parsely.com",
  "permutive.com",
  "piano.io",
  "tinypass.com",
  "cxense.com",
  "sail-horizon.com",
  "liadm.com",
  "intentiq.com",
  "criteo.com",
  "rtbhouse.com",
  "creativecdn.com",
  "adroll.com",
  "d.adroll.com",
  "perfectaudience.com",
  "steelhousemedia.com",
  "simpli.fi",
  "zemanta.com",
  "bidr.io",
  "beeswax.com",
  "gumgum.com",
  "kargo.com",
  "undertone.com",
  "conversantmedia.com",
  "dotomi.com",
  "emxdgt.com",
  "brealtime.com",
  "districtm.io",
  "sonobi.com",
  "unrulymedia.com",
  "Tremorhub.com".toLowerCase(),
  "telaria.com",
  "freewheel.tv",
  "fwmrm.net",
  "2o7.net",
  "omnitagjs.com",
  "ay.delivery",
  "vidoomy.com",
  "richaudience.com",
  "seedtag.com",
  "missena.io",
  "optad360.io",
  "Clickagy.com".toLowerCase(),
  "pushcrew.com",
  "pushengage.com",
  "izooto.com",
  "subscribers.com",
  "notix.io",
  "rollerads.com",
  "hilltopads.net",
  "clickadu.com",
  "galaksion.com",
  "monetag.com",
];

const AD_BLOCK_SET = new Set(AD_BLOCK_DOMAINS);

const STATIC_ASSET_EXT_RE = /\.(wasm|data|pck|unityweb|mem|swf|woff2|woff|ttf|otf|png|jpg|jpeg|webp|avif|gif|svg|ico|mp3|ogg|wav|m4a|glb|gltf|bin|atlas|fnt)$/i;

const VOLATILE_QUERY_KEYS = new Set([
  "_",
  "t",
  "ts",
  "cb",
  "cachebust",
  "cachebuster",
  "rnd",
  "rand",
  "random",
  "timestamp",
  "nocache",
  "nc",
  "fbclid",
  "gclid",
  "msclkid",
]);

let shieldEnabled = true;
let configLoadPromise = null;

// In-memory LRU byte ledger for ibossbad-scramjet-v1
const lruByteMap = new Map(); // cacheKey -> byteLength
let totalCachedBytes = 0;
let cacheHydratePromise = null;
let assetCacheHits = 0;
let assetCacheMisses = 0;

// 250ms coalesced telemetry batching to avoid main-thread IPC storms
const pendingTelemetry = [];
let telemetryFlushTimer = null;

const telemetryChannel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("ibossbad-sw-channel")
    : null;

function flushTelemetry() {
  telemetryFlushTimer = null;
  if (!pendingTelemetry.length || !telemetryChannel) {
    pendingTelemetry.length = 0;
    return;
  }
  const batch = pendingTelemetry.splice(0, pendingTelemetry.length);
  try {
    telemetryChannel.postMessage({
      type: "request-batch",
      entries: batch,
    });
  } catch (_e) {}
}

function queueRequestTelemetry(entry) {
  if (!telemetryChannel) return;
  pendingTelemetry.push(entry);
  if (pendingTelemetry.length >= 48) {
    if (telemetryFlushTimer) {
      clearTimeout(telemetryFlushTimer);
      telemetryFlushTimer = null;
    }
    flushTelemetry();
    return;
  }
  if (!telemetryFlushTimer) {
    telemetryFlushTimer = setTimeout(flushTelemetry, 250);
  }
}

function ensureScramjetConfig() {
  if (!configLoadPromise) {
    configLoadPromise = scramjet.loadConfig().catch(function (err) {
      configLoadPromise = null;
      throw err;
    });
  }
  return configLoadPromise;
}

async function hydrateAssetCacheLedger() {
  if (typeof caches === "undefined") return;
  if (cacheHydratePromise) return cacheHydratePromise;
  cacheHydratePromise = (async function () {
    try {
      const cache = await caches.open(ASSET_CACHE_NAME);
      const keys = await cache.keys();
      let sum = 0;
      for (let i = 0; i < keys.length; i++) {
        const req = keys[i];
        const res = await cache.match(req);
        if (!res) continue;
        const recorded = Number(
          res.headers.get("x-iboss-bytes") ||
            res.headers.get("content-length") ||
            0
        );
        const sz = recorded > 0 ? recorded : 0;
        lruByteMap.set(req.url, sz);
        sum += sz;
      }
      totalCachedBytes = sum;
    } catch (_e) {}
  })();
  return cacheHydratePromise;
}

function getAssetCacheStats() {
  return {
    entries: lruByteMap.size,
    totalBytes: totalCachedBytes,
    maxBytes: MAX_TOTAL_CACHE_BYTES,
    maxSingleBytes: MAX_SINGLE_ASSET_BYTES,
    hits: assetCacheHits,
    misses: assetCacheMisses,
  };
}

async function clearAssetCache() {
  lruByteMap.clear();
  totalCachedBytes = 0;
  assetCacheHits = 0;
  assetCacheMisses = 0;
  if (typeof caches !== "undefined") {
    try {
      await caches.delete(ASSET_CACHE_NAME);
    } catch (_e) {}
  }
  return getAssetCacheStats();
}

function handleControlMessage(data, replyFn) {
  if (!data || typeof data !== "object") return;
  if (data.type === "shield") {
    shieldEnabled = Boolean(data.enabled);
  } else if (data.type === "reload-config") {
    configLoadPromise = null;
  } else if (data.type === "ping") {
    if (replyFn) replyFn({ type: "pong", ts: Date.now() });
  } else if (data.type === "cache-stats") {
    hydrateAssetCacheLedger().then(function () {
      const payload = {
        type: "cache-stats-result",
        stats: getAssetCacheStats(),
      };
      if (replyFn) replyFn(payload);
      if (telemetryChannel) telemetryChannel.postMessage(payload);
    });
  } else if (data.type === "cache-clear") {
    clearAssetCache().then(function (stats) {
      const payload = {
        type: "cache-stats-result",
        stats: stats,
      };
      if (replyFn) replyFn(payload);
      if (telemetryChannel) telemetryChannel.postMessage(payload);
    });
  }
}

if (telemetryChannel) {
  telemetryChannel.addEventListener("message", function (ev) {
    handleControlMessage(ev.data, function (msg) {
      telemetryChannel.postMessage(msg);
    });
  });
}

self.addEventListener("message", function (ev) {
  handleControlMessage(ev.data, function (msg) {
    if (ev.source && typeof ev.source.postMessage === "function") {
      ev.source.postMessage(msg);
    }
  });
});

function isShellBypassPath(pathname) {
  if (
    pathname === "/" ||
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/emulator-sandbox" ||
    pathname === "/favicon.ico"
  ) {
    return true;
  }
  return (
    pathname.indexOf("/ui/") === 0 ||
    pathname.indexOf("/api/") === 0 ||
    pathname.indexOf("/mgg-games/") === 0 ||
    pathname === "/mgg-games" ||
    pathname.indexOf("/vendor/") === 0 ||
    pathname.indexOf("/scram/") === 0 ||
    pathname.indexOf("/baremux/") === 0 ||
    pathname.indexOf("/libcurl/") === 0 ||
    pathname.indexOf("/epoxy/") === 0
  );
}

function decodeScramjetTarget(requestUrl) {
  try {
    const parsed = new URL(requestUrl);
    const prefix = (scramjet.config && scramjet.config.prefix) || "/scramjet/";
    if (parsed.pathname.indexOf(prefix) !== 0) return null;
    const rawRest = parsed.pathname.slice(prefix.length) + parsed.search;
    const decoded = decodeURIComponent(rawRest);
    if (/^https?:\/\//i.test(decoded)) {
      return decoded;
    }
  } catch (_e) {}
  return null;
}

// O(1) suffix walk across domain labels without allocating arrays
function isBlockedTarget(targetUrl) {
  if (!shieldEnabled || !targetUrl) return false;
  try {
    const h = new URL(targetUrl).hostname.toLowerCase();
    if (!h) return false;
    if (AD_BLOCK_SET.has(h)) return true;
    let dot = h.indexOf(".");
    while (dot !== -1) {
      const suffix = h.slice(dot + 1);
      if (AD_BLOCK_SET.has(suffix)) return true;
      dot = h.indexOf(".", dot + 1);
    }
  } catch (_e) {}
  return false;
}

function normalizeAssetCacheKey(targetUrl) {
  try {
    const u = new URL(targetUrl);
    if (!STATIC_ASSET_EXT_RE.test(u.pathname)) return null;
    const kept = [];
    u.searchParams.forEach(function (val, rawKey) {
      const k = rawKey.toLowerCase();
      if (VOLATILE_QUERY_KEYS.has(k) || k.indexOf("utm_") === 0) {
        return;
      }
      kept.push([rawKey, val]);
    });
    kept.sort(function (a, b) {
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });
    const cleanSearch = kept.length
      ? "?" +
        kept
          .map(function (p) {
            return encodeURIComponent(p[0]) + "=" + encodeURIComponent(p[1]);
          })
          .join("&")
      : "";
    const normalized = u.origin + u.pathname + cleanSearch;
    return "https://iboss-asset.cache/v1/" + encodeURIComponent(normalized);
  } catch (_e) {
    return null;
  }
}

async function storeInAssetCache(cacheKey, respClone) {
  try {
    await hydrateAssetCacheLedger();
    const declaredLen = Number(respClone.headers.get("content-length") || 0);
    if (declaredLen > MAX_SINGLE_ASSET_BYTES) return;

    const buf = await respClone.arrayBuffer();
    const byteLen = buf.byteLength;
    if (byteLen === 0 || byteLen > MAX_SINGLE_ASSET_BYTES) return;

    const cache = await caches.open(ASSET_CACHE_NAME);

    if (lruByteMap.has(cacheKey)) {
      totalCachedBytes -= lruByteMap.get(cacheKey) || 0;
      lruByteMap.delete(cacheKey);
    }

    while (
      totalCachedBytes + byteLen > MAX_TOTAL_CACHE_BYTES &&
      lruByteMap.size > 0
    ) {
      const oldestKey = lruByteMap.keys().next().value;
      if (!oldestKey) break;
      const removedBytes = lruByteMap.get(oldestKey) || 0;
      lruByteMap.delete(oldestKey);
      totalCachedBytes = Math.max(0, totalCachedBytes - removedBytes);
      await cache.delete(oldestKey);
    }

    const headers = new Headers(respClone.headers);
    headers.set("x-iboss-bytes", String(byteLen));
    const storedResponse = new Response(buf, {
      status: respClone.status,
      statusText: respClone.statusText,
      headers: headers,
    });

    await cache.put(cacheKey, storedResponse);
    lruByteMap.set(cacheKey, byteLen);
    totalCachedBytes += byteLen;
  } catch (_e) {}
}

self.addEventListener("install", function (event) {
  self.skipWaiting();
  if (typeof caches !== "undefined") {
    event.waitUntil(
      caches
        .open(CORE_PRECACHE_NAME)
        .then(function (cache) {
          return cache.addAll(CORE_PRECACHE_URLS).catch(function () {});
        })
        .catch(function () {})
    );
  }
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      hydrateAssetCacheLedger().catch(function () {}),
    ])
  );
});

function escapeRecoveryHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSmartRecoveryResponse(targetUrl, rawError) {
  const safeUrl = targetUrl || "";
  const httpsCandidate = /^http:\/\//i.test(safeUrl)
    ? safeUrl.replace(/^http:\/\//i, "https://")
    : "";
  const isYoutube = /(^|\.)(youtube\.com|youtu\.be)$/i.test(
    (function () {
      try {
        return new URL(safeUrl).hostname;
      } catch (_e) {
        return "";
      }
    })()
  );
  const streamFallbackUrl = safeUrl ? "/proxy/" + safeUrl : "/";
  const html =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width,initial-scale=1" />' +
    "<title>Reconnecting via Unblocked Relay...</title>" +
    "<style>" +
    "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 0%,#1e1b4b 0%,#090d16 70%);color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;padding:24px;box-sizing:border-box}" +
    ".card{max-width:520px;width:100%;background:rgba(17,24,39,0.88);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:28px;box-shadow:0 24px 56px rgba(0,0,0,0.55)}" +
    ".badge{display:inline-flex;align-items:center;gap:8px;padding:5px 12px;border-radius:999px;background:rgba(99,102,241,0.2);border:1px solid rgba(129,140,248,0.35);color:#c7d2fe;font-size:12px;font-weight:700;margin-bottom:14px}" +
    "h1{margin:0 0 8px;font-size:21px;font-weight:800;letter-spacing:-0.01em}" +
    "p{margin:0 0 14px;color:#94a3b8;font-size:13.5px;line-height:1.55}" +
    "code{display:block;background:#070b14;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 12px;color:#fca5a5;font-size:12px;word-break:break-all;margin-bottom:18px}" +
    ".actions{display:flex;flex-wrap:wrap;gap:10px}" +
    ".btn{padding:10px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:#1e293b;color:#f8fafc;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px}" +
    ".btn-primary{background:#6366f1;border-color:#818cf8;color:#fff}" +
    ".btn:hover{filter:brightness(1.1)}" +
    "</style></head><body><div class='card'>" +
    "<div class='badge' id='recBadge'>⚡ Auto-Healing WISP Tunnel</div>" +
    "<h1 id='recTitle'>Switching to an unblocked server...</h1>" +
    "<p id='recDesc'>The current relay or upstream host closed the connection without sending headers. Ibossbad is probing unblocked WISP servers automatically.</p>" +
    "<code>" +
    escapeRecoveryHtml(
      (safeUrl ? safeUrl + " — " : "") +
        (rawError || "Upstream connection reset")
    ) +
    "</code>" +
    "<div class='actions'>" +
    "<button class='btn btn-primary' id='btnSwitchRetry' type='button'>⚡ Find Unblocked Server &amp; Retry</button>" +
    "<a class='btn' href='" +
    escapeRecoveryHtml(streamFallbackUrl) +
    "'>🔄 Open via Stream Engine (/proxy/)</a>" +
    (httpsCandidate
      ? "<button class='btn' id='btnHttpsRetry' type='button'>🔒 Retry with HTTPS</button>"
      : "") +
    (isYoutube
      ? "<button class='btn' id='btnYtMedia' type='button'>🎬 Ad-Free YouTube Hub</button>"
      : "") +
    "</div></div><script>" +
    "(function(){" +
    "var target=" +
    JSON.stringify(safeUrl) +
    ";" +
    "var httpsUrl=" +
    JSON.stringify(httpsCandidate) +
    ";" +
    "var key='iboss_autoretry_'+(target||'page');" +
    "function triggerFailover(nextUrl){" +
    "try{if(window.parent&&window.parent!==window){window.parent.postMessage({type:'iboss:failover-retry',url:nextUrl||target},'*');}}catch(e){}" +
    "setTimeout(function(){location.reload();},1200);" +
    "}" +
    "document.getElementById('btnSwitchRetry').onclick=function(){triggerFailover(target);};" +
    "var hb=document.getElementById('btnHttpsRetry');" +
    "if(hb){hb.onclick=function(){if(window.parent&&window.parent!==window){window.parent.postMessage({type:'iboss:navigate-active',url:httpsUrl},'*');}else{location.href='/proxy/'+httpsUrl;}};}" +
    "var yb=document.getElementById('btnYtMedia');" +
    "if(yb){yb.onclick=function(){if(window.parent&&window.parent!==window){window.parent.postMessage({type:'iboss:navigate-active',url:'iboss://media'},'*');}};}" +
    "try{" +
    "if(!sessionStorage.getItem(key)){" +
    "sessionStorage.setItem(key,'1');" +
    "if(httpsUrl&&window.parent&&window.parent!==window){" +
    "window.parent.postMessage({type:'iboss:failover-retry',url:httpsUrl},'*');" +
    "}else{" +
    "triggerFailover(target);" +
    "}" +
    "}else{" +
    "sessionStorage.removeItem(key);" +
    "document.getElementById('recBadge').textContent='⚠️ Connection Interrupted';" +
    "document.getElementById('recTitle').textContent='Target host or relay unreachable';" +
    "document.getElementById('recDesc').textContent='Try switching to another unblocked WISP server below, or open this page via the direct Server Stream (/proxy/) engine.';" +
    "}" +
    "}catch(e){}" +
    "})();" +
    "</script></body></html>";

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function isNavigationFetch(req) {
  if (!req) return false;
  if (req.mode === "navigate") return true;
  const dest = req.destination || "";
  if (dest === "document" || dest === "iframe") return true;
  const accept =
    req.headers && typeof req.headers.get === "function"
      ? req.headers.get("accept") || ""
      : "";
  return accept.indexOf("text/html") !== -1 && (req.method || "GET") === "GET";
}

async function handleScramjetFetch(event) {
  try {
    await ensureScramjetConfig();
    if (!scramjet.route(event)) {
      return await fetch(event.request);
    }

    const targetUrl = decodeScramjetTarget(event.request.url);

    // Auto-heal legacy MonkeyGG2 & broken pijgalk.desarrollos-lowcost.com CNAME redirects
    if (targetUrl) {
      const mggMatch = targetUrl.match(
        /^https?:\/\/(?:monkeygg2\.github\.io|pijgalk\.desarrollos-lowcost\.com)\/games\/(.*)$/i
      );
      if (mggMatch) {
        return Response.redirect(
          self.location.origin + "/mgg-games/" + mggMatch[1],
          302
        );
      }
    }

    if (targetUrl && isBlockedTarget(targetUrl)) {
      if (telemetryChannel) {
        telemetryChannel.postMessage({ type: "blocked", url: targetUrl });
      }
      if (event.request && event.request.destination === "script") {
        return new Response("/* blocked by ibossbad shield */", {
          status: 200,
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
      return new Response("", {
        status: 204,
        statusText: "Blocked by Shield",
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // Never intercept or cache Byte-Range requests (protects .mp3/.ogg/.mp4 seeking)
    const isGetWithoutRange =
      (event.request.method || "GET") === "GET" &&
      (!event.request.headers || !event.request.headers.has("range"));
    const assetCacheKey =
      isGetWithoutRange && targetUrl && typeof caches !== "undefined"
        ? normalizeAssetCacheKey(targetUrl)
        : null;

    if (assetCacheKey) {
      try {
        const cache = await caches.open(ASSET_CACHE_NAME);
        const cachedResp = await cache.match(assetCacheKey);
        if (cachedResp) {
          assetCacheHits++;
          if (lruByteMap.has(assetCacheKey)) {
            const sz = lruByteMap.get(assetCacheKey);
            lruByteMap.delete(assetCacheKey);
            lruByteMap.set(assetCacheKey, sz);
          }
          queueRequestTelemetry({
            method: "GET",
            url: targetUrl,
            status: cachedResp.status || 200,
            bytes: Number(cachedResp.headers.get("x-iboss-bytes") || 0),
            ms: 1,
            cached: true,
          });
          return cachedResp;
        }
        assetCacheMisses++;
      } catch (_e) {}
    }

    const t0 = Date.now();
    const resp = await scramjet.fetch(event);

    // Intercept Scramjet's raw 500 "Uh oh! Request failed with error code 52" page on document navigations
    if (
      resp &&
      resp.status >= 500 &&
      isNavigationFetch(event.request) &&
      targetUrl
    ) {
      let errSnippet = "HTTP " + resp.status;
      try {
        const peekText = await resp.clone().text();
        if (
          peekText.indexOf("There was an error loading") !== -1 ||
          peekText.indexOf("Request failed with error code") !== -1
        ) {
          const msgMatch = peekText.match(/Message:\s*([^\n<]+)/i);
          errSnippet = msgMatch ? msgMatch[1].trim() : "Relay transport error";
          if (telemetryChannel) {
            telemetryChannel.postMessage({
              type: "scramjet-nav-error",
              url: targetUrl,
              error: errSnippet,
            });
          }
          return buildSmartRecoveryResponse(targetUrl, errSnippet);
        }
      } catch (_e2) {}
    }

    if (
      assetCacheKey &&
      resp &&
      resp.status === 200 &&
      !resp.headers.has("content-range") &&
      !/\b(no-store|private)\b/i.test(resp.headers.get("cache-control") || "")
    ) {
      try {
        const cloned = resp.clone();
        event.waitUntil(storeInAssetCache(assetCacheKey, cloned));
      } catch (_e) {}
    }

    if (targetUrl) {
      queueRequestTelemetry({
        method: event.request.method || "GET",
        url: targetUrl,
        status: (resp && resp.status) || 200,
        bytes: Number(
          (resp && resp.headers && resp.headers.get("content-length")) || 0
        ),
        ms: Math.max(1, Date.now() - t0),
        cached: false,
      });
    }
    return resp;
  } catch (err) {
    const failedUrl = decodeScramjetTarget(
      (event.request && event.request.url) || ""
    );
    const errMsg =
      (err && err.message) || String(err || "Scramjet fetch error");
    if (telemetryChannel && failedUrl) {
      try {
        telemetryChannel.postMessage({
          type: "scramjet-nav-error",
          url: failedUrl,
          error: errMsg,
        });
      } catch (_e) {}
    }
    if (isNavigationFetch(event.request)) {
      return buildSmartRecoveryResponse(failedUrl, errMsg);
    }
    return new Response("", {
      status: 502,
      statusText: "Upstream Proxy Fetch Error",
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}

self.addEventListener("fetch", function (event) {
  try {
    const reqUrl = new URL(event.request.url);
    if (
      reqUrl.origin === self.location.origin &&
      isShellBypassPath(reqUrl.pathname)
    ) {
      return;
    }
  } catch (_e) {}
  event.respondWith(handleScramjetFetch(event));
});
