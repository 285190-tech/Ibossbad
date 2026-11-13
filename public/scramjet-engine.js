"use strict";

(function (window) {
  var FAST_RELAY_SESSION_KEY = "ibossbad.fastRelay.v2";
  var FAST_RELAY_TTL_MS = 10 * 60 * 1000; // 10 minutes
  var PREWARM_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes per origin
  var SW_KEEPALIVE_INTERVAL_MS = 25000; // 25s (< Chrome's 30s idle SW kill timer)

  // Universal WISP v1 relays first (work natively with both libcurl & epoxy),
  // followed by Opium stealth WISP v2 domains (automatically routed via epoxy).
  var DEFAULT_PUBLIC_RELAYS = [
    { url: "wss://wisp.mercurywork.shop/", label: "MercuryWorkshop" },
    { url: "wss://anura.pro/", label: "Anura" },
    { url: "wss://definitelyscience.com/wisp/", label: "DefinitelyScience" },
    { url: "wss://wisp.rhw.one/", label: "RHW" },
    { url: "wss://nebulaproxy.io/wisp/", label: "Nebula" },
    { url: "wss://wisp.terbiumon.top/wisp/", label: "Terbium" },
    { url: "wss://pgis-wisp.joytree.site/", label: "PGIS" },
    { url: "wss://mages.io/wisp/", label: "Mages" },
    { url: "wss://lichology.com/wisp/", label: "Lichology" },
    { url: "wss://cdn.northstreetumc.org/", label: "NorthStreet", v2: true },
    { url: "wss://cdn.vipersfutbol.com/", label: "Vipers", v2: true },
    { url: "wss://cdn.pcesc.org/", label: "PCESC", v2: true },
    { url: "wss://cdn.kcchallengevbc.com/", label: "KCChallenge", v2: true },
    { url: "wss://cdn.slcbmooc.org/", label: "SLCB", v2: true },
    { url: "wss://cdn.topstargym.net/", label: "TopStar", v2: true },
    { url: "wss://cdn.goaplytexas.org/", label: "ApplyTexas", v2: true },
    { url: "wss://cdn.clearfieldswimming.com/", label: "Clearfield", v2: true },
    {
      url: "wss://cdn.richardacademy.cfd/",
      label: "RichardAcademy",
      v2: true,
    },
    { url: "wss://athollcottage.com/connection/", label: "Atholl", v2: true },
    { url: "wss://kidsprepnest.org/vi/", label: "KidsPrep", v2: true },
  ];

  function normalizeWispEndpoint(rawUrl) {
    var s = String(rawUrl || "").trim();
    if (!s) return "";
    if (!/^[a-z]+:\/\//i.test(s)) {
      s = "wss://" + s;
    }
    s = s.replace(/^http:\/\//i, "ws://").replace(/^https:\/\//i, "wss://");
    try {
      var u = new URL(s);
      if (!u.pathname || u.pathname.slice(-1) !== "/") {
        u.pathname = (u.pathname || "") + "/";
      }
      return u.toString();
    } catch (_e) {
      return s.slice(-1) === "/" ? s : s + "/";
    }
  }

  function resolveRelayProtocol(wispUrl, hint) {
    if (hint === "WISP v2" || hint === "WISP v1") return hint;
    if (
      window.IbossServerFinder &&
      typeof window.IbossServerFinder.getServerProtocol === "function"
    ) {
      return window.IbossServerFinder.getServerProtocol(wispUrl);
    }
    var norm = normalizeWispEndpoint(wispUrl);
    for (var i = 0; i < DEFAULT_PUBLIC_RELAYS.length; i++) {
      if (
        normalizeWispEndpoint(DEFAULT_PUBLIC_RELAYS[i].url) === norm &&
        DEFAULT_PUBLIC_RELAYS[i].v2
      ) {
        return "WISP v2";
      }
    }
    return "WISP v1";
  }

  function getSelfWispUrl() {
    var proto = window.location.protocol === "https:" ? "wss://" : "ws://";
    return proto + window.location.host + "/wisp/";
  }

  function loadCachedRelay() {
    try {
      var raw = window.sessionStorage.getItem(FAST_RELAY_SESSION_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (
        !parsed ||
        !parsed.url ||
        typeof parsed.ts !== "number" ||
        Date.now() - parsed.ts > FAST_RELAY_TTL_MS
      ) {
        return null;
      }
      return parsed;
    } catch (_e) {
      return null;
    }
  }

  function saveCachedRelay(url, label, latency) {
    try {
      window.sessionStorage.setItem(
        FAST_RELAY_SESSION_KEY,
        JSON.stringify({
          url: url,
          label: label,
          latency: latency || null,
          ts: Date.now(),
        })
      );
    } catch (_e) {}
  }

  function clearCachedRelay() {
    try {
      window.sessionStorage.removeItem(FAST_RELAY_SESSION_KEY);
    } catch (_e) {}
  }

  function probeWsLatency(wsUrl, timeoutMs) {
    if (
      window.IbossServerFinder &&
      typeof window.IbossServerFinder.probeWispHandshake === "function"
    ) {
      return window.IbossServerFinder.probeWispHandshake(
        wsUrl,
        timeoutMs || 2800
      ).then(function (res) {
        return res && res.ok ? res.latencyMs : null;
      });
    }
    return new Promise(function (resolve) {
      var t0 = performance.now();
      var done = false;
      var ws;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        try {
          if (ws) ws.close();
        } catch (_e) {}
        resolve(null);
      }, timeoutMs || 2800);

      try {
        ws = new window.WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        ws.onopen = function () {
          if (done) return;
          done = true;
          clearTimeout(timer);
          var ms = Math.max(1, Math.round(performance.now() - t0));
          try {
            ws.close();
          } catch (_e) {}
          resolve(ms);
        };
        ws.onerror = function () {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(null);
        };
      } catch (_e2) {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  function selectFastestPoolRelay(excludeUrl) {
    var normExclude = normalizeWispEndpoint(excludeUrl);
    var v1Candidates = DEFAULT_PUBLIC_RELAYS.filter(function (r) {
      return !r.v2 && normalizeWispEndpoint(r.url) !== normExclude;
    });
    var v2Candidates = DEFAULT_PUBLIC_RELAYS.filter(function (r) {
      return r.v2 && normalizeWispEndpoint(r.url) !== normExclude;
    });

    function raceGroup(group) {
      return new Promise(function (resolve) {
        var settled = false;
        var remaining = group.length;
        if (!remaining) {
          resolve(null);
          return;
        }
        group.forEach(function (cand) {
          probeWsLatency(cand.url, 2800).then(function (ms) {
            remaining--;
            if (!settled && ms !== null) {
              settled = true;
              resolve({
                url: cand.url,
                label: cand.label,
                latency: ms,
                protocol: cand.v2 ? "WISP v2" : "WISP v1",
              });
            } else if (!settled && remaining === 0) {
              resolve(null);
            }
          });
        });
      });
    }

    return raceGroup(v1Candidates).then(function (v1Winner) {
      if (v1Winner) return v1Winner;
      return raceGroup(v2Candidates);
    });
  }

  function createScramjetEngine(callbacks) {
    var cb = callbacks || {};
    var controller = null;
    var bareConnection = null;
    var bareClient = null;
    var initPromise = null;
    var transportReadyPromise = null;
    var activeWispUrl = null;
    var activeWispLabel = "Initializing";
    var activeWispLatency = null;
    var customWispUrl = "";
    var allowPoolFailover = true;
    var bareTransportName = "libcurl"; // "libcurl" or "epoxy"
    var shieldEnabled = true;
    var blockedCount = 0;
    var selfTunnelVerified = null; // null = unknown, true = internet ok, false = restricted
    var libcurlVersionHash = "6";
    var epoxyVersionHash = "6";
    var tabFrames = new Map(); // tabId -> ScramjetFrame
    var tabThrottledMap = new Map(); // tabId -> boolean
    var prewarmedOrigins = new Map(); // origin -> timestamp
    var prewarmInFlight = false;
    var keepAliveTimer = null;
    var cacheStatsResolvers = [];

    var swChannel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("ibossbad-sw-channel")
        : null;

    function forwardRequestEntry(d) {
      if (!d || typeof cb.onRequestLog !== "function") return;
      cb.onRequestLog({
        method: d.method || "GET",
        url: d.url,
        status: d.status || 200,
        bytes: d.bytes || 0,
        ms: d.ms || 1,
        relay: d.cached
          ? "SW Cache · Instant"
          : "Scramjet · " + activeWispLabel,
      });
    }

    if (swChannel) {
      swChannel.addEventListener("message", function (ev) {
        var d = ev.data;
        if (!d) return;
        if (d.type === "blocked") {
          blockedCount++;
          emitStatus();
        } else if (d.type === "request") {
          forwardRequestEntry(d);
        } else if (d.type === "request-batch" && Array.isArray(d.entries)) {
          for (var i = 0; i < d.entries.length; i++) {
            forwardRequestEntry(d.entries[i]);
          }
        } else if (d.type === "cache-stats-result" && d.stats) {
          var pending = cacheStatsResolvers.splice(
            0,
            cacheStatsResolvers.length
          );
          for (var j = 0; j < pending.length; j++) {
            pending[j](d.stats);
          }
        }
      });
    }

    function sendSwKeepAlivePing() {
      if (
        typeof document !== "undefined" &&
        document.visibilityState &&
        document.visibilityState !== "visible"
      ) {
        return;
      }
      if (swChannel) {
        try {
          swChannel.postMessage({ type: "ping" });
          return;
        } catch (_e) {}
      }
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        try {
          navigator.serviceWorker.controller.postMessage({ type: "ping" });
        } catch (_e2) {}
      }
    }

    function ensureSwKeepAliveStarted() {
      if (keepAliveTimer) return;
      keepAliveTimer = setInterval(
        sendSwKeepAlivePing,
        SW_KEEPALIVE_INTERVAL_MS
      );
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") {
            sendSwKeepAlivePing();
          }
        });
      }
    }

    function emitStatus() {
      if (typeof cb.onStatus === "function") {
        cb.onStatus({
          wispUrl: activeWispUrl,
          label: activeWispLabel,
          latency: activeWispLatency,
          blockedCount: blockedCount,
          transport: bareTransportName,
        });
      }
    }

    function isSupported() {
      var swAllowedHost =
        window.location.protocol === "https:" ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      return Boolean(
        swAllowedHost &&
          navigator.serviceWorker &&
          typeof $scramjetLoadController === "function" &&
          typeof BareMux !== "undefined"
      );
    }

    async function registerAndClaimServiceWorker() {
      if (!navigator.serviceWorker) {
        throw new Error(
          "Service Workers are disabled in this browser context."
        );
      }
      var reg = await navigator.serviceWorker.register("/sw.js?v=10", {
        scope: "/",
        updateViaCache: "none",
      });
      if (reg && typeof reg.update === "function") {
        reg.update().catch(function () {});
      }
      await navigator.serviceWorker.ready;

      if (!navigator.serviceWorker.controller) {
        await new Promise(function (resolve) {
          var timer = setTimeout(resolve, 2000);
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            function () {
              clearTimeout(timer);
              resolve();
            },
            { once: true }
          );
        });
      }

      if (swChannel) {
        swChannel.postMessage({ type: "shield", enabled: shieldEnabled });
      }
      ensureSwKeepAliveStarted();
    }

    async function ensureInitialized() {
      if (initPromise) return initPromise;
      initPromise = (async function () {
        if (!isSupported()) {
          throw new Error("Scramjet Service Worker unavailable");
        }
        var loaded = $scramjetLoadController();
        controller = new loaded.ScramjetController({
          prefix: "/scramjet/",
          files: {
            wasm: "/scram/scramjet.wasm.wasm",
            all: "/scram/scramjet.all.js",
            sync: "/scram/scramjet.sync.js",
          },
          flags: {
            rewriterLogs: false,
            scramitize: false,
            cleanErrors: true,
            allowInvalidJs: true,
            allowFailedIntercepts: true,
          },
        });

        // Intercept proxied file downloads cleanly
        controller.addEventListener("download", function (ev) {
          try {
            var dl = ev.download;
            if (!dl || !dl.body) return;
            new Response(dl.body)
              .blob()
              .then(function (blob) {
                var a = document.createElement("a");
                var bUrl = URL.createObjectURL(blob);
                a.href = bUrl;
                a.download = dl.filename || "download";
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(function () {
                  URL.revokeObjectURL(bUrl);
                }, 15000);
              })
              .catch(function () {});
          } catch (_e) {}
        });

        // Boot Scramjet IndexedDB controller & Service Worker registration in parallel
        await Promise.all([controller.init(), registerAndClaimServiceWorker()]);

        bareConnection = new BareMux.BareMuxConnection("/baremux/worker.js");
        bareClient = new BareMux.BareClient();

        // Re-sync Scramjet RPC port if Chrome respawns an idle Service Worker
        // (BareMux runs in a SharedWorker and does not need re-binding on SW claim)
        if (navigator.serviceWorker) {
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            function () {
              try {
                if (controller && navigator.serviceWorker.controller) {
                  controller.serviceWorkerController =
                    navigator.serviceWorker.controller;
                  if (typeof controller.setupMessagePort === "function") {
                    controller.setupMessagePort();
                  }
                }
              } catch (_e) {}
            }
          );
        }
      })().catch(function (err) {
        initPromise = null;
        throw err;
      });
      return initPromise;
    }

    async function setBareMuxWisp(wispUrl, label, latency, protocolHint) {
      var normUrl = normalizeWispEndpoint(wispUrl);
      if (!normUrl) return;
      var proto = resolveRelayProtocol(normUrl, protocolHint);
      // libcurl.js@0.7.4 speaks WISP v1 only; epoxy-transport speaks both WISP v1 and WISP v2.
      // Automatically route WISP v2 servers via epoxy so stealth WISP v2 relays work seamlessly.
      var useEpoxy = bareTransportName === "epoxy" || proto === "WISP v2";
      var modPath = useEpoxy
        ? "/epoxy/index.mjs?v=" + encodeURIComponent(epoxyVersionHash)
        : "/libcurl/index.mjs?v=" + encodeURIComponent(libcurlVersionHash);
      var modOpts = useEpoxy
        ? [{ wisp: normUrl, wisp_v2: proto === "WISP v2" }]
        : [{ websocket: normUrl, connections: [64, 6, 32] }];

      await bareConnection.setTransport(modPath, modOpts);
      activeWispUrl = normUrl;
      activeWispLabel = label || normUrl;
      activeWispLatency = latency || null;
      saveCachedRelay(normUrl, activeWispLabel, activeWispLatency);
      emitStatus();
    }

    async function ensureTransportReady() {
      if (activeWispUrl && initPromise) {
        await initPromise;
        return;
      }
      if (transportReadyPromise) return transportReadyPromise;

      transportReadyPromise = (async function () {
        if (customWispUrl) {
          var customBoot = await Promise.all([
            ensureInitialized(),
            probeWsLatency(customWispUrl, 2500),
          ]);
          await setBareMuxWisp(customWispUrl, "Custom WISP", customBoot[1]);
          return;
        }

        // Instant zero-probe path if this browser session already verified a relay
        var cachedRelay = loadCachedRelay();
        if (cachedRelay && cachedRelay.url) {
          await ensureInitialized();
          await setBareMuxWisp(
            cachedRelay.url,
            cachedRelay.label,
            cachedRelay.latency
          );
          return;
        }

        var selfUrl = getSelfWispUrl();

        // Bind to Self-Hosted (/wisp/) first whenever backend has outbound internet (e.g. Render / VPS).
        // Do NOT run unsolicited background relay swaps that tear down active page loads!
        if (selfTunnelVerified !== false) {
          var parallelSelf = await Promise.all([
            ensureInitialized(),
            probeWsLatency(selfUrl, 2000),
          ]);
          var selfMs = parallelSelf[1];
          if (selfMs !== null) {
            selfTunnelVerified = true;
            await setBareMuxWisp(
              selfUrl,
              "Self-Hosted (/wisp/)",
              selfMs,
              "WISP v1"
            );
            return;
          }
          selfTunnelVerified = false;
        } else {
          await ensureInitialized();
        }

        if (allowPoolFailover) {
          var best = await selectFastestPoolRelay(selfUrl);
          if (best) {
            await setBareMuxWisp(
              best.url,
              "Pool · " + best.label,
              best.latency,
              best.protocol
            );
            return;
          }
        }

        await setBareMuxWisp(selfUrl, "Self-Hosted (/wisp/)", null, "WISP v1");
      })().finally(function () {
        transportReadyPromise = null;
      });

      return transportReadyPromise;
    }

    function installBackgroundFrameThrottle(tabId, win) {
      if (!win || win.__ibossRafThrottleInstalled) return;
      win.__ibossRafThrottleInstalled = true;
      var origRaf =
        typeof win.requestAnimationFrame === "function"
          ? win.requestAnimationFrame.bind(win)
          : null;
      var origCaf =
        typeof win.cancelAnimationFrame === "function"
          ? win.cancelAnimationFrame.bind(win)
          : null;
      var origSetTimeout =
        typeof win.setTimeout === "function"
          ? win.setTimeout.bind(win)
          : setTimeout;
      var origClearTimeout =
        typeof win.clearTimeout === "function"
          ? win.clearTimeout.bind(win)
          : clearTimeout;
      if (!origRaf) return;

      var throttledIds = new Map();
      var nextSyntheticId = 9000000;

      win.requestAnimationFrame = function (callback) {
        if (!tabThrottledMap.get(tabId)) {
          return origRaf(callback);
        }
        // Throttle hidden background games from 60fps -> 1fps to save Chromebook CPU/GPU
        var sid = ++nextSyntheticId;
        var handle = origSetTimeout(function () {
          throttledIds.delete(sid);
          try {
            var ts =
              win.performance && typeof win.performance.now === "function"
                ? win.performance.now()
                : Date.now();
            callback(ts);
          } catch (_e) {}
        }, 1000);
        throttledIds.set(sid, handle);
        return sid;
      };

      win.cancelAnimationFrame = function (id) {
        if (throttledIds.has(id)) {
          origClearTimeout(throttledIds.get(id));
          throttledIds.delete(id);
          return;
        }
        if (origCaf) origCaf(id);
      };
    }

    function ensureFrameForTab(tabId, iframeEl) {
      var existing = tabFrames.get(tabId);
      if (existing && existing.frame === iframeEl) {
        return existing;
      }

      var sjFrame = controller.createFrame(iframeEl);

      sjFrame.addEventListener("urlchange", function (ev) {
        if (ev && ev.url && typeof cb.onPageUpdate === "function") {
          var title = "";
          try {
            title =
              (iframeEl.contentDocument && iframeEl.contentDocument.title) ||
              "";
          } catch (_e) {}
          cb.onPageUpdate(tabId, String(ev.url), title);
        }
      });

      sjFrame.addEventListener("navigate", function (ev) {
        if (ev && ev.url && typeof cb.onPageUpdate === "function") {
          cb.onPageUpdate(tabId, String(ev.url), "");
        }
      });

      sjFrame.addEventListener("contextInit", function (ev) {
        var win = ev && ev.window;
        if (!win) return;

        installBackgroundFrameThrottle(tabId, win);

        // WebRTC privacy shield inside Scramjet frame
        if (shieldEnabled) {
          [
            "RTCPeerConnection",
            "webkitRTCPeerConnection",
            "mozRTCPeerConnection",
          ].forEach(function (k) {
            try {
              if (k in win) {
                win[k] = function () {
                  throw new DOMException(
                    "WebRTC disabled by Ibossbad privacy shield",
                    "NotSupportedError"
                  );
                };
              }
            } catch (_e) {}
          });
        }

        // Forward Boss / Panic hotkey from inside Scramjet iframe
        try {
          win.addEventListener("keydown", function (kev) {
            var tag =
              kev.target && kev.target.tagName
                ? kev.target.tagName.toLowerCase()
                : "";
            var editable =
              tag === "input" ||
              tag === "textarea" ||
              (kev.target && kev.target.isContentEditable);
            if (editable && kev.key !== "Escape") return;
            if (typeof cb.onSubframeKeydown === "function") {
              cb.onSubframeKeydown(kev.key, kev.code);
            }
          });
        } catch (_e) {}

        // Sync live document.title changes to browser tab
        try {
          win.addEventListener("DOMContentLoaded", function () {
            if (
              win.document &&
              win.document.title &&
              typeof cb.onPageUpdate === "function"
            ) {
              cb.onPageUpdate(tabId, "", win.document.title);
            }
          });
        } catch (_e) {}
      });

      tabFrames.set(tabId, sjFrame);
      return sjFrame;
    }

    async function navigateTabFrame(tabId, iframeEl, targetUrl, onStage) {
      if (onStage) onStage("Starting Scramjet Service Worker...");
      await ensureTransportReady();
      if (onStage) onStage("Tunneling via Scramjet + WISP...");
      var sjFrame = ensureFrameForTab(tabId, iframeEl);
      sjFrame.go(targetUrl);
      return sjFrame;
    }

    async function prewarmOrigin(targetUrl) {
      if (!targetUrl || prewarmInFlight) return false;
      var origin;
      try {
        var parsed = new URL(targetUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return false;
        }
        origin = parsed.origin;
      } catch (_e) {
        return false;
      }

      var now = Date.now();
      var lastWarm = prewarmedOrigins.get(origin) || 0;
      if (now - lastWarm < PREWARM_COOLDOWN_MS) {
        return false;
      }
      if (prewarmedOrigins.size >= 128) {
        var firstKey = prewarmedOrigins.keys().next().value;
        if (firstKey) prewarmedOrigins.delete(firstKey);
      }
      prewarmedOrigins.set(origin, now);

      prewarmInFlight = true;
      try {
        await ensureTransportReady();
        if (!bareClient) return false;
        await Promise.race([
          bareClient.fetch(origin + "/favicon.ico", { method: "HEAD" }),
          new Promise(function (resolve) {
            setTimeout(resolve, 2200);
          }),
        ]);
        return true;
      } catch (_err) {
        return false;
      } finally {
        prewarmInFlight = false;
      }
    }

    function getCacheStats() {
      return new Promise(function (resolve) {
        if (!swChannel) {
          resolve(null);
          return;
        }
        var done = false;
        var timer = setTimeout(function () {
          if (done) return;
          done = true;
          resolve(null);
        }, 1500);
        cacheStatsResolvers.push(function (stats) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(stats);
        });
        swChannel.postMessage({ type: "cache-stats" });
      });
    }

    function clearAssetCache() {
      return new Promise(function (resolve) {
        if (!swChannel) {
          resolve(null);
          return;
        }
        var done = false;
        var timer = setTimeout(function () {
          if (done) return;
          done = true;
          resolve(null);
        }, 2000);
        cacheStatsResolvers.push(function (stats) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(stats);
        });
        swChannel.postMessage({ type: "cache-clear" });
      });
    }

    return {
      isSupported: isSupported,
      ensureReady: ensureTransportReady,
      navigateTabFrame: navigateTabFrame,
      prewarmOrigin: prewarmOrigin,
      getCacheStats: getCacheStats,
      clearAssetCache: clearAssetCache,
      setServerSpeedHints: function (hints) {
        if (!hints || typeof hints !== "object") return;
        if (hints.libcurlHash) libcurlVersionHash = String(hints.libcurlHash);
        if (hints.epoxyHash) epoxyVersionHash = String(hints.epoxyHash);
        if (typeof hints.wispInternetReady === "boolean") {
          selfTunnelVerified = hints.wispInternetReady;
          if (hints.wispInternetReady === false) {
            var cached = loadCachedRelay();
            if (cached && cached.url === getSelfWispUrl()) {
              clearCachedRelay();
            }
          }
        }
      },
      setTabBackgroundThrottled: function (tabId, throttled) {
        if (!tabId) return;
        tabThrottledMap.set(tabId, Boolean(throttled));
      },
      getTabFrame: function (tabId) {
        return tabFrames.get(tabId) || null;
      },
      destroyTabFrame: function (tabId) {
        tabFrames.delete(tabId);
        tabThrottledMap.delete(tabId);
      },
      encodeUrl: function (targetUrl) {
        if (!controller) {
          return "/scramjet/" + encodeURIComponent(targetUrl);
        }
        return controller.encodeUrl(targetUrl);
      },
      configure: function (cfg) {
        if (!cfg) return;
        var needRebind = false;
        if (cfg.customWispUrl !== undefined) {
          var nextCustom = cfg.customWispUrl
            ? normalizeWispEndpoint(cfg.customWispUrl)
            : "";
          if (nextCustom !== customWispUrl) {
            customWispUrl = nextCustom;
            clearCachedRelay();
            needRebind = true;
          }
        }
        if (cfg.allowPoolFailover !== undefined) {
          if (Boolean(cfg.allowPoolFailover) !== allowPoolFailover) {
            allowPoolFailover = Boolean(cfg.allowPoolFailover);
            if (!customWispUrl) {
              clearCachedRelay();
              needRebind = true;
            }
          }
        }
        if (cfg.bareTransport && cfg.bareTransport !== bareTransportName) {
          bareTransportName = cfg.bareTransport;
          needRebind = true;
        }
        if (cfg.shieldEnabled !== undefined) {
          shieldEnabled = Boolean(cfg.shieldEnabled);
          if (swChannel) {
            swChannel.postMessage({ type: "shield", enabled: shieldEnabled });
          }
        }
        if (needRebind && bareConnection) {
          activeWispUrl = null;
          ensureTransportReady().catch(function () {});
        } else {
          emitStatus();
        }
      },
      getActiveWispUrl: function () {
        return activeWispUrl;
      },
      setDirectWispServer: async function (wispUrl, label, latency) {
        await ensureInitialized();
        var norm = normalizeWispEndpoint(wispUrl);
        customWispUrl = norm;
        allowPoolFailover = false;
        await setBareMuxWisp(norm, label || norm, latency || null);
      },
      reconnect: async function () {
        clearCachedRelay();
        activeWispUrl = null;
        selfTunnelVerified = null;
        await ensureTransportReady();
      },
      failoverRelay: (function () {
        var failoverInFlight = null;
        var lastFailoverAt = 0;
        return async function (forceAllow) {
          if (!forceAllow && !allowPoolFailover) return null;
          var now = Date.now();
          if (failoverInFlight) return failoverInFlight;
          if (!forceAllow && now - lastFailoverAt < 5000) return null;
          failoverInFlight = (async function () {
            try {
              lastFailoverAt = Date.now();
              await ensureInitialized();
              clearCachedRelay();
              var next = null;
              if (
                window.IbossServerFinder &&
                typeof window.IbossServerFinder.findBestUnblockedServer ===
                  "function"
              ) {
                var found = await window.IbossServerFinder.findBestUnblockedServer(
                  {
                    excludeUrl: activeWispUrl,
                    forceFullScan: Boolean(forceAllow),
                  }
                );
                if (found) {
                  next = {
                    url: found.url,
                    label: found.label,
                    latency: found.latencyMs,
                    protocol: found.protocol,
                  };
                }
              }
              if (!next) {
                next = await selectFastestPoolRelay(activeWispUrl);
              }
              if (next) {
                await setBareMuxWisp(
                  next.url,
                  "Pool · " + next.label,
                  next.latency,
                  next.protocol
                );
                return next;
              }
              return null;
            } finally {
              failoverInFlight = null;
            }
          })();
          return failoverInFlight;
        };
      })(),
    };
  }

  window.IbossScramjetEngine = {
    create: createScramjetEngine,
  };
})(window);
