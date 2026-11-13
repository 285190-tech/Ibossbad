"use strict";

// Opium-Style Authentic Binary WISP v1/v2 Handshake Scanner & Unblocked Server Finder
(function (window) {
  var CUSTOM_SERVERS_KEY = "ibossbad.customWispServers.v1";
  var STICKY_WID_KEY = "ibossbad.wispWid.v1";
  var LAST_SCAN_CACHE_KEY = "ibossbad.wispScanResults.v1";

  // Combined 20-server unblocked WISP relay pool:
  // Includes Opium's stealth CDN WISP domains + Zinc/Mercury community relays
  var BUILTIN_WISP_POOL = [
    {
      url: "wss://cdn.northstreetumc.org/",
      label: "NorthStreet CDN",
      group: "Opium Stealth",
    },
    {
      url: "wss://cdn.vipersfutbol.com/",
      label: "Vipers CDN",
      group: "Opium Stealth",
    },
    {
      url: "wss://cdn.pcesc.org/",
      label: "PCESC Education CDN",
      group: "Opium Stealth",
    },
    {
      url: "wss://cdn.kcchallengevbc.com/",
      label: "KCChallenge CDN",
      group: "Opium Stealth",
    },
    {
      url: "wss://cdn.slcbmooc.org/",
      label: "SLCB MOOC CDN",
      group: "Opium Stealth",
    },
    {
      url: "wss://cdn.topstargym.net/",
      label: "TopStar CDN",
      group: "Opium Stealth",
    },
    {
      url: "wss://cdn.goaplytexas.org/",
      label: "ApplyTexas CDN",
      group: "Opium Stealth",
    },
    {
      url: "wss://cdn.clearfieldswimming.com/",
      label: "Clearfield CDN",
      group: "Opium Stealth",
    },
    {
      url: "wss://cdn.richardacademy.cfd/",
      label: "RichardAcademy CDN",
      group: "Opium Stealth",
    },
    {
      url: "wss://athollcottage.com/connection/",
      label: "Atholl Tunnel",
      group: "Opium Backup",
    },
    {
      url: "wss://kidsprepnest.org/vi/",
      label: "KidsPrep Tunnel",
      group: "Opium Backup",
    },
    {
      url: "wss://wisp.mercurywork.shop/",
      label: "MercuryWorkshop",
      group: "Community",
    },
    {
      url: "wss://definitelyscience.com/wisp/",
      label: "DefinitelyScience",
      group: "Community",
    },
    {
      url: "wss://pgis-wisp.joytree.site/",
      label: "PGIS Zinc",
      group: "Community",
    },
    {
      url: "wss://mages.io/wisp/",
      label: "Mages Relay",
      group: "Community",
    },
    {
      url: "wss://lichology.com/wisp/",
      label: "Lichology",
      group: "Community",
    },
    {
      url: "wss://wisp.terbiumon.top/wisp/",
      label: "Terbium WISP",
      group: "Community",
    },
    {
      url: "wss://anura.pro/",
      label: "Anura OS Relay",
      group: "Community",
    },
    {
      url: "wss://nebulaproxy.io/wisp/",
      label: "Nebula Relay",
      group: "Community",
    },
    {
      url: "wss://wisp.rhw.one/",
      label: "RHW Relay",
      group: "Community",
    },
  ];

  // Unblocked CDN / Mirror bases (from Opium's multi-CDN fallback array)
  var CDN_MIRRORS = [
    {
      name: "jsDelivr Global",
      probeUrl: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/package.json",
      host: "cdn.jsdelivr.net",
    },
    {
      name: "Bunny jsDelivr",
      probeUrl: "https://jsdelivr.b-cdn.net/npm/jszip@3.10.1/package.json",
      host: "jsdelivr.b-cdn.net",
    },
    {
      name: "Statically CDN",
      probeUrl:
        "https://cdn.statically.io/gh/MonkeyGG2/monkeygg2.github.io@main/README.md",
      host: "cdn.statically.io",
    },
    {
      name: "Githack RawCDN",
      probeUrl:
        "https://rawcdn.githack.com/MonkeyGG2/monkeygg2.github.io/main/README.md",
      host: "rawcdn.githack.com",
    },
    {
      name: "ESM.sh Edge",
      probeUrl: "https://esm.sh/jszip@3.10.1/package.json",
      host: "esm.sh",
    },
    {
      name: "unpkg CDN",
      probeUrl: "https://unpkg.com/jszip@3.10.1/package.json",
      host: "unpkg.com",
    },
    {
      name: "GitHub Raw",
      probeUrl:
        "https://raw.githubusercontent.com/MonkeyGG2/monkeygg2.github.io/main/README.md",
      host: "raw.githubusercontent.com",
    },
  ];

  var latestResults = new Map(); // url -> { ok, latencyMs, protocol, checkedAt }
  var latestCdnResults = new Map();
  var scanInProgress = false;

  try {
    var savedScan = JSON.parse(
      window.sessionStorage.getItem(LAST_SCAN_CACHE_KEY) || "{}"
    );
    Object.keys(savedScan).forEach(function (k) {
      latestResults.set(k, savedScan[k]);
    });
  } catch (_e) {}

  function persistScanSnapshot() {
    try {
      var obj = {};
      latestResults.forEach(function (v, k) {
        obj[k] = v;
      });
      window.sessionStorage.setItem(LAST_SCAN_CACHE_KEY, JSON.stringify(obj));
    } catch (_e) {}
  }

  function normalizeWispUrl(input) {
    var s = String(input || "").trim();
    if (!s) return "";
    if (!/^[a-z]+:\/\//i.test(s)) {
      s = "wss://" + s;
    }
    s = s.replace(/^http:\/\//i, "ws://").replace(/^https:\/\//i, "wss://");
    try {
      var u = new URL(s);
      if (!u.pathname || u.pathname === "") {
        u.pathname = "/";
      }
      return u.toString();
    } catch (_e) {
      return s;
    }
  }

  function getSelfWispUrl() {
    var proto = window.location.protocol === "https:" ? "wss://" : "ws://";
    return proto + window.location.host + "/wisp/";
  }

  function loadCustomServers() {
    try {
      var arr = JSON.parse(
        window.localStorage.getItem(CUSTOM_SERVERS_KEY) || "[]"
      );
      return Array.isArray(arr) ? arr : [];
    } catch (_e) {
      return [];
    }
  }

  function saveCustomServers(list) {
    try {
      window.localStorage.setItem(CUSTOM_SERVERS_KEY, JSON.stringify(list));
    } catch (_e) {}
  }

  function addCustomServer(rawUrl, customLabel) {
    var norm = normalizeWispUrl(rawUrl);
    if (!norm || !/^wss?:\/\//i.test(norm)) return null;
    var list = loadCustomServers();
    var exists = list.some(function (x) {
      return x.url === norm;
    });
    if (!exists) {
      var host = norm;
      try {
        host = new URL(norm).hostname;
      } catch (_e) {}
      list.unshift({
        url: norm,
        label: customLabel || "Custom · " + host,
        group: "Custom",
      });
      saveCustomServers(list);
    }
    return norm;
  }

  function removeCustomServer(url) {
    var list = loadCustomServers().filter(function (x) {
      return x.url !== url;
    });
    saveCustomServers(list);
  }

  function getAllServers(extraAdminRelays) {
    var seen = new Set();
    var out = [];
    function pushItem(item) {
      if (!item || !item.url) return;
      var u = normalizeWispUrl(item.url);
      if (!u || seen.has(u)) return;
      seen.add(u);
      out.push({
        url: u,
        label: item.label || u,
        group: item.group || "Community",
      });
    }

    pushItem({
      url: getSelfWispUrl(),
      label: "Self-Hosted Node (/wisp/)",
      group: "Primary",
    });

    loadCustomServers().forEach(pushItem);

    if (Array.isArray(extraAdminRelays)) {
      extraAdminRelays.forEach(function (r) {
        if (typeof r === "string") {
          pushItem({ url: r, label: "Admin Relay", group: "Instance" });
        } else if (r && r.url) {
          pushItem({
            url: r.url,
            label: r.label || "Admin Relay",
            group: "Instance",
          });
        }
      });
    }

    BUILTIN_WISP_POOL.forEach(pushItem);
    return out;
  }

  /**
   * Authentic Binary WISP v1/v2 Wire-Protocol Handshake Verifier
   * Speaks real stream-0 WISP_INFO (0x05) / WISP_CONTINUE (0x03) + stream-ID WISP_CONNECT (0x01)
   * so school MITM block pages or dead reverse proxies can never spoof a working server.
   */
  function probeWispHandshake(rawUrl, timeoutMs) {
    var url = normalizeWispUrl(rawUrl);
    var limit = timeoutMs || 3000;
    return new Promise(function (resolve) {
      if (!url || typeof window.WebSocket !== "function") {
        resolve({ ok: false, url: url, latencyMs: null, protocol: null });
        return;
      }

      var ws = null;
      var finished = false;
      var sentConnect = false;
      var sawV2 = false;
      var connectAt = 0;
      var openAt = performance.now();
      var streamId = (Math.floor(Math.random() * 4294967294) + 1) >>> 0;

      function finish(result) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (ws) {
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          try {
            ws.close();
          } catch (_e) {}
        }
        latestResults.set(url, {
          ok: result.ok,
          latencyMs: result.latencyMs,
          protocol: result.protocol,
          checkedAt: Date.now(),
        });
        resolve(result);
      }

      var timer = setTimeout(function () {
        finish({ ok: false, url: url, latencyMs: null, protocol: null });
      }, limit);

      try {
        ws = new window.WebSocket(url);
        ws.binaryType = "arraybuffer";
      } catch (_err) {
        finish({ ok: false, url: url, latencyMs: null, protocol: null });
        return;
      }

      ws.onerror = function () {
        finish({ ok: false, url: url, latencyMs: null, protocol: null });
      };
      ws.onclose = function () {
        finish({ ok: false, url: url, latencyMs: null, protocol: null });
      };

      ws.onmessage = function (ev) {
        var data = ev && ev.data;
        if (!(data instanceof ArrayBuffer) || data.byteLength < 5) {
          finish({ ok: false, url: url, latencyMs: null, protocol: null });
          return;
        }
        var view = new DataView(data);
        var pktType = view.getUint8(0);
        var pktStreamId = view.getUint32(1, true);

        if (sentConnect) {
          if (pktStreamId === streamId) {
            var rtt = Math.max(1, Math.round(performance.now() - connectAt));
            finish({
              ok: true,
              url: url,
              latencyMs: rtt,
              protocol: sawV2 ? "WISP v2" : "WISP v1",
            });
          }
          return;
        }

        if (pktStreamId === 0) {
          if (pktType === 5) {
            // WISP v2 WISP_INFO greeting -> negotiate WISP v2
            sawV2 = true;
            try {
              ws.send(new Uint8Array([5, 0, 0, 0, 0, 2, 1]));
            } catch (_e2) {}
          } else if (pktType === 3) {
            // WISP_CONTINUE on stream 0 -> send WISP_CONNECT probe to 127.0.0.1:69
            var hostBytes =
              typeof TextEncoder !== "undefined"
                ? new TextEncoder().encode("127.0.0.1")
                : new Uint8Array([49, 50, 55, 46, 48, 46, 48, 46, 49]);
            var pkt = new Uint8Array(8 + hostBytes.length);
            pkt[0] = 1; // WISP_CONNECT
            var dv = new DataView(pkt.buffer);
            dv.setUint32(1, streamId, true);
            pkt[5] = 1; // STREAM_TYPE_TCP
            pkt[6] = 69; // port 69 LE low byte
            pkt[7] = 0; // port 69 LE high byte
            pkt.set(hostBytes, 8);
            sentConnect = true;
            connectAt = performance.now() || openAt;
            try {
              ws.send(pkt);
            } catch (_e3) {
              finish({ ok: false, url: url, latencyMs: null, protocol: null });
            }
          }
        }
      };
    });
  }

  async function scanAllWispServers(options) {
    var opts = options || {};
    var servers = getAllServers(opts.extraAdminRelays);
    var concurrency = opts.concurrency || 5;
    var timeoutMs = opts.timeoutMs || 2800;
    var index = 0;
    var results = [];
    scanInProgress = true;

    async function worker() {
      while (index < servers.length) {
        var current = servers[index++];
        var res = await probeWispHandshake(current.url, timeoutMs);
        var merged = {
          url: current.url,
          label: current.label,
          group: current.group,
          ok: res.ok,
          latencyMs: res.latencyMs,
          protocol: res.protocol,
        };
        results.push(merged);
        if (typeof opts.onProgress === "function") {
          opts.onProgress(merged, results.length, servers.length);
        }
      }
    }

    var workers = [];
    for (var i = 0; i < Math.min(concurrency, servers.length); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
    scanInProgress = false;
    persistScanSnapshot();

    results.sort(function (a, b) {
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      if (!a.ok) return 0;
      return (a.latencyMs || 9999) - (b.latencyMs || 9999);
    });
    return results;
  }

  async function findBestUnblockedServer(options) {
    var opts = options || {};
    var excludeUrl = opts.excludeUrl ? normalizeWispUrl(opts.excludeUrl) : "";
    var servers = getAllServers(opts.extraAdminRelays).filter(function (s) {
      return s.url !== excludeUrl;
    });

    // If sticky WID server exists and quickFirst is enabled, try sticky first (just like Opium getWlsp)
    if (!opts.forceFullScan) {
      var stickyUrl = "";
      try {
        stickyUrl = window.localStorage.getItem(STICKY_WID_KEY) || "";
      } catch (_e) {}
      if (stickyUrl && stickyUrl !== excludeUrl) {
        var stickyMatch = servers.find(function (s) {
          return s.url === stickyUrl;
        });
        if (stickyMatch) {
          var stickyProbe = await probeWispHandshake(stickyMatch.url, 2200);
          if (stickyProbe.ok) {
            return {
              url: stickyMatch.url,
              label: stickyMatch.label,
              group: stickyMatch.group,
              ok: true,
              latencyMs: stickyProbe.latencyMs,
              protocol: stickyProbe.protocol,
            };
          }
        }
      }
    }

    // Scan in waves of 6 and pick the lowest-latency verified unblocked server
    var all = await scanAllWispServers({
      extraAdminRelays: opts.extraAdminRelays,
      concurrency: 6,
      timeoutMs: opts.timeoutMs || 2600,
      onProgress: opts.onProgress,
    });
    var candidates = all.filter(function (r) {
      return r.ok && r.url !== excludeUrl;
    });
    if (!candidates.length) return null;
    var best = candidates[0];
    try {
      window.localStorage.setItem(STICKY_WID_KEY, best.url);
    } catch (_e2) {}
    return best;
  }

  async function probeCdnMirrors(onItem) {
    var out = [];
    await Promise.all(
      CDN_MIRRORS.map(async function (cdn) {
        var t0 = performance.now();
        var ok = false;
        var ms = null;
        try {
          var ctrl =
            typeof AbortController !== "undefined"
              ? new AbortController()
              : null;
          var timer = ctrl
            ? setTimeout(function () {
                ctrl.abort();
              }, 3200)
            : null;
          var res = await window.fetch(cdn.probeUrl, {
            method: "GET",
            cache: "no-store",
            signal: ctrl ? ctrl.signal : undefined,
          });
          if (timer) clearTimeout(timer);
          if (res && res.ok) {
            ok = true;
            ms = Math.max(1, Math.round(performance.now() - t0));
          }
        } catch (_e) {
          ok = false;
        }
        var entry = {
          name: cdn.name,
          host: cdn.host,
          ok: ok,
          latencyMs: ms,
        };
        latestCdnResults.set(cdn.host, entry);
        out.push(entry);
        if (typeof onItem === "function") onItem(entry);
      })
    );
    out.sort(function (a, b) {
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      return (a.latencyMs || 9999) - (b.latencyMs || 9999);
    });
    return out;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shortHost(url) {
    try {
      var u = new URL(url);
      return u.hostname + (u.pathname !== "/" ? u.pathname : "");
    } catch (_e) {
      return url;
    }
  }

  function renderServerFinderPage(container, ctx) {
    var extraRelays =
      (ctx && ctx.publicConfig && ctx.publicConfig.wispRelays) || [];
    var activeUrl =
      (ctx && typeof ctx.getActiveWispUrl === "function"
        ? ctx.getActiveWispUrl()
        : "") || getSelfWispUrl();

    function draw() {
      var servers = getAllServers(extraRelays);
      var unblockedCount = 0;
      servers.forEach(function (s) {
        var r = latestResults.get(s.url);
        if (r && r.ok) unblockedCount++;
      });

      var activeMeta = latestResults.get(normalizeWispUrl(activeUrl));
      var activePingText =
        activeMeta && activeMeta.ok
          ? activeMeta.latencyMs +
            " ms (" +
            (activeMeta.protocol || "WISP") +
            ")"
          : "Click Scan to verify";

      var cardsHtml = servers
        .map(function (srv) {
          var res = latestResults.get(srv.url);
          var isCurrent = normalizeWispUrl(activeUrl) === srv.url;
          var badgeHtml = '<span class="sf-badge sf-idle">Not Tested</span>';
          var barPct = 0;
          var barColor = "#64748b";
          if (res) {
            if (res.ok) {
              var ms = res.latencyMs || 1;
              barPct = Math.max(12, Math.min(100, Math.round(100 - ms / 6)));
              if (ms < 130) {
                barColor = "#22c55e";
                badgeHtml =
                  '<span class="sf-badge sf-good">🟢 UNBLOCKED · ' +
                  ms +
                  "ms</span>";
              } else {
                barColor = "#eab308";
                badgeHtml =
                  '<span class="sf-badge sf-warn">🟡 UNBLOCKED · ' +
                  ms +
                  "ms</span>";
              }
            } else {
              barPct = 100;
              barColor = "rgba(239,68,68,0.35)";
              badgeHtml =
                '<span class="sf-badge sf-bad">🔴 BLOCKED / OFFLINE</span>';
            }
          }

          return (
            '<div class="internal-card sf-server-card' +
            (isCurrent ? " sf-active-card" : "") +
            '">' +
            '<div class="sf-card-top">' +
            "<div>" +
            '<div class="sf-card-title">' +
            escapeHtml(srv.label) +
            (isCurrent ? ' <span class="sf-active-tag">ACTIVE</span>' : "") +
            "</div>" +
            '<div class="sf-card-host">' +
            escapeHtml(shortHost(srv.url)) +
            " · <span>" +
            escapeHtml(srv.group) +
            (res && res.protocol ? " · " + escapeHtml(res.protocol) : "") +
            "</span></div>" +
            "</div>" +
            badgeHtml +
            "</div>" +
            '<div class="diag-bar-track" style="max-width:none;margin:10px 0">' +
            '<div class="diag-bar-fill" style="width:' +
            barPct +
            "%;background:" +
            barColor +
            '"></div>' +
            "</div>" +
            '<div class="sf-card-actions">' +
            '<button type="button" class="btn ' +
            (isCurrent ? "btn-secondary" : "btn-primary") +
            ' btn-xs" data-use-wisp="' +
            escapeHtml(srv.url) +
            '" data-use-label="' +
            escapeHtml(srv.label) +
            '">' +
            (isCurrent ? "✓ Connected" : "⚡ Use Server") +
            "</button>" +
            '<button type="button" class="btn btn-secondary btn-xs" data-probe-one="' +
            escapeHtml(srv.url) +
            '">Ping</button>' +
            (srv.group === "Custom"
              ? '<button type="button" class="btn btn-danger btn-xs" data-del-custom="' +
                escapeHtml(srv.url) +
                '">✕</button>'
              : "") +
            "</div>" +
            "</div>"
          );
        })
        .join("");

      var cdnHtml = CDN_MIRRORS.map(function (c) {
        var r = latestCdnResults.get(c.host);
        var status = !r
          ? '<span class="sf-badge sf-idle">Untested</span>'
          : r.ok
          ? '<span class="sf-badge sf-good">🟢 ' + r.latencyMs + "ms</span>"
          : '<span class="sf-badge sf-bad">🔴 Blocked</span>';
        return (
          '<div class="internal-card" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px">' +
          "<div><strong>" +
          escapeHtml(c.name) +
          '</strong><div style="font-size:11.5px;color:var(--text-muted)">' +
          escapeHtml(c.host) +
          "</div></div>" +
          status +
          "</div>"
        );
      }).join("");

      container.innerHTML =
        '<div class="internal-page">' +
        '<div class="hub-visual-hero">' +
        '<img src="/ui/assets/banner-cybercity.jpg" alt="" class="hub-hero-bg" />' +
        '<div class="hub-hero-scrim"></div>' +
        '<div class="hub-hero-body">' +
        "<div>" +
        '<span class="bento-kicker">🛰️ Binary WISP v1/v2 Handshake Scanner</span>' +
        "<h1>Unblocked Server Finder</h1>" +
        "<p>Automatically tests 21+ stealth WISP relays &amp; CDN mirrors with real binary WISP stream handshakes to find servers your Wi-Fi filter hasn't blocked.</p>" +
        "</div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="button" class="btn btn-primary" id="sfAutoFastestBtn">' +
        (scanInProgress
          ? "⏳ Scanning Servers..."
          : "⚡ Auto-Find Fastest Unblocked") +
        "</button>" +
        '<button type="button" class="btn btn-secondary" id="sfScanAllBtn">🔄 Scan All (' +
        servers.length +
        ")</button>" +
        "</div>" +
        "</div>" +
        "</div>" +
        '<div class="internal-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-bottom:18px">' +
        '<div class="internal-card"><div style="font-size:11.5px;color:var(--text-muted)">ACTIVE WISP SERVER</div><strong style="font-size:14.5px;display:block;margin-top:4px">' +
        escapeHtml(shortHost(activeUrl)) +
        "</strong></div>" +
        '<div class="internal-card"><div style="font-size:11.5px;color:var(--text-muted)">HANDSHAKE PING</div><strong style="font-size:14.5px;display:block;margin-top:4px;color:#4ade80">' +
        escapeHtml(activePingText) +
        "</strong></div>" +
        '<div class="internal-card"><div style="font-size:11.5px;color:var(--text-muted)">VERIFIED UNBLOCKED</div><strong style="font-size:14.5px;display:block;margin-top:4px">' +
        unblockedCount +
        " / " +
        servers.length +
        " Servers Ready</strong></div>" +
        "</div>" +
        '<div class="internal-card" style="margin-bottom:18px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
        '<input id="sfCustomUrlInput" type="text" class="field-input" style="flex:1;min-width:240px" placeholder="Add or test custom WISP domain or wss://relay.example/wisp/..." />' +
        '<button type="button" class="btn btn-primary" id="sfAddCustomBtn">+ Add &amp; Test Server</button>' +
        '<button type="button" class="btn btn-secondary" id="sfScanCdnBtn">🌐 Check Unblocked CDNs</button>' +
        "</div>" +
        '<div id="sfScanProgressText" style="font-size:12.5px;color:var(--text-secondary);margin-bottom:12px"></div>' +
        '<h3 style="margin:0 0 12px;font-size:15px">WISP Tunnel Servers (' +
        servers.length +
        ")</h3>" +
        '<div class="internal-grid sf-servers-grid">' +
        cardsHtml +
        "</div>" +
        '<h3 style="margin:24px 0 12px;font-size:15px">Unblocked Asset CDN Mirrors</h3>' +
        '<div class="internal-grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">' +
        cdnHtml +
        "</div>" +
        "</div>";

      var autoBtn = container.querySelector("#sfAutoFastestBtn");
      if (autoBtn) {
        autoBtn.onclick = async function () {
          if (scanInProgress) return;
          autoBtn.disabled = true;
          autoBtn.textContent = "⏳ Probing WISP Handshakes...";
          var progEl = container.querySelector("#sfScanProgressText");
          var best = await findBestUnblockedServer({
            forceFullScan: true,
            extraAdminRelays: extraRelays,
            onProgress: function (item, done, total) {
              if (progEl) {
                progEl.textContent =
                  "Probed " +
                  done +
                  "/" +
                  total +
                  ": " +
                  item.label +
                  (item.ok ? " (" + item.latencyMs + "ms ✓)" : " (blocked)");
              }
            },
          });
          if (best && ctx && typeof ctx.onSelectWispServer === "function") {
            activeUrl = best.url;
            ctx.onSelectWispServer(best.url, best.label, best.latencyMs);
          } else if (!best && ctx && ctx.toast) {
            ctx.toast("No reachable WISP relays responded on this network.");
          }
          draw();
        };
      }

      var scanAllBtn = container.querySelector("#sfScanAllBtn");
      if (scanAllBtn) {
        scanAllBtn.onclick = async function () {
          if (scanInProgress) return;
          scanAllBtn.disabled = true;
          scanAllBtn.textContent = "⏳ Scanning...";
          var progEl = container.querySelector("#sfScanProgressText");
          await scanAllWispServers({
            extraAdminRelays: extraRelays,
            onProgress: function (item, done, total) {
              if (progEl) {
                progEl.textContent =
                  "Testing " +
                  done +
                  "/" +
                  total +
                  ": " +
                  item.label +
                  (item.ok
                    ? " — UNBLOCKED (" + item.latencyMs + "ms)"
                    : " — blocked");
              }
            },
          });
          draw();
        };
      }

      var cdnBtn = container.querySelector("#sfScanCdnBtn");
      if (cdnBtn) {
        cdnBtn.onclick = async function () {
          cdnBtn.disabled = true;
          cdnBtn.textContent = "⏳ Checking CDNs...";
          await probeCdnMirrors();
          draw();
        };
      }

      var addBtn = container.querySelector("#sfAddCustomBtn");
      if (addBtn) {
        addBtn.onclick = async function () {
          var inp = container.querySelector("#sfCustomUrlInput");
          var val = inp ? inp.value.trim() : "";
          if (!val) return;
          var added = addCustomServer(val);
          if (!added) {
            if (ctx && ctx.toast)
              ctx.toast("Enter a valid domain or wss:// URL");
            return;
          }
          addBtn.disabled = true;
          addBtn.textContent = "Testing...";
          var res = await probeWispHandshake(added, 3200);
          persistScanSnapshot();
          if (res.ok && ctx && typeof ctx.onSelectWispServer === "function") {
            activeUrl = added;
            ctx.onSelectWispServer(
              added,
              "Custom · " + shortHost(added),
              res.latencyMs
            );
          } else if (!res.ok && ctx && ctx.toast) {
            ctx.toast(
              "Added server, but WISP handshake failed or was blocked."
            );
          }
          draw();
        };
      }

      container.querySelectorAll("[data-use-wisp]").forEach(function (btn) {
        btn.onclick = function () {
          var u = btn.getAttribute("data-use-wisp");
          var lbl = btn.getAttribute("data-use-label") || u;
          var meta = latestResults.get(u);
          activeUrl = u;
          try {
            window.localStorage.setItem(STICKY_WID_KEY, u);
          } catch (_e) {}
          if (ctx && typeof ctx.onSelectWispServer === "function") {
            ctx.onSelectWispServer(u, lbl, meta ? meta.latencyMs : null);
          }
          draw();
        };
      });

      container.querySelectorAll("[data-probe-one]").forEach(function (btn) {
        btn.onclick = async function () {
          var u = btn.getAttribute("data-probe-one");
          btn.disabled = true;
          btn.textContent = "...";
          await probeWispHandshake(u, 3200);
          persistScanSnapshot();
          draw();
        };
      });

      container.querySelectorAll("[data-del-custom]").forEach(function (btn) {
        btn.onclick = function () {
          removeCustomServer(btn.getAttribute("data-del-custom"));
          draw();
        };
      });
    }

    draw();
  }

  window.IbossServerFinder = {
    BUILTIN_WISP_POOL: BUILTIN_WISP_POOL,
    CDN_MIRRORS: CDN_MIRRORS,
    normalizeWispUrl: normalizeWispUrl,
    getAllServers: getAllServers,
    addCustomServer: addCustomServer,
    removeCustomServer: removeCustomServer,
    probeWispHandshake: probeWispHandshake,
    scanAllWispServers: scanAllWispServers,
    findBestUnblockedServer: findBestUnblockedServer,
    probeCdnMirrors: probeCdnMirrors,
    renderServerFinderPage: renderServerFinderPage,
  };
})(window);
