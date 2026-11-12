"use strict";

(function (window) {
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
      }, timeoutMs || 3200);

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
        probeWsLatency(cand.url, 3500).then(function (ms) {
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
    var selfTunnelVerified = null; // null = untested, true = working, false = blocked
    var tabFrames = new Map(); // tabId -> ScramjetFrame

    var swChannel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("ibossbad-sw-channel")
        : null;

    if (swChannel) {
      swChannel.addEventListener("message", function (ev) {
        var d = ev.data;
        if (!d) return;
        if (d.type === "blocked") {
          blockedCount++;
          emitStatus();
        } else if (
          d.type === "request" &&
          typeof cb.onRequestLog === "function"
        ) {
          cb.onRequestLog({
            method: d.method || "GET",
            url: d.url,
            status: d.status || 200,
            bytes: d.bytes || 0,
            ms: d.ms || 1,
            relay: "Scramjet · " + activeWispLabel,
          });
        }
      });
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
          var timer = setTimeout(resolve, 2500);
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

        await controller.init();

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

        await registerAndClaimServiceWorker();
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
          ? "/epoxy/index.mjs?v=2"
          : "/libcurl/index.mjs?v=2";
      var modOpts =
        bareTransportName === "epoxy"
          ? [{ wisp: wispUrl }]
          : [{ websocket: wispUrl, connections: [60, 50, 12] }];

      await bareConnection.setTransport(modPath, modOpts);
      activeWispUrl = wispUrl;
      activeWispLabel = label || wispUrl;
      activeWispLatency = latency || null;
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
          }, 4000);
        });
        var res = await Promise.race([probePromise, timeoutPromise]);
        return Boolean(res && res.status > 0);
      } catch (_e) {
        return false;
      }
    }

    async function ensureTransportReady() {
      await ensureInitialized();
      if (activeWispUrl) return;
      if (transportReadyPromise) return transportReadyPromise;

      transportReadyPromise = (async function () {
        if (customWispUrl) {
          var customMs = await probeWsLatency(customWispUrl, 3200);
          await setBareMuxWisp(customWispUrl, "Custom WISP", customMs);
          return;
        }

        var selfUrl = getSelfWispUrl();
        if (selfTunnelVerified !== false) {
          var selfMs = await probeWsLatency(selfUrl, 2000);
          if (selfMs !== null) {
            await setBareMuxWisp(selfUrl, "Self-Hosted (/wisp/)", selfMs);
            if (!allowPoolFailover || selfTunnelVerified === true) {
              selfTunnelVerified = true;
              return;
            }
            var canReachOut = await verifyCurrentTunnelCanReachInternet();
            if (canReachOut) {
              selfTunnelVerified = true;
              return;
            }
            selfTunnelVerified = false;
          } else {
            selfTunnelVerified = false;
          }
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

    return {
      isSupported: isSupported,
      ensureReady: ensureTransportReady,
      navigateTabFrame: navigateTabFrame,
      getTabFrame: function (tabId) {
        return tabFrames.get(tabId) || null;
      },
      destroyTabFrame: function (tabId) {
        tabFrames.delete(tabId);
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
          needRebind = true;
        }
        if (cfg.allowPoolFailover !== undefined) {
          if (Boolean(cfg.allowPoolFailover) !== allowPoolFailover) {
            allowPoolFailover = Boolean(cfg.allowPoolFailover);
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
          selfTunnelVerified = null;
          ensureTransportReady().catch(function () {});
        } else {
          emitStatus();
        }
      },
      reconnect: async function () {
        activeWispUrl = null;
        selfTunnelVerified = null;
        await ensureTransportReady();
      },
      failoverRelay: async function () {
        if (!allowPoolFailover || !bareConnection) return null;
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
