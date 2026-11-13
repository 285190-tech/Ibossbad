"use strict";

(function (window) {
  var LOCAL_HISTORY_KEY = "ibossbad_local_history_v1";
  var WORKSPACES_KEY = "ibossbad_workspaces_v1";
  var SCRATCHPAD_KEY = "ibossbad_scratchpad_v1";

  var WISP_RELAYS = [
    {
      id: "self",
      name: "Self-Hosted Instance (/wisp/)",
      getUrl: function () {
        var proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        return proto + "//" + window.location.host + "/wisp/";
      },
      presetValue: "self",
    },
    {
      id: "pgis",
      name: "PGIS WISP (Zinc Pool)",
      url: "wss://pgis-wisp.joytree.site/",
      presetValue: "wss://pgis-wisp.joytree.site/",
    },
    {
      id: "defsci",
      name: "DefinitelyScience WISP",
      url: "wss://definitelyscience.com/wisp/",
      presetValue: "wss://definitelyscience.com/wisp/",
    },
    {
      id: "mages",
      name: "Mages WISP",
      url: "wss://mages.io/wisp/",
      presetValue: "wss://mages.io/wisp/",
    },
    {
      id: "lich",
      name: "Lichology WISP",
      url: "wss://lichology.com/wisp/",
      presetValue: "wss://lichology.com/wisp/",
    },
    {
      id: "mercury",
      name: "MercuryWorkshop WISP",
      url: "wss://wisp.mercurywork.shop/",
      presetValue: "wss://wisp.mercurywork.shop/",
    },
    {
      id: "terbium",
      name: "Terbium WISP",
      url: "wss://wisp.terbiumon.top/wisp/",
      presetValue: "wss://wisp.terbiumon.top/wisp/",
    },
  ];

  function esc(str) {
    return String(str === undefined || str === null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadList(key) {
    try {
      var raw = localStorage.getItem(key);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_e) {
      return [];
    }
  }

  function saveList(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (_e) {}
  }

  function recordLocalHistory(url, title) {
    if (!url || /^javascript:/i.test(url) || url === "iboss://newtab") return;
    var list = loadList(LOCAL_HISTORY_KEY);
    if (list.length > 0 && list[0].url === url) {
      list[0].title = title || list[0].title || url;
      list[0].ts = Date.now();
      saveList(LOCAL_HISTORY_KEY, list);
      return;
    }
    list.unshift({
      url: String(url).slice(0, 500),
      title: String(title || url).slice(0, 140),
      ts: Date.now(),
    });
    if (list.length > 250) list.length = 250;
    saveList(LOCAL_HISTORY_KEY, list);
  }

  function getLocalHistory() {
    return loadList(LOCAL_HISTORY_KEY);
  }

  function probeSingleRelay(wsUrl, timeoutMs) {
    return new Promise(function (resolve) {
      var start = performance.now();
      var settled = false;
      var ws = null;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        try {
          if (ws) ws.close();
        } catch (_e) {}
        resolve({ ok: false, ms: null, status: "Timeout" });
      }, timeoutMs || 3800);

      try {
        ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        ws.onopen = function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          var ms = Math.max(1, Math.round(performance.now() - start));
          try {
            ws.close();
          } catch (_e) {}
          resolve({ ok: true, ms: ms, status: "Online" });
        };
        ws.onerror = function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ ok: false, ms: null, status: "Unreachable" });
        };
      } catch (_err) {
        clearTimeout(timer);
        resolve({ ok: false, ms: null, status: "Blocked" });
      }
    });
  }

  function createDiagnosticsToolsController(hooks) {
    var lastBenchResults = {};
    var historyQuery = "";

    async function renderDiagnosticsPage(container) {
      var swActive = Boolean(
        navigator.serviceWorker && navigator.serviceWorker.controller
      );
      var memStr = "Unavailable in this browser";
      if (window.performance && window.performance.memory) {
        var usedMb = Math.round(
          window.performance.memory.usedJSHeapSize / 1048576
        );
        var limMb = Math.round(
          window.performance.memory.jsHeapSizeLimit / 1048576
        );
        memStr = usedMb + " MB / " + limMb + " MB";
      }

      var storageStr = "Checking...";
      if (navigator.storage && navigator.storage.estimate) {
        try {
          var est = await navigator.storage.estimate();
          storageStr =
            ((est.usage || 0) / 1048576).toFixed(1) +
            " MB used of " +
            Math.round((est.quota || 0) / 1048576) +
            " MB";
        } catch (_e) {
          storageStr = "Active";
        }
      }

      var batteryStr = "AC / Desktop";
      if (navigator.getBattery) {
        try {
          var bat = await navigator.getBattery();
          batteryStr =
            Math.round(bat.level * 100) +
            "%" +
            (bat.charging ? " (Charging ⚡)" : "");
        } catch (_e) {}
      }

      var settings = hooks.getSettings ? hooks.getSettings() : {};

      function buildRelayRows() {
        return WISP_RELAYS.map(function (r) {
          var targetWs = r.getUrl ? r.getUrl() : r.url;
          var res = lastBenchResults[r.id];
          var badgeHtml = '<span class="relay-mini-badge">Not Tested</span>';
          var barPct = 0;
          var barColor = "#38bdf8";
          if (res) {
            if (res.ok) {
              barPct = Math.max(8, Math.min(100, Math.round(100 - res.ms / 6)));
              barColor =
                res.ms < 100 ? "#10b981" : res.ms < 240 ? "#f59e0b" : "#ef4444";
              badgeHtml =
                '<span class="relay-mini-badge" style="color:' +
                barColor +
                '">' +
                res.ms +
                " ms</span>";
            } else {
              badgeHtml =
                '<span class="relay-mini-badge" style="color:#f87171">' +
                esc(res.status) +
                "</span>";
            }
          }
          var isSelected = settings.wispPreset === r.presetValue;
          return (
            '<div class="ext-row" style="gap:12px;flex-wrap:wrap">' +
            '<div style="flex:1;min-width:220px"><strong>' +
            esc(r.name) +
            "</strong> " +
            (isSelected ? '<span class="game-tile-badge">ACTIVE</span>' : "") +
            '<div class="settings-desc"><code>' +
            esc(targetWs) +
            "</code></div>" +
            (res && res.ok
              ? '<div class="diag-bar-track"><div class="diag-bar-fill" style="width:' +
                barPct +
                "%;background:" +
                barColor +
                '"></div></div>'
              : "") +
            "</div>" +
            '<div style="display:flex;align-items:center;gap:8px">' +
            badgeHtml +
            '<button type="button" class="btn btn-secondary btn-xs" data-use-wisp="' +
            esc(r.presetValue) +
            '">Use Relay</button></div></div>'
          );
        }).join("");
      }

      container.innerHTML =
        '<div class="internal-wrap">' +
        '<div class="games-header-bar"><div><h1>WISP Relay Benchmarker &amp; Diagnostics (<code>iboss://diagnostics</code>)</h1>' +
        "<p>Test real-time WebSocket RTT latency across all WISP relays and inspect browser engine health.</p></div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="button" class="btn btn-primary" id="runWispBenchBtn">⚡ Benchmark All Relays</button>' +
        '<button type="button" class="btn btn-secondary" id="pickFastestWispBtn">Auto-Select Fastest</button>' +
        "</div></div>" +
        '<div class="admin-stats-grid" style="margin-bottom:18px">' +
        '<div class="admin-stat-card"><span class="stat-k">Scramjet Service Worker</span><strong>' +
        (swActive ? "Active ✓" : "Standby") +
        "</strong></div>" +
        '<div class="admin-stat-card"><span class="stat-k">Proxy Engine / TLS</span><strong>' +
        esc(
          (settings.proxyEngine || "scramjet").toUpperCase() +
            " · " +
            (settings.bareTransport || "libcurl")
        ) +
        "</strong></div>" +
        '<div class="admin-stat-card"><span class="stat-k">JS Heap Memory</span><strong>' +
        esc(memStr) +
        "</strong></div>" +
        '<div class="admin-stat-card"><span class="stat-k">Storage Quota</span><strong>' +
        esc(storageStr) +
        "</strong></div>" +
        '<div class="admin-stat-card"><span class="stat-k">Power / Battery</span><strong>' +
        esc(batteryStr) +
        "</strong></div>" +
        "</div>" +
        '<div class="internal-panel">' +
        "<h3>WISP Relay Pool Latency</h3>" +
        '<div id="diagRelayList" style="margin-top:10px">' +
        buildRelayRows() +
        "</div></div></div>";

      function bindRelayButtons() {
        container.querySelectorAll("[data-use-wisp]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var preset = btn.getAttribute("data-use-wisp");
            if (hooks.applyWispPreset) {
              hooks.applyWispPreset(preset);
              renderDiagnosticsPage(container);
            }
          });
        });
      }
      bindRelayButtons();

      container
        .querySelector("#runWispBenchBtn")
        .addEventListener("click", async function () {
          var btn = container.querySelector("#runWispBenchBtn");
          btn.disabled = true;
          btn.textContent = "Testing 7 Relays...";
          await Promise.all(
            WISP_RELAYS.map(async function (r) {
              var wsUrl = r.getUrl ? r.getUrl() : r.url;
              lastBenchResults[r.id] = await probeSingleRelay(wsUrl, 3800);
            })
          );
          renderDiagnosticsPage(container);
          hooks.toast("WISP relay benchmark complete!");
        });

      container
        .querySelector("#pickFastestWispBtn")
        .addEventListener("click", async function () {
          if (Object.keys(lastBenchResults).length === 0) {
            await Promise.all(
              WISP_RELAYS.map(async function (r) {
                var wsUrl = r.getUrl ? r.getUrl() : r.url;
                lastBenchResults[r.id] = await probeSingleRelay(wsUrl, 3800);
              })
            );
          }
          var best = null;
          WISP_RELAYS.forEach(function (r) {
            var res = lastBenchResults[r.id];
            if (res && res.ok && (!best || res.ms < best.ms)) {
              best = { relay: r, ms: res.ms };
            }
          });
          if (!best) {
            hooks.toast("No reachable WISP relay found right now.");
            renderDiagnosticsPage(container);
            return;
          }
          if (hooks.applyWispPreset) {
            hooks.applyWispPreset(best.relay.presetValue);
          }
          hooks.toast(
            "Switched to fastest relay: " +
              best.relay.name +
              " (" +
              best.ms +
              " ms)"
          );
          renderDiagnosticsPage(container);
        });
    }

    function renderHistoryAndWorkspacesPage(container) {
      var list = getLocalHistory();
      var workspaces = loadList(WORKSPACES_KEY);
      var q = historyQuery.trim().toLowerCase();
      var filtered = list.filter(function (item) {
        if (!q) return true;
        return (
          String(item.title || "")
            .toLowerCase()
            .indexOf(q) !== -1 ||
          String(item.url || "")
            .toLowerCase()
            .indexOf(q) !== -1
        );
      });

      container.innerHTML =
        '<div class="internal-wrap">' +
        '<div class="games-header-bar"><div><h1>Workspaces &amp; Local History (<code>iboss://history</code>)</h1>' +
        "<p>Save multi-tab workspace setups or reopen sites from your private local history.</p></div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="button" class="btn btn-secondary" id="clearHourHistoryBtn">Clear Last Hour</button>' +
        '<button type="button" class="btn btn-danger" id="clearAllHistoryBtn">Clear All History</button>' +
        "</div></div>" +
        '<div class="internal-panel" style="margin-bottom:18px">' +
        "<h3>Saved Multi-Tab Workspaces</h3>" +
        '<p class="settings-desc">Snapshot all currently open tabs into a named workspace so you can restore them anytime in 1 click.</p>' +
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
        '<input id="wsNameInput" type="text" class="field-input" style="max-width:320px" placeholder="Workspace name (e.g. AP Chem Study or Gaming)" />' +
        '<button type="button" class="btn btn-primary" id="saveWorkspaceBtn">Save Current Tabs</button>' +
        "</div>" +
        '<div style="margin-top:12px">' +
        (workspaces.length === 0
          ? '<div class="empty-bookmarks">No saved workspaces yet.</div>'
          : workspaces
              .map(function (ws) {
                return (
                  '<div class="ext-row"><div><strong>' +
                  esc(ws.name) +
                  '</strong> <span class="relay-mini-badge">' +
                  ws.tabs.length +
                  " tabs</span></div>" +
                  '<div style="display:flex;gap:6px">' +
                  '<button type="button" class="btn btn-primary btn-xs" data-restore-ws="' +
                  esc(ws.id) +
                  '">Restore Tabs</button>' +
                  '<button type="button" class="btn btn-danger btn-xs" data-del-ws="' +
                  esc(ws.id) +
                  '">Delete</button></div></div>'
                );
              })
              .join("")) +
        "</div></div>" +
        '<div class="internal-panel">' +
        "<h3>Private Local Browsing History (" +
        filtered.length +
        ")</h3>" +
        '<input id="histSearchInput" type="text" class="field-input" placeholder="Search visited pages &amp; games..." value="' +
        esc(historyQuery) +
        '" style="margin:10px 0 12px" />' +
        (filtered.length === 0
          ? '<div class="empty-bookmarks">No local history entries match.</div>'
          : filtered
              .slice(0, 120)
              .map(function (h) {
                var timeStr = new Date(h.ts).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  '<div class="ext-row"><div style="min-width:0;flex:1"><strong>' +
                  esc(h.title) +
                  '</strong> <span class="settings-desc">· ' +
                  esc(timeStr) +
                  '</span><div class="settings-desc" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
                  esc(h.url) +
                  "</div></div>" +
                  '<button type="button" class="btn btn-secondary btn-xs" data-open-hist="' +
                  esc(h.url) +
                  '">Open</button></div>'
                );
              })
              .join("")) +
        "</div></div>";

      container
        .querySelector("#saveWorkspaceBtn")
        .addEventListener("click", function () {
          var name =
            container.querySelector("#wsNameInput").value.trim() ||
            "Workspace " + (workspaces.length + 1);
          var openUrls = hooks.getOpenTabUrls ? hooks.getOpenTabUrls() : [];
          if (!openUrls.length) {
            hooks.toast("Open at least one site or internal tab first!");
            return;
          }
          workspaces.unshift({
            id: "ws-" + Date.now(),
            name: name,
            tabs: openUrls,
            createdAt: Date.now(),
          });
          saveList(WORKSPACES_KEY, workspaces.slice(0, 25));
          hooks.toast("Saved workspace '" + name + "'!");
          renderHistoryAndWorkspacesPage(container);
        });

      container.querySelectorAll("[data-restore-ws]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var ws = workspaces.find(function (w) {
            return w.id === btn.getAttribute("data-restore-ws");
          });
          if (ws && hooks.restoreWorkspaceTabs) {
            hooks.restoreWorkspaceTabs(ws.tabs);
            hooks.toast("Restored workspace: " + ws.name);
          }
        });
      });

      container.querySelectorAll("[data-del-ws]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var next = workspaces.filter(function (w) {
            return w.id !== btn.getAttribute("data-del-ws");
          });
          saveList(WORKSPACES_KEY, next);
          renderHistoryAndWorkspacesPage(container);
        });
      });

      var searchEl = container.querySelector("#histSearchInput");
      if (searchEl) {
        searchEl.addEventListener("input", function () {
          historyQuery = searchEl.value;
          var pos = searchEl.selectionStart;
          renderHistoryAndWorkspacesPage(container);
          var nextEl = container.querySelector("#histSearchInput");
          if (nextEl) {
            nextEl.focus();
            try {
              nextEl.setSelectionRange(pos, pos);
            } catch (_e) {}
          }
        });
      }

      container.querySelectorAll("[data-open-hist]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          hooks.openInNewTab(btn.getAttribute("data-open-hist"));
        });
      });

      container
        .querySelector("#clearHourHistoryBtn")
        .addEventListener("click", function () {
          var cutoff = Date.now() - 3600 * 1000;
          saveList(
            LOCAL_HISTORY_KEY,
            list.filter(function (x) {
              return x.ts < cutoff;
            })
          );
          hooks.toast("Cleared last hour of local history.");
          renderHistoryAndWorkspacesPage(container);
        });

      container
        .querySelector("#clearAllHistoryBtn")
        .addEventListener("click", function () {
          saveList(LOCAL_HISTORY_KEY, []);
          hooks.toast("Cleared all local history.");
          renderHistoryAndWorkspacesPage(container);
        });
    }

    function renderToolsPage(container) {
      var savedNotes = localStorage.getItem(SCRATCHPAD_KEY) || "";

      container.innerHTML =
        '<div class="internal-wrap">' +
        '<div class="games-header-bar"><div><h1>Built-In Study &amp; Power Tools (<code>iboss://tools</code>)</h1>' +
        "<p>Zero-network offline utilities: auto-saving scratchpad, encoder/JWT inspector, cryptographic password generator &amp; math evaluator.</p></div></div>" +
        '<div class="admin-two-col">' +
        '<div class="internal-panel">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3>Quick Notes &amp; Word Counter</h3><span id="notesCountBadge" class="relay-mini-badge">0 words</span></div>' +
        '<textarea id="toolsScratchpad" class="field-input code-area" rows="8" placeholder="Jot down notes, links, homework, or snippets — auto-saves locally...">' +
        esc(savedNotes) +
        "</textarea>" +
        '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<button type="button" class="btn btn-primary btn-xs" id="dlNotesBtn">Export .md</button>' +
        '<button type="button" class="btn btn-secondary btn-xs" id="copyNotesBtn">Copy</button>' +
        "</div></div>" +
        '<div class="internal-panel">' +
        "<h3>Base64 / URL / JWT Token Codec</h3>" +
        '<textarea id="codecInput" class="field-input code-area" rows="4" placeholder="Paste text, URL, Base64 string, or JWT token..."></textarea>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">' +
        '<button type="button" class="btn btn-secondary btn-xs" data-codec="b64enc">Base64 Encode</button>' +
        '<button type="button" class="btn btn-secondary btn-xs" data-codec="b64dec">Base64 Decode</button>' +
        '<button type="button" class="btn btn-secondary btn-xs" data-codec="urlenc">URL Encode</button>' +
        '<button type="button" class="btn btn-secondary btn-xs" data-codec="urldec">URL Decode</button>' +
        '<button type="button" class="btn btn-primary btn-xs" data-codec="jwt">Decode JWT</button>' +
        "</div>" +
        '<textarea id="codecOutput" class="field-input code-area" rows="3" readonly placeholder="Result appears here..."></textarea>' +
        "</div></div>" +
        '<div class="admin-two-col" style="margin-top:16px">' +
        '<div class="internal-panel">' +
        "<h3>Cryptographic Password Generator</h3>" +
        '<div style="display:flex;gap:8px;align-items:center;margin-top:10px">' +
        '<input id="pwdLenInput" type="number" min="8" max="64" value="20" class="field-input" style="max-width:90px" />' +
        '<button type="button" class="btn btn-primary" id="genPwdBtn">Generate Strong Key</button>' +
        "</div>" +
        '<input id="genPwdOut" type="text" class="field-input" style="margin-top:10px;font-family:monospace" readonly placeholder="Click Generate..." />' +
        "</div>" +
        '<div class="internal-panel">' +
        "<h3>Scientific Math &amp; Unit Evaluator</h3>" +
        '<p class="settings-desc">Supports JS <code>Math.*</code> constants &amp; functions (e.g. <code>sqrt(144) + sin(PI/2)</code>, <code>(72 - 32) * 5/9</code>).</p>' +
        '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<input id="sciExprInput" type="text" class="field-input" placeholder="e.g. sqrt(256) * pow(2, 5)" />' +
        '<button type="button" class="btn btn-primary" id="sciEvalBtn">Compute</button>' +
        "</div>" +
        '<div id="sciResultBox" class="relay-mini-badge" style="margin-top:10px;font-size:14px;padding:6px 10px">= Ready</div>' +
        "</div></div></div>";

      var pad = container.querySelector("#toolsScratchpad");
      var badge = container.querySelector("#notesCountBadge");
      function refreshStats() {
        var txt = pad.value;
        var words = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        badge.textContent = words + " words · " + txt.length + " chars";
        try {
          localStorage.setItem(SCRATCHPAD_KEY, txt);
        } catch (_e) {}
      }
      refreshStats();
      pad.addEventListener("input", refreshStats);

      container
        .querySelector("#dlNotesBtn")
        .addEventListener("click", function () {
          var b = new Blob([pad.value], { type: "text/markdown" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(b);
          a.download = "ibossbad-notes.md";
          a.click();
        });
      container
        .querySelector("#copyNotesBtn")
        .addEventListener("click", function () {
          if (navigator.clipboard) navigator.clipboard.writeText(pad.value);
          hooks.toast("Copied scratchpad to clipboard!");
        });

      container.querySelectorAll("[data-codec]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var mode = btn.getAttribute("data-codec");
          var raw = container.querySelector("#codecInput").value;
          var outEl = container.querySelector("#codecOutput");
          try {
            if (mode === "b64enc")
              outEl.value = btoa(unescape(encodeURIComponent(raw)));
            else if (mode === "b64dec")
              outEl.value = decodeURIComponent(escape(atob(raw.trim())));
            else if (mode === "urlenc") outEl.value = encodeURIComponent(raw);
            else if (mode === "urldec") outEl.value = decodeURIComponent(raw);
            else if (mode === "jwt") {
              var parts = raw.trim().split(".");
              if (parts.length < 2) throw new Error("Not a valid JWT");
              var payload = JSON.parse(
                atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
              );
              outEl.value = JSON.stringify(payload, null, 2);
            }
          } catch (e) {
            outEl.value = "Decode Error: " + (e.message || "Invalid input");
          }
        });
      });

      container
        .querySelector("#genPwdBtn")
        .addEventListener("click", function () {
          var len = Math.max(
            8,
            Math.min(
              64,
              Number(container.querySelector("#pwdLenInput").value) || 20
            )
          );
          var alphabet =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+";
          var arr = new Uint32Array(len);
          window.crypto.getRandomValues(arr);
          var res = "";
          for (var i = 0; i < len; i++) {
            res += alphabet.charAt(arr[i] % alphabet.length);
          }
          container.querySelector("#genPwdOut").value = res;
          if (navigator.clipboard) navigator.clipboard.writeText(res);
          hooks.toast("Generated & copied strong password!");
        });

      container
        .querySelector("#sciEvalBtn")
        .addEventListener("click", function () {
          var expr = container.querySelector("#sciExprInput").value;
          var box = container.querySelector("#sciResultBox");
          try {
            // eslint-disable-next-line no-new-func
            var fn = new Function(
              "var abs=Math.abs,ceil=Math.ceil,cos=Math.cos,exp=Math.exp,floor=Math.floor,log=Math.log,max=Math.max,min=Math.min,pow=Math.pow,round=Math.round,sin=Math.sin,sqrt=Math.sqrt,tan=Math.tan,PI=Math.PI,E=Math.E; return (" +
                expr +
                ");"
            );
            var val = fn();
            box.textContent = "= " + String(val);
          } catch (_e) {
            box.textContent = "= Syntax Error";
          }
        });
    }

    return {
      renderDiagnosticsPage: renderDiagnosticsPage,
      renderHistoryAndWorkspacesPage: renderHistoryAndWorkspacesPage,
      renderToolsPage: renderToolsPage,
    };
  }

  window.IbossDiagnosticsTools = {
    create: createDiagnosticsToolsController,
    recordLocalHistory: recordLocalHistory,
    getLocalHistory: getLocalHistory,
    relays: WISP_RELAYS,
  };
})(window);
