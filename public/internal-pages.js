"use strict";

(function (window) {
  var FAV_GAMES_KEY = "ibossbad_fav_games_v1";
  var RECENT_GAMES_KEY = "ibossbad_recent_games_v1";

  var CAT_GRADIENTS = {
    featured: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)",
    action: "linear-gradient(135deg, #ef4444 0%, #f97316 100%)",
    arcade: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
    sports: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    minecraft: "linear-gradient(135deg, #22c55e 0%, #15803d 100%)",
    puzzle: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    idle: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
    escape: "linear-gradient(135deg, #64748b 0%, #334155 100%)",
    flash: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)",
    apps: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
    community: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)",
  };

  function esc(str) {
    return String(str === undefined || str === null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadStringList(key) {
    try {
      var raw = localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }

  function saveStringList(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (_e) {}
  }

  function createInternalPagesController(hooks) {
    var activeGameCategory = "all";
    var activeGameQuery = "";

    function recordRecentGame(url, title) {
      var list = loadJsonList(RECENT_GAMES_KEY).filter(function (x) {
        return x && x.url !== url;
      });
      list.unshift({ url: url, title: title || url, ts: Date.now() });
      saveStringList(RECENT_GAMES_KEY, list.slice(0, 10));
    }

    function loadJsonList(key) {
      try {
        var raw = localStorage.getItem(key);
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (_e) {
        return [];
      }
    }

    function renderUrlDirectory(container) {
      var pages = [
        {
          url: "iboss://newtab",
          title: "New Tab Dashboard",
          desc: "Search omnibox, quick launch cards, clock & saved bookmarks.",
        },
        {
          url: "iboss://games",
          title: "Games & Apps Library (200+)",
          desc:
            "Favorites, Recently Played, MonkeyGG2 HTML5 + Ruffle Flash lineup.",
        },
        {
          url: "iboss://media",
          title: "Media, Ad-Free YouTube & Radio",
          desc:
            "Invidious/Piped YouTube bypass, persistent Lofi/Synthwave radio & live TV.",
        },
        {
          url: "iboss://emulator",
          title: "Retro EmulatorJS ROM Player",
          desc:
            "Play local GBA, NDS, SNES, N64, NES & Genesis ROMs with gamepad support.",
        },
        {
          url: "iboss://store",
          title: "1-Click Mod & Bookmarklet Store",
          desc:
            "Eruda DevTools, 16x Video Speed, Idle Auto-Clicker & Element Zapper.",
        },
        {
          url: "iboss://extensions",
          title: "Extensions (.zip) & Custom Scripts",
          desc:
            "Install Zinc-compatible .zip extensions, FPS HUD & custom CSS/JS.",
        },
        {
          url: "iboss://desktop",
          title: "WebOS Multi-Window Desktop",
          desc:
            "Terbium/Anura-style floating multi-window desktop, dock & terminal.",
        },
        {
          url: "iboss://downloads",
          title: "Safe-Filename Proxy Downloader",
          desc: "Download files through the proxy with clean custom filenames.",
        },
        {
          url: "iboss://diagnostics",
          title: "WISP Benchmarker & Diagnostics",
          desc:
            "Benchmark RTT latency across all 7 WISP relays & view browser health.",
        },
        {
          url: "iboss://history",
          title: "Workspaces & Local History",
          desc:
            "Save multi-tab workspace snapshots & search private local history.",
        },
        {
          url: "iboss://tools",
          title: "Study & Power Utilities",
          desc:
            "Scratchpad, Base64/JWT codec, crypto password generator & math engine.",
        },
        {
          url: "iboss://storage",
          title: "Storage & Game-Save Backup",
          desc:
            "Inspect localStorage, export/import .json game saves & sync to Cloud.",
        },
        {
          url: "iboss://editor",
          title: "Live HTML/CSS/JS Playground",
          desc:
            "Write and run HTML, CSS & JS with live preview or blob: popout.",
        },
        {
          url: "iboss://changelog",
          title: "Version & Changelog",
          desc: "See what's new in Ibossbad v4.0.",
        },
        {
          url: "iboss://admin",
          title: "Admin Command Center",
          desc:
            "Live users, remote controls, IP bans, 12h keys, invite links, MOTD & polls.",
        },
      ];

      container.innerHTML =
        '<div class="internal-wrap">' +
        '<div class="internal-hero"><h1>Internal <code>iboss://</code> Pages</h1>' +
        "<p>Built-in browser pages — type any URL below into the address bar or click to open.</p></div>" +
        '<div class="internal-grid">' +
        pages
          .map(function (p) {
            return (
              '<div class="internal-card" data-go-internal="' +
              esc(p.url) +
              '">' +
              '<div class="internal-card-code">' +
              esc(p.url) +
              "</div>" +
              "<h3>" +
              esc(p.title) +
              "</h3>" +
              "<p>" +
              esc(p.desc) +
              "</p>" +
              "</div>"
            );
          })
          .join("") +
        "</div></div>";

      container.querySelectorAll("[data-go-internal]").forEach(function (el) {
        el.addEventListener("click", function () {
          hooks.navigate(el.getAttribute("data-go-internal"));
        });
      });
    }

    function renderChangelog(container) {
      container.innerHTML =
        '<div class="internal-wrap">' +
        '<div class="internal-hero"><h1>Ibossbad v5.0 Changelog</h1>' +
        "<p>10x Flagship Polish · Command Palette · WISP Benchmarker · Permanent Admin Accounts · Workspaces</p></div>" +
        '<div class="changelog-list">' +
        '<div class="internal-panel" style="margin-bottom:14px"><h3>v5.0 — Command Palette, WISP Benchmarker, Workspaces, Tools &amp; Permanent Admin Accounts</h3>' +
        "<ul>" +
        "<li>Added <strong>Universal Command Palette (<code>Ctrl+K</code>)</strong>: Instant fuzzy search across all 200+ games, <code>iboss://</code> pages, open tabs, 1-click mods, themes, and cloaks.</li>" +
        "<li>Added <strong>Permanent Cloud Account Admin Role (<code>ADMIN</code>)</strong>: Bind any Supabase account as permanent Admin in 1 click inside <code>iboss://admin</code> (plus Admin Audit Log, Chat Slow-Mode &amp; Blocked-Word Filter).</li>" +
        "<li>Added <strong><code>iboss://diagnostics</code></strong> (7-relay WISP WebSocket RTT latency benchmarker + 1-click Fastest Relay), <strong><code>iboss://history</code></strong> (Multi-Tab Workspaces &amp; private local history), and <strong><code>iboss://tools</code></strong> (Scratchpad, JWT/Base64 Codec, Crypto Keygen &amp; Scientific Math).</li>" +
        "<li>Added <strong>Smart Omnibox Autocomplete</strong>, <strong>Rich Tab Right-Click Context Menu</strong> (Duplicate, Pin, Mute, Sleep, Popout PiP, Close Others), <strong>8 Curated Themes</strong>, and <strong>PWA Installability</strong>.</li>" +
        "</ul></div>" +
        '<div class="internal-panel" style="margin-bottom:14px"><h3>v4.0 — Media Hub, Retro EmulatorJS, 1-Click Mod Store, WebOS &amp; Admin v2</h3>' +
        "<ul>" +
        "<li>Added <strong><code>iboss://media</code></strong>: Ad-free YouTube/Invidious/Piped smart bypass, persistent background Lofi/Synthwave radio mini-bar, and streaming apps.</li>" +
        "<li>Added <strong><code>iboss://emulator</code></strong>: Local GBA, NDS, SNES, N64, NES &amp; Genesis ROM player powered by EmulatorJS + gamepad detection.</li>" +
        "<li>Added <strong><code>iboss://store</code></strong>: 1-Click Eruda Full DevTools, 16x Video Speed Controller, Idle Auto-Clicker, Element Zapper &amp; Reader Focus.</li>" +
        "<li>Added <strong><code>iboss://desktop</code></strong> (multi-window WebOS mode), <strong><code>iboss://downloads</code></strong> (Safe-Filename SSRF-guarded proxy downloader), <strong>Pinned Tabs</strong>, <strong><code>Ctrl+Shift+T</code> Reopen Closed Tab</strong>, and <strong>4 School Decoys</strong> (Google Docs, Desmos Graphing Calculator, Canvas Quiz, Khan Academy).</li>" +
        "<li>Added <strong>Shareable 1-Click Invite Links (<code>/?invite=...</code>)</strong>, <strong>Login MOTD Popup</strong>, and <strong>Live Polls in Instance Chat</strong>.</li>" +
        "</ul></div>" +
        '<div class="internal-panel"><h3>v3.0 — 200+ Games, .zip Extensions &amp; Admin Command Center</h3>' +
        "<ul><li>Added 200+ MonkeyGG2 HTML5 &amp; Ruffle Flash games, <code>iboss://admin</code> live user controls, IP bans, 12h keys &amp; Stealth v2.</li></ul></div>" +
        "</div></div>";
    }

    function renderStorePage(container) {
      var items = window.IbossExtensions
        ? window.IbossExtensions.storeCatalog
        : [];
      var enabledMap = window.IbossExtensions
        ? window.IbossExtensions.getEnabledStoreMods()
        : {};

      container.innerHTML =
        '<div class="internal-wrap">' +
        '<div class="games-header-bar"><div><h1>1-Click Mod &amp; Bookmarklet Store (<code>iboss://store</code>)</h1>' +
        "<p>Enable mods automatically on every proxied tab, or click <strong>Run on Tab</strong> to launch on your open page right now.</p></div>" +
        '<button type="button" class="btn btn-secondary" id="jumpZipExtBtn">Upload Custom .zip Extension</button></div>' +
        '<div class="internal-grid">' +
        items
          .map(function (it) {
            var isOn = Boolean(enabledMap[it.id]);
            return (
              '<div class="internal-panel">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
              '<span class="game-tile-badge">' +
              esc(it.badge) +
              '</span><span class="game-cat-tag">' +
              esc(it.category) +
              "</span></div>" +
              "<h3>" +
              esc(it.name) +
              "</h3>" +
              '<p class="settings-desc" style="min-height:42px">' +
              esc(it.desc) +
              "</p>" +
              '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
              '<button type="button" class="btn btn-primary btn-xs" data-run-mod="' +
              esc(it.id) +
              '">Run on Active Tab</button>' +
              (it.autoInjectable
                ? '<button type="button" class="btn ' +
                  (isOn ? "btn-danger" : "btn-secondary") +
                  ' btn-xs" data-toggle-mod="' +
                  esc(it.id) +
                  '">' +
                  (isOn ? "Auto-Inject: ON" : "Auto-Inject: OFF") +
                  "</button>"
                : "") +
              "</div></div>"
            );
          })
          .join("") +
        "</div></div>";

      container
        .querySelector("#jumpZipExtBtn")
        .addEventListener("click", function () {
          hooks.navigate("iboss://extensions");
        });

      container.querySelectorAll("[data-toggle-mod]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-toggle-mod");
          var cur = Boolean(enabledMap[id]);
          window.IbossExtensions.toggleStoreMod(id, !cur);
          hooks.toast(
            !cur
              ? "Enabled auto-injection on proxied pages!"
              : "Disabled auto-injection."
          );
          renderStorePage(container);
        });
      });

      container.querySelectorAll("[data-run-mod]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-run-mod");
          var found = items.find(function (x) {
            return x.id === id;
          });
          if (found && hooks.runScriptInOtherTab) {
            hooks.runScriptInOtherTab(found.code, found.name);
          }
        });
      });
    }

    function renderGamesHub(container) {
      var customGames = hooks.getCustomGames ? hooks.getCustomGames() : [];
      var favUrls = loadStringList(FAV_GAMES_KEY);
      var recentList = loadJsonList(RECENT_GAMES_KEY);
      var baseCats = window.IbossGamesCatalog
        ? window.IbossGamesCatalog.categories
        : [];
      var cats = [
        baseCats[0] || { id: "all", label: "All Games" },
        { id: "favorites", label: "★ Favorites (" + favUrls.length + ")" },
      ].concat(baseCats.slice(1));

      var results;
      if (activeGameCategory === "favorites") {
        results = window.IbossGamesCatalog.search(
          activeGameQuery,
          "all",
          customGames
        ).filter(function (g) {
          return favUrls.indexOf(g.url) !== -1;
        });
      } else {
        results = window.IbossGamesCatalog
          ? window.IbossGamesCatalog.search(
              activeGameQuery,
              activeGameCategory,
              customGames
            )
          : [];
      }

      var pads = navigator.getGamepads
        ? Array.from(navigator.getGamepads()).filter(Boolean)
        : [];

      container.innerHTML =
        '<div class="internal-wrap">' +
        '<div class="games-header-bar">' +
        "<div><h1>Games &amp; Apps Hub</h1>" +
        "<p>200+ real HTML5, WebGL, EaglerCraft &amp; Ruffle Flash titles — star favorites or launch in PiP.</p></div>" +
        '<div class="games-header-actions" style="display:flex;gap:8px;flex-wrap:wrap">' +
        (pads.length
          ? '<span class="cat-pill active">🎮 Gamepad Ready</span>'
          : "") +
        '<button type="button" class="btn btn-primary" id="surpriseGameBtn">🎲 Surprise Me</button>' +
        '<button type="button" class="btn btn-secondary" id="jumpEmulatorBtn">🕹️ Retro ROM Player</button>' +
        '<button type="button" class="btn btn-secondary" id="openGameReqModalBtn">+ Request Game / Report Broken</button>' +
        "</div></div>" +
        (recentList.length > 0 &&
        !activeGameQuery &&
        activeGameCategory === "all"
          ? '<div style="margin-bottom:16px"><div class="games-count-label">Recently Played</div>' +
            '<div class="cat-pills">' +
            recentList
              .slice(0, 6)
              .map(function (rg) {
                return (
                  '<button type="button" class="cat-pill" data-play-url="' +
                  esc(rg.url) +
                  '" data-play-title="' +
                  esc(rg.title) +
                  '">▶ ' +
                  esc(rg.title) +
                  "</button>"
                );
              })
              .join("") +
            "</div></div>"
          : "") +
        '<div class="games-toolbar">' +
        '<input type="text" id="gamesSearchInput" class="field-input games-search-input" placeholder="Search 200+ games &amp; aliases (e.g. btd5, mc, 1v1, slope, retro bowl, fnf)..." value="' +
        esc(activeGameQuery) +
        '" />' +
        '<div class="cat-pills" id="gamesCatPills">' +
        cats
          .map(function (c) {
            return (
              '<button type="button" class="cat-pill' +
              (c.id === activeGameCategory ? " active" : "") +
              '" data-cat="' +
              esc(c.id) +
              '">' +
              esc(c.label) +
              "</button>"
            );
          })
          .join("") +
        "</div></div>" +
        '<div id="gameReqInlineBox" class="internal-panel hidden" style="margin-bottom:16px">' +
        "<h3>Submit Game Request or Broken Site Report</h3>" +
        '<div class="req-grid">' +
        '<select id="reqKindSelect" class="field-select"><option value="game">Request a Game</option><option value="bug">Report Broken Link</option></select>' +
        '<input id="reqTitleInput" type="text" class="field-input" placeholder="Game or Site Name" />' +
        '<input id="reqUrlInput" type="text" class="field-input" placeholder="URL (optional, e.g. https://...)" />' +
        '<input id="reqNotesInput" type="text" class="field-input" placeholder="Notes for Admin (optional)" />' +
        '<button type="button" class="btn btn-primary" id="submitReqBtn">Send to Admin</button>' +
        "</div></div>" +
        '<div class="games-count-label">Showing <strong>' +
        results.length +
        "</strong> titles</div>" +
        '<div class="games-catalog-grid" id="gamesCatalogGrid">' +
        results
          .map(function (g) {
            var initials = g.title
              .replace(/[^A-Za-z0-9 ]/g, "")
              .split(/\s+/)
              .slice(0, 2)
              .map(function (w) {
                return w.charAt(0);
              })
              .join("")
              .toUpperCase();
            var isFav = favUrls.indexOf(g.url) !== -1;
            var grad = CAT_GRADIENTS[g.category] || CAT_GRADIENTS.featured;
            return (
              '<div class="game-tile">' +
              '<div class="game-cover-banner" style="background:' +
              grad +
              '">' +
              '<span class="game-cover-initials">' +
              esc(initials || "GM") +
              "</span>" +
              '<button type="button" class="game-fav-btn' +
              (isFav ? " fav-on" : "") +
              '" data-fav-url="' +
              esc(g.url) +
              '" title="Favorite">' +
              (isFav ? "★" : "☆") +
              "</button></div>" +
              '<div class="game-tile-top"><span class="game-cat-tag">' +
              esc(g.category) +
              "</span></div>" +
              '<div class="game-tile-title">' +
              esc(g.title) +
              "</div>" +
              '<div class="game-tile-actions">' +
              '<button type="button" class="btn btn-primary btn-xs" data-play-url="' +
              esc(g.url) +
              '" data-play-title="' +
              esc(g.title) +
              '">Play</button>' +
              '<button type="button" class="btn btn-secondary btn-xs" data-pip-url="' +
              esc(g.url) +
              '" data-pip-title="' +
              esc(g.title) +
              '" title="Open in Floating Mini-Window">Mini</button>' +
              "</div></div>"
            );
          })
          .join("") +
        "</div></div>";

      container
        .querySelector("#surpriseGameBtn")
        .addEventListener("click", function () {
          if (!results.length) return;
          var pick = results[Math.floor(Math.random() * results.length)];
          recordRecentGame(pick.url, pick.title);
          hooks.toast("Launching " + pick.title + "!");
          hooks.openInNewTab(pick.url);
        });

      container
        .querySelector("#jumpEmulatorBtn")
        .addEventListener("click", function () {
          hooks.navigate("iboss://emulator");
        });

      var searchEl = container.querySelector("#gamesSearchInput");
      if (searchEl) {
        searchEl.addEventListener("input", function () {
          activeGameQuery = searchEl.value;
          var pos = searchEl.selectionStart;
          renderGamesHub(container);
          var nextInput = container.querySelector("#gamesSearchInput");
          if (nextInput) {
            nextInput.focus();
            try {
              nextInput.setSelectionRange(pos, pos);
            } catch (_e) {}
          }
        });
      }

      container.querySelectorAll("[data-cat]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          activeGameCategory = btn.getAttribute("data-cat");
          renderGamesHub(container);
        });
      });

      container.querySelectorAll("[data-fav-url]").forEach(function (btn) {
        btn.addEventListener("click", function (ev) {
          ev.stopPropagation();
          var u = btn.getAttribute("data-fav-url");
          var cur = loadStringList(FAV_GAMES_KEY);
          var idx = cur.indexOf(u);
          if (idx === -1) cur.unshift(u);
          else cur.splice(idx, 1);
          saveStringList(FAV_GAMES_KEY, cur);
          renderGamesHub(container);
        });
      });

      container.querySelectorAll("[data-play-url]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var u = btn.getAttribute("data-play-url");
          var t = btn.getAttribute("data-play-title");
          recordRecentGame(u, t);
          hooks.openInNewTab(u);
        });
      });

      container.querySelectorAll("[data-pip-url]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var u = btn.getAttribute("data-pip-url");
          var t = btn.getAttribute("data-pip-title");
          recordRecentGame(u, t);
          hooks.openMiniPlayer(u, t);
        });
      });

      var reqBtn = container.querySelector("#openGameReqModalBtn");
      var reqBox = container.querySelector("#gameReqInlineBox");
      if (reqBtn && reqBox) {
        reqBtn.addEventListener("click", function () {
          reqBox.classList.toggle("hidden");
        });
      }
      var sendReqBtn = container.querySelector("#submitReqBtn");
      if (sendReqBtn) {
        sendReqBtn.addEventListener("click", async function () {
          var title = container.querySelector("#reqTitleInput").value.trim();
          var url = container.querySelector("#reqUrlInput").value.trim();
          var kind = container.querySelector("#reqKindSelect").value;
          var notes = container.querySelector("#reqNotesInput").value.trim();
          if (!title) {
            hooks.toast("Enter a game or site name first.");
            return;
          }
          var r = await fetch("/api/requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: title,
              url: url,
              kind: kind,
              notes: notes,
            }),
          });
          var d = await r.json();
          if (r.ok && d.ok) {
            hooks.toast("Sent to Admin inbox!");
            reqBox.classList.add("hidden");
          } else {
            hooks.toast((d && d.error) || "Failed to send request.");
          }
        });
      }
    }

    async function renderExtensionsPage(container) {
      var mods = window.IbossExtensions.loadMods();
      var installed = await window.IbossExtensions.listExtensions();

      container.innerHTML =
        '<div class="internal-wrap">' +
        '<div class="games-header-bar"><div><h1>Extensions &amp; Built-In Mods</h1>' +
        "<p>Install Zinc-compatible <code>.zip</code> extensions (<code>manifest.json</code>) or open the 1-Click Mod Store.</p></div>" +
        '<button type="button" class="btn btn-primary" id="openStoreFromExtBtn">Open 1-Click Mod Store</button></div>' +
        '<div class="internal-panel" style="margin-bottom:18px">' +
        "<h3>Install <code>.zip</code> Extension</h3>" +
        '<p class="settings-desc">Upload any Zinc-style <code>.zip</code> archive containing <code>manifest.json</code>, popup HTML, and scripts.</p>' +
        '<div style="display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap">' +
        '<input type="file" id="extZipInput" accept=".zip" class="field-input" style="max-width:340px" />' +
        '<button type="button" class="btn btn-primary" id="installExtZipBtn">Install Extension</button>' +
        "</div>" +
        '<div id="extListArea" style="margin-top:16px">' +
        (installed.length === 0
          ? '<div class="empty-bookmarks">No .zip extensions installed yet.</div>'
          : installed
              .map(function (ext) {
                var name = (ext.manifest && ext.manifest.name) || ext.id;
                var ver = (ext.manifest && ext.manifest.version) || "1.0";
                var desc = (ext.manifest && ext.manifest.description) || "";
                return (
                  '<div class="ext-row">' +
                  "<div><strong>" +
                  esc(name) +
                  '</strong> <span class="relay-mini-badge">v' +
                  esc(ver) +
                  '</span><div class="settings-desc">' +
                  esc(desc) +
                  "</div></div>" +
                  '<div style="display:flex;gap:8px;align-items:center">' +
                  '<button type="button" class="btn btn-secondary btn-xs" data-ext-popup="' +
                  esc(ext.id) +
                  '">Open Popup</button>' +
                  '<button type="button" class="btn btn-secondary btn-xs" data-ext-toggle="' +
                  esc(ext.id) +
                  '">' +
                  (ext.enabled ? "Disable" : "Enable") +
                  "</button>" +
                  '<button type="button" class="btn btn-danger btn-xs" data-ext-del="' +
                  esc(ext.id) +
                  '">Remove</button>' +
                  "</div></div>"
                );
              })
              .join("")) +
        "</div></div>" +
        '<div class="internal-panel">' +
        "<h3>Built-In Mods &amp; Userscript Injector</h3>" +
        '<div class="toggle-row"><div><strong>Live FPS Counter HUD</strong><p class="settings-desc">Floating real-time frame-rate badge in top-right corner.</p></div>' +
        '<select id="modFpsSelect" class="field-select"><option value="off"' +
        (!mods.fpsOverlay ? " selected" : "") +
        '>Off</option><option value="on"' +
        (mods.fpsOverlay ? " selected" : "") +
        ">Enabled</option></select></div>" +
        '<div class="toggle-row" style="margin-top:12px"><div><strong>Force Dark Mode on Sites</strong><p class="settings-desc">Inverts bright pages inside Scramjet tabs while keeping images &amp; video natural.</p></div>' +
        '<select id="modDarkSelect" class="field-select"><option value="off"' +
        (!mods.forceDark ? " selected" : "") +
        '>Off</option><option value="on"' +
        (mods.forceDark ? " selected" : "") +
        ">Enabled</option></select></div>" +
        '<div style="margin-top:14px"><label class="field-label">Custom CSS (Injected into Proxied Sites)</label>' +
        '<textarea id="modCustomCss" class="field-input code-area" rows="3" placeholder="/* e.g. .ad-banner { display: none !important; } */">' +
        esc(mods.customCss) +
        "</textarea></div>" +
        '<div style="margin-top:12px"><label class="field-label">Custom Userscript JS (Runs on Proxied Page Load)</label>' +
        '<textarea id="modCustomJs" class="field-input code-area" rows="4" placeholder="// Runs automatically inside proxied tabs">' +
        esc(mods.customJs) +
        "</textarea></div>" +
        '<div style="margin-top:14px"><button type="button" class="btn btn-primary" id="saveModsBtn">Save Mods</button></div>' +
        "</div></div>";

      container
        .querySelector("#openStoreFromExtBtn")
        .addEventListener("click", function () {
          hooks.navigate("iboss://store");
        });

      container
        .querySelector("#installExtZipBtn")
        .addEventListener("click", async function () {
          var fInput = container.querySelector("#extZipInput");
          if (!fInput.files || !fInput.files[0]) {
            hooks.toast("Choose a .zip file first.");
            return;
          }
          try {
            var ext = await window.IbossExtensions.importZipExtension(
              fInput.files[0]
            );
            hooks.toast(
              "Installed extension: " +
                ((ext.manifest && ext.manifest.name) || ext.id)
            );
            renderExtensionsPage(container);
          } catch (e) {
            hooks.toast(e.message || "Failed to import extension.");
          }
        });

      container.querySelectorAll("[data-ext-toggle]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var id = btn.getAttribute("data-ext-toggle");
          var cur = installed.find(function (x) {
            return x.id === id;
          });
          if (cur) {
            await window.IbossExtensions.toggleExtension(id, !cur.enabled);
            renderExtensionsPage(container);
          }
        });
      });

      container.querySelectorAll("[data-ext-del]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          await window.IbossExtensions.removeExtension(
            btn.getAttribute("data-ext-del")
          );
          renderExtensionsPage(container);
        });
      });

      container.querySelectorAll("[data-ext-popup]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-ext-popup");
          var cur = installed.find(function (x) {
            return x.id === id;
          });
          if (cur) {
            var bUrl = window.IbossExtensions.buildExtensionPopupBlobUrl(cur);
            hooks.openMiniPlayer(
              bUrl,
              (cur.manifest && cur.manifest.name) || cur.id,
              true
            );
          }
        });
      });

      container
        .querySelector("#saveModsBtn")
        .addEventListener("click", function () {
          window.IbossExtensions.saveMods({
            fpsOverlay: container.querySelector("#modFpsSelect").value === "on",
            forceDark: container.querySelector("#modDarkSelect").value === "on",
            customCss: container.querySelector("#modCustomCss").value,
            customJs: container.querySelector("#modCustomJs").value,
          });
          hooks.toast("Mods & FPS HUD updated!");
        });
    }

    function collectGameSavesObject() {
      var out = {};
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        if (
          k === "ibossbad.supabase.v1" ||
          k === "ibossbad_supabase_session_v1"
        ) {
          continue;
        }
        out[k] = localStorage.getItem(k);
      }
      return out;
    }

    function renderStoragePage(container) {
      var entries = collectGameSavesObject();
      var keys = Object.keys(entries).sort();

      container.innerHTML =
        '<div class="internal-wrap">' +
        '<div class="games-header-bar"><div><h1>Storage &amp; Game-Save Backup</h1>' +
        "<p>Export, import, or sync your game progress (Infinite Craft, 2048, Cookie Clicker, EmulatorJS, etc.) across devices.</p></div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="button" class="btn btn-primary" id="exportSavesBtn">Export .json Backup</button>' +
        '<label class="btn btn-secondary" style="cursor:pointer">Import .json<input type="file" id="importSavesInput" accept=".json" style="display:none" /></label>' +
        '<button type="button" class="btn btn-secondary" id="cloudPushSavesBtn">Sync Saves to Cloud</button>' +
        '<button type="button" class="btn btn-secondary" id="cloudPullSavesBtn">Restore from Cloud</button>' +
        "</div></div>" +
        '<div class="internal-panel">' +
        "<h3>Local Storage Keys (" +
        keys.length +
        ")</h3>" +
        '<div class="storage-table-wrap">' +
        keys
          .map(function (k) {
            var val = String(entries[k] || "");
            return (
              '<div class="ext-row">' +
              '<div style="min-width:0;flex:1"><strong style="font-family:monospace;font-size:12px">' +
              esc(k) +
              '</strong><div class="settings-desc" style="word-break:break-all">' +
              esc(val.slice(0, 140)) +
              (val.length > 140 ? "..." : "") +
              "</div></div>" +
              '<button type="button" class="btn btn-danger btn-xs" data-del-ls="' +
              esc(k) +
              '">Delete</button></div>'
            );
          })
          .join("") +
        "</div></div></div>";

      container
        .querySelector("#exportSavesBtn")
        .addEventListener("click", function () {
          var blob = new Blob(
            [
              JSON.stringify(
                {
                  exportedAt: new Date().toISOString(),
                  saves: collectGameSavesObject(),
                },
                null,
                2
              ),
            ],
            { type: "application/json" }
          );
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "ibossbad-saves-backup.json";
          a.click();
          hooks.toast("Exported game saves backup!");
        });

      container
        .querySelector("#importSavesInput")
        .addEventListener("change", async function (ev) {
          var f = ev.target.files && ev.target.files[0];
          if (!f) return;
          try {
            var parsed = JSON.parse(await f.text());
            var map = parsed.saves || parsed;
            Object.keys(map).forEach(function (k) {
              if (
                k !== "ibossbad.supabase.v1" &&
                k !== "ibossbad_supabase_session_v1" &&
                typeof map[k] === "string"
              ) {
                localStorage.setItem(k, map[k]);
              }
            });
            hooks.toast("Imported game saves! Reloading view...");
            renderStoragePage(container);
          } catch (_e) {
            hooks.toast("Invalid .json backup file.");
          }
        });

      container
        .querySelector("#cloudPushSavesBtn")
        .addEventListener("click", function () {
          hooks.pushGameSavesToCloud(collectGameSavesObject());
        });

      container
        .querySelector("#cloudPullSavesBtn")
        .addEventListener("click", async function () {
          await hooks.pullGameSavesFromCloud();
          renderStoragePage(container);
        });

      container.querySelectorAll("[data-del-ls]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          localStorage.removeItem(btn.getAttribute("data-del-ls"));
          renderStoragePage(container);
        });
      });
    }

    function renderLiveEditor(container) {
      var savedCode =
        localStorage.getItem("ibossbad.editor.v1") ||
        "<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: system-ui, sans-serif; background: #0f172a; color: #38bdf8; display: grid; place-items: center; height: 90vh; margin: 0; }\n  </style>\n</head>\n<body>\n  <h1>Ibossbad Live Playground</h1>\n  <script>\n    console.log('Ready!');\n  </script>\n</body>\n</html>";

      container.innerHTML =
        '<div class="internal-wrap" style="max-width:1200px">' +
        '<div class="games-header-bar"><div><h1>Live HTML / CSS / JS Playground</h1>' +
        "<p>Test code snippets, bookmarklets, or mini web apps right inside the browser.</p></div>" +
        '<div style="display:flex;gap:8px">' +
        '<button type="button" class="btn btn-primary" id="runEditorBtn">Run Preview</button>' +
        '<button type="button" class="btn btn-secondary" id="popoutEditorBtn">Open in blob: Tab</button>' +
        "</div></div>" +
        '<div class="editor-split">' +
        '<textarea id="liveEditorTextarea" class="field-input code-area editor-pane">' +
        esc(savedCode) +
        "</textarea>" +
        '<iframe id="liveEditorFrame" class="editor-preview-frame" sandbox="allow-scripts allow-modals allow-forms"></iframe>' +
        "</div></div>";

      var area = container.querySelector("#liveEditorTextarea");
      var frame = container.querySelector("#liveEditorFrame");
      function updatePreview() {
        var val = area.value;
        try {
          localStorage.setItem("ibossbad.editor.v1", val);
        } catch (_e) {}
        frame.srcdoc = val;
      }
      updatePreview();

      container
        .querySelector("#runEditorBtn")
        .addEventListener("click", updatePreview);
      container
        .querySelector("#popoutEditorBtn")
        .addEventListener("click", function () {
          var bUrl = URL.createObjectURL(
            new Blob([area.value], { type: "text/html" })
          );
          window.open(bUrl, "_blank");
        });
    }

    function render(url, container) {
      var clean = String(url || "")
        .toLowerCase()
        .trim();
      if (clean === "iboss://games") {
        renderGamesHub(container);
        return true;
      }
      if (clean === "iboss://store") {
        renderStorePage(container);
        return true;
      }
      if (clean === "iboss://media" && hooks.mediaEmulator) {
        hooks.mediaEmulator.renderMediaPage(container);
        return true;
      }
      if (clean === "iboss://emulator" && hooks.mediaEmulator) {
        hooks.mediaEmulator.renderEmulatorPage(container);
        return true;
      }
      if (clean === "iboss://downloads" && hooks.mediaEmulator) {
        hooks.mediaEmulator.renderDownloaderPage(container);
        return true;
      }
      if (clean === "iboss://desktop" && hooks.mediaEmulator) {
        hooks.mediaEmulator.renderDesktopMode(container);
        return true;
      }
      if (clean === "iboss://diagnostics" && hooks.diagnosticsTools) {
        hooks.diagnosticsTools.renderDiagnosticsPage(container);
        return true;
      }
      if (clean === "iboss://history" && hooks.diagnosticsTools) {
        hooks.diagnosticsTools.renderHistoryAndWorkspacesPage(container);
        return true;
      }
      if (clean === "iboss://tools" && hooks.diagnosticsTools) {
        hooks.diagnosticsTools.renderToolsPage(container);
        return true;
      }
      if (clean === "iboss://extensions") {
        renderExtensionsPage(container);
        return true;
      }
      if (clean === "iboss://storage") {
        renderStoragePage(container);
        return true;
      }
      if (clean === "iboss://editor") {
        renderLiveEditor(container);
        return true;
      }
      if (clean === "iboss://changelog" || clean === "iboss://version") {
        renderChangelog(container);
        return true;
      }
      if (clean === "iboss://urls" || clean === "iboss://about") {
        renderUrlDirectory(container);
        return true;
      }
      return false;
    }

    return {
      render: render,
      collectGameSavesObject: collectGameSavesObject,
    };
  }

  window.IbossInternalPages = {
    create: createInternalPagesController,
  };
})(window);
