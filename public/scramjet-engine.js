"use strict";

(function (window) {
  var FAST_RELAY_SESSION_KEY = "ibossbad.fastRelay.v1";
  var FAST_RELAY_TTL_MS = 10 * 60 * 1000; // 10 minutes
  var PREWARM_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes per origin
  var SW_KEEPALIVE_INTERVAL_MS = 25000; // 25s (< Chrome's 30s idle SW kill timer)

  var DEFAULT_PUBLIC_RELAYS = [
    { url: "wss://definitelyscience.com/wisp/", label: "DefinitelyScience" },
    { url: "wss://pgis-wisp.joytree.site/", label: "PGIS" },
    { url: "wss://mages.io/wisp/", label: "Mages" },
    { url: "wss://lichology.com/wisp/", label: "Lichology" },
    { url: "wss://wisp.mercurywork.shop/", label: "MercuryWorkshop" },
    { url: "wss://wisp.terbiumon.top/wisp/", label: "Terbium" },
    { url: "wss://anura.pro/", label: "Anura" },
    { url: "wss://nebulaproxy.io/wisp/", label: "Nebula" },
    { url: "wss://wisp.rhw.one/", label: "RHW" },
  ];

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
    var candidates = DEFAULT_PUBLIC_RELAYS.filter(function (r) {
      return r.url !== excludeUrl;
    });
    return new Promise(function (resolve) {
      var settled = false;
      var remaining = candidates.length;
      if (!remaining) {
        resolve(null);
        return;
      }
      candidates.forEach(function (cand) {
        probeWsLatency(cand.url, 3200).then(function (ms) {
          remaining--;
          if (!settled && ms !== null) {
            settled = true;
            resolve({ url: cand.url, label: cand.label, latency: ms });
          } else if (!settled && remaining === 0) {
            resolve(null);
          }
        });
      });
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
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
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
      })().catch(function (err) {
        initPromise = null;
        throw err;
      });
      return initPromise;
    }

    async function setBareMuxWisp(wispUrl, label, latency) {
      var modPath =
        bareTransportName === "epoxy"
          ? "/epoxy/index.mjs?v=" + encodeURIComponent(epoxyVersionHash)
          : "/libcurl/index.mjs?v=" + encodeURIComponent(libcurlVersionHash);
      // [maxTotalSockets, maxPerHost, cachedWarmTlsSessions]
      // 6 per host leans on HTTP/2 multiplexing while keeping 32 warm TLS 1.3 sessions cached
      var modOpts =
        bareTransportName === "epoxy"
          ? [{ wisp: wispUrl }]
          : [{ websocket: wispUrl, connections: [64, 6, 32] }];

      await bareConnection.setTransport(modPath, modOpts);
      activeWispUrl = wispUrl;
      activeWispLabel = label || wispUrl;
      activeWispLatency = latency || null;
      saveCachedRelay(wispUrl, activeWispLabel, activeWispLatency);
      emitStatus();
    }

    async function verifyCurrentTunnelCanReachInternet() {
      try {
        var probePromise = bareClient.fetch(
          "https://www.cloudflare.com/cdn-cgi/trace",
          { method: "GET" }
        );
        var timeoutPromise = new Promise(function (_, reject) {
          setTimeout(function () {
            reject(new Error("WISP tunnel probe timeout"));
          }, 2600);
        });
        var res = await Promise.race([probePromise, timeoutPromise]);
        return Boolean(res && res.status > 0);
      } catch (_e) {
        return false;
      }
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

        // Instant zero-probe path if this browser session already verified a fast relay
        var cachedRelay = loadCachedRelay();
        if (cachedRelay && cachedRelay.url) {
          await ensureInitialized();
          await setBareMuxWisp(
            cachedRelay.url,
            cachedRelay.label,
            cachedRelay.latency
          );
          // Refresh RTT quietly in background; failover seamlessly if dead
          probeWsLatency(cachedRelay.url, 2500).then(function (liveMs) {
            if (liveMs === null && activeWispUrl === cachedRelay.url) {
              clearCachedRelay();
              activeWispUrl = null;
              ensureTransportReady().catch(function () {});
            } else if (liveMs !== null && activeWispUrl === cachedRelay.url) {
              activeWispLatency = liveMs;
              emitStatus();
            }
          });
          return;
        }

        var selfUrl = getSelfWispUrl();

        // If backend reported outbound internet is available (or pool failover disabled),
        // probe local /wisp/ in parallel with engine init and bind immediately with ZERO extra round-trip
        if (selfTunnelVerified !== false) {
          var parallelSelf = await Promise.all([
            ensureInitialized(),
            probeWsLatency(selfUrl, 1600),
          ]);
          var selfMs = parallelSelf[1];
          if (selfMs !== null) {
            await setBareMuxWisp(selfUrl, "Self-Hosted (/wisp/)", selfMs);
            if (!allowPoolFailover || selfTunnelVerified === true) {
              selfTunnelVerified = true;
              return;
            }
            // Verify asynchronously in background so navigation starts with 0ms stall
            verifyCurrentTunnelCanReachInternet().then(function (ok) {
              if (ok) {
                selfTunnelVerified = true;
              } else {
                selfTunnelVerified = false;
                clearCachedRelay();
                if (allowPoolFailover && activeWispUrl === selfUrl) {
                  selectFastestPoolRelay(selfUrl).then(function (bestBg) {
                    if (bestBg) {
                      setBareMuxWisp(
                        bestBg.url,
                        "Pool · " + bestBg.label,
                        bestBg.latency
                      ).catch(function () {});
                    }
                  });
                }
              }
            });
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
              best.latency
            );
            return;
          }
        }

        await setBareMuxWisp(selfUrl, "Self-Hosted (/wisp/)", null);
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
        if (
          cfg.customWispUrl !== undefined &&
          cfg.customWispUrl !== customWispUrl
        ) {
          customWispUrl = (cfg.customWispUrl || "").trim();
          clearCachedRelay();
          needRebind = true;
        }
        if (cfg.allowPoolFailover !== undefined) {
          if (Boolean(cfg.allowPoolFailover) !== allowPoolFailover) {
            allowPoolFailover = Boolean(cfg.allowPoolFailover);
            clearCachedRelay();
            needRebind = true;
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
      reconnect: async function () {
        clearCachedRelay();
        activeWispUrl = null;
        selfTunnelVerified = null;
        await ensureTransportReady();
      },
      failoverRelay: async function () {
        if (!allowPoolFailover || !bareConnection) return null;
        clearCachedRelay();
        var next = await selectFastestPoolRelay(activeWispUrl);
        if (next) {
          await setBareMuxWisp(next.url, "Pool · " + next.label, next.latency);
          return next;
        }
        return null;
      },
    };
  }

  window.IbossScramjetEngine = {
    create: createScramjetEngine,
  };
})(window);
