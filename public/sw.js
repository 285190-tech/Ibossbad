"use strict";

importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const AD_BLOCK_DOMAINS = [
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "google-analytics.com",
  "googletagmanager.com",
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
  "propellerads.com",
];

let shieldEnabled = true;
const telemetryChannel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("ibossbad-sw-channel")
    : null;

if (telemetryChannel) {
  telemetryChannel.addEventListener("message", function (ev) {
    if (ev.data && ev.data.type === "shield") {
      shieldEnabled = Boolean(ev.data.enabled);
    }
  });
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

function isBlockedTarget(targetUrl) {
  if (!shieldEnabled || !targetUrl) return false;
  try {
    const h = new URL(targetUrl).hostname.toLowerCase();
    for (let i = 0; i < AD_BLOCK_DOMAINS.length; i++) {
      const d = AD_BLOCK_DOMAINS[i];
      if (h === d || h.endsWith("." + d)) {
        return true;
      }
    }
  } catch (_e) {}
  return false;
}

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

async function handleScramjetFetch(event) {
  await scramjet.loadConfig();
  if (!scramjet.route(event)) {
    return fetch(event.request);
  }

  const targetUrl = decodeScramjetTarget(event.request.url);
  if (targetUrl && isBlockedTarget(targetUrl)) {
    if (telemetryChannel) {
      telemetryChannel.postMessage({ type: "blocked", url: targetUrl });
    }
    return new Response("", { status: 204, statusText: "Blocked by Shield" });
  }

  const t0 = Date.now();
  const resp = await scramjet.fetch(event);
  if (telemetryChannel && targetUrl) {
    telemetryChannel.postMessage({
      type: "request",
      method: event.request.method || "GET",
      url: targetUrl,
      status: (resp && resp.status) || 200,
      bytes: Number(
        (resp && resp.headers && resp.headers.get("content-length")) || 0
      ),
      ms: Math.max(1, Date.now() - t0),
    });
  }
  return resp;
}

self.addEventListener("fetch", function (event) {
  event.respondWith(handleScramjetFetch(event));
});
