"use strict";

(function (window) {
  var FAV_GAMES_KEY = "ibossbad_fav_games_v1";
  var RECENT_GAMES_KEY = "ibossbad_recent_games_v1";
  var HIDDEN_GAMES_KEY = "ibossbad_hidden_games_v1";

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
    var activeGameSort = "featured";
    var gameCoverSourcesPromise = null;

    function loadGameCoverSources() {
      if (!gameCoverSourcesPromise) {
        gameCoverSourcesPromise = fetch("/ui/assets/game-covers/sources.json")
          .then(function (response) {
            if (!response.ok)
              throw new Error("Cover source manifest unavailable");
            return response.json();
          })
          .then(function (manifest) {
            return manifest && manifest.assets ? manifest.assets : {};
          })
          .catch(function () {
            gameCoverSourcesPromise = null;
            return {};
          });
      }
      return gameCoverSourcesPromise;
    }

    // Launchpad Pomodoro & Procedural WebAudio Synth state
    var LP_TASKS_KEY = "ibossbad.launchpadTasks.v1";
    var LP_STATS_KEY = "ibossbad.launchpadStats.v1";
    var lpModeSec = 25 * 60;
    var lpRemainingSec = 25 * 60;
    var lpRunning = false;
    var lpTimerId = null;
    var lpAmbientCtx = null;
    var lpAmbientSource = null;
    var lpAmbientGain = null;
    var lpAmbientMode = "off"; // "off" | "brown" | "rain" | "drone"
    var lpAmbientVol = 0.35;

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
            "Favorites, Recently Played, self-mirrored HTML5 + Ruffle Flash lineup.",
        },
        {
          url: "iboss://jojo",
          title: "JoJo's Bizarre Adventure: Heritage for the Future",
          desc:
            "CPS-3 Arcade (Japan 990927 No-CD) inside a Closed Shadow stage with cloaked perceived links.",
        },
        {
          url: "iboss://cinecloud",
          title: "Cine-Cloud OS (106 AAA PC Cloud Games)",
          desc:
            "Cyberpunk 2077, GTA V, Elden Ring, Poppy Playtime, Gamepad nav & 9 particle modes.",
        },
        {
          url: "iboss://launchpad",
          title: "Focus & Study Launchpad",
          desc:
            "Pomodoro timer, priority task checklist & procedural WebAudio ambient focus mixer.",
        },
        {
          url: "iboss://servers",
          title: "Unblocked Server Finder",
          desc:
            "Binary WISP v1/v2 handshake scanner across 21+ stealth relays & CDN mirrors.",
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
        '<div class="internal-hero"><h1>Ibossbad v9.0 Changelog</h1>' +
        "<p>Protocol-Smart WISP v1/v2 · Focus Launchpad · Smart Omnibox Math &amp; !Bangs · Cine-Cloud &amp; Arcade Refurbishment</p></div>" +
        '<div class="changelog-list">' +
        '<div class="internal-panel" style="margin-bottom:14px"><h3>v9.0 — Protocol-Smart WISP v1/v2, Focus Launchpad, Smart Omnibox &amp; UI Refurbishment</h3>' +
        "<ul>" +
        "<li>Added <strong>Automatic WISP v1 / WISP v2 Transport Matching</strong> (<code>libcurl</code> on WISP v1 + <code>epoxy</code> on WISP v2 stealth relays) and eliminated background server-swapping loops.</li>" +
        "<li>Added <strong><code>iboss://launchpad</code> Focus &amp; Study Workspace</strong>: Pomodoro timer with WebAudio chimes, persistent priority task board, and procedural WebAudio ambient mixer (Brown Noise, Rain, Deep Space Drone).</li>" +
        "<li>Added <strong>Smart Omnibox Instant Math &amp; <code>!bang</code> Shortcuts</strong> (<code>!yt</code>, <code>!wiki</code>, <code>!gh</code>, <code>!reddit</code>, <code>!brave</code>, <code>!ddg</code>, <code>!g</code>), <code>Alt+1..9</code> quick tab switching, and 4 new curated themes (<em>Cyberpunk Neon</em>, <em>Aurora Borealis</em>, <em>OLED Pitch Black</em>, <em>Sakura Dusk</em>).</li>" +
        "<li>Added <strong>Lockdown-Safe 👑 Admin Gate Tab</strong>, Default Admin Password security warning banner, LRU-memoized WHATWG URL parser (zero ESLint warnings), and LIFO keep-alive TLS session pooling.</li>" +
        "</ul></div>" +
        '<div class="internal-panel" style="margin-bottom:14px"><h3>v8.0 — Cine-Cloud OS (106 PC Cloud Games), Unblocked Server Finder &amp; Self-Healing Game Mirror</h3>' +
        "<ul>" +
        "<li>Added <strong><code>iboss://cinecloud</code> (Cine-Cloud OS V1.5)</strong>: 106 AAA PC Cloud Games (<em>Cyberpunk 2077</em>, <em>GTA V</em>, <em>Elden Ring</em>, <em>Poppy Playtime</em>, <em>F1 22</em>), proxied Steam box art, playtime tracker, Gamepad spatial navigation, and 9 interactive particle modes.</li>" +
        "<li>Added <strong><code>iboss://servers</code> (Opium-Style Unblocked Server Finder)</strong>: Authentic binary WISP v1/v2 stream handshake scanner across 21+ stealth relays &amp; 7 CDN mirrors, plus live toolbar ping status and 1-click fastest server switch.</li>" +
        "<li>Added <strong><code>/mgg-games/</code> Direct Game Mirror &amp; Smart Scramjet Auto-Recovery</strong>: Permanently fixes broken upstream CNAME redirects (Slope &amp; all 190+ HTML5/Flash games) and eliminates raw Scramjet/Chromium iframe crash pages with automatic relay failover.</li>" +
        "</ul></div>" +
        '<div class="internal-panel" style="margin-bottom:14px"><h3>v7.0 — Visual Artwork, Illustrated Game Covers, Wallpapers &amp; Flagship GUI Overhaul</h3>' +
        "<ul>" +
        "<li>Added <strong>10 Bespoke HD Artwork Banners &amp; Switchable Wallpapers</strong> (<em>Cosmic Nebula</em>, <em>Liquid Sapphire</em>, <em>Neon City</em>, <em>Minimal Dark</em>) across New Tab, Auth Gate, Games, Media, Emulator &amp; WebOS Desktop.</li>" +
        "<li>Added <strong>Local WebP cover files for 207 game-catalog entries</strong> with poster rendering; cover attribution and redistribution-rights verification remains incomplete.</li>" +
        "<li>Added <strong>New Tab Visual Bento Showcase</strong>, crisp vector brand icons across Quick Launch, Bookmarks, Tabs &amp; Omnibox, and animated audio equalizer bars in <code>iboss://media</code>.</li>" +
        "</ul></div>" +
        '<div class="internal-panel" style="margin-bottom:14px"><h3>v6.0 — Turbo Speed Engine &amp; Chromebook Optimization Suite</h3>' +
        "<ul>" +
        "<li>Added <strong>In-Memory Brotli / Gzip Static &amp; WASM Compression</strong> + <code>immutable</code> V8 Tier-2 Wasm machine-code caching headers (~75% smaller cold loads on school Wi-Fi).</li>" +
        "<li>Added <strong>Normalized 120 MB Byte-Capped LRU Game &amp; Asset Cache (<code>ibossbad-scramjet-v1</code>)</strong> in <code>sw.js</code> with full <code>Range</code> bypass and core WASM install precache.</li>" +
        "<li>Added <strong><code>TCP_NODELAY</code> + <code>perMessageDeflate: false</code></strong> on <code>/wisp/</code> &amp; <code>/proxy/</code>, tuned WISP 512-packet flow window + IPv4-first 8,192-slot DNS cache with in-flight deduplication.</li>" +
        "<li>Added <strong>Parallel Zero-Stall Engine Boot</strong>, <strong>260+ Host O(1) Domain-Suffix Shield</strong>, <strong>Single-Flight Hover Pre-Warming</strong>, <strong>Background Tab 1fps <code>rAF</code> Throttling</strong>, and <strong>Isolated <code>SharedArrayBuffer</code> Emulator Sandbox</strong>.</li>" +
        "</ul></div>" +
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
      var hiddenUrls = loadStringList(HIDDEN_GAMES_KEY);
      var recentList = loadJsonList(RECENT_GAMES_KEY).filter(function (game) {
        return game && hiddenUrls.indexOf(game.url) === -1;
      });
      var baseCats = window.IbossGamesCatalog
        ? window.IbossGamesCatalog.categories
        : [];
      var allCatalog = window.IbossGamesCatalog
        ? window.IbossGamesCatalog.search("", "all", customGames)
        : [];
      var hiddenCatalogCount = allCatalog.filter(function (item) {
        return hiddenUrls.indexOf(item.url) !== -1;
      }).length;
      var favoriteCatalogCount = allCatalog.filter(function (item) {
        return (
          favUrls.indexOf(item.url) !== -1 &&
          hiddenUrls.indexOf(item.url) === -1
        );
      }).length;
      var catCounts = {};
      allCatalog.forEach(function (item) {
        if (hiddenUrls.indexOf(item.url) !== -1) return;
        catCounts[item.category] = (catCounts[item.category] || 0) + 1;
      });

      var cats = [
        {
          id: "all",
          label: "All Games (" + (allCatalog.length - hiddenCatalogCount) + ")",
        },
        {
          id: "favorites",
          label: "★ Favorites (" + favoriteCatalogCount + ")",
        },
        { id: "hidden", label: "Hidden (" + hiddenCatalogCount + ")" },
      ].concat(
        baseCats.slice(1).map(function (bc) {
          var cnt = catCounts[bc.id] || 0;
          return {
            id: bc.id,
            label: bc.label + (cnt ? " (" + cnt + ")" : ""),
          };
        })
      );

      var results;
      if (activeGameCategory === "hidden") {
        results = window.IbossGamesCatalog
          ? window.IbossGamesCatalog.search(activeGameQuery, "all", customGames)
          : [];
        results = results.filter(function (g) {
          return hiddenUrls.indexOf(g.url) !== -1;
        });
      } else if (activeGameCategory === "favorites") {
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
      if (activeGameCategory !== "hidden") {
        results = results.filter(function (g) {
          return hiddenUrls.indexOf(g.url) === -1;
        });
      }

      if (activeGameSort === "az") {
        results = results.slice().sort(function (a, b) {
          return String(a.title || "").localeCompare(String(b.title || ""));
        });
      } else if (activeGameSort === "category") {
        results = results.slice().sort(function (a, b) {
          return (
            String(a.category || "").localeCompare(String(b.category || "")) ||
            String(a.title || "").localeCompare(String(b.title || ""))
          );
        });
      }

      var pads = navigator.getGamepads
        ? Array.from(navigator.getGamepads()).filter(Boolean)
        : [];

      container.innerHTML =
        '<div class="internal-wrap">' +
        '<div class="hub-visual-hero">' +
        '<img src="/ui/assets/banner-games.jpg" alt="" class="hub-hero-bg" />' +
        '<div class="hub-hero-scrim"></div>' +
        '<div class="hub-hero-body">' +
        "<div>" +
        '<span class="bento-kicker">🎮 207+ HTML5, WebGL &amp; Ruffle Flash Titles · Instant SW Cache</span>' +
        "<h1>Games &amp; Apps Arcade</h1>" +
        "<p>Open game details, keep favorites, hide titles you do not want, or launch a floating mini-window.</p>" +
        "</div>" +
        '<div class="games-header-actions" style="display:flex;gap:8px;flex-wrap:wrap">' +
        (pads.length
          ? '<span class="cat-pill active">🎮 Gamepad Ready</span>'
          : "") +
        '<button type="button" class="btn btn-primary" id="surpriseGameBtn">🎲 Surprise Me</button>' +
        '<button type="button" class="btn btn-secondary" id="jumpEmulatorBtn">🕹️ Retro ROM Player</button>' +
        '<button type="button" class="btn btn-secondary" id="openGameReqModalBtn">+ Request / Report</button>' +
        "</div></div></div>" +
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
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<input type="text" id="gamesSearchInput" class="field-input games-search-input" style="flex:1;min-width:220px" placeholder="Search 200+ games &amp; aliases (e.g. btd5, mc, 1v1, slope, retro bowl, fnf)..." value="' +
        esc(activeGameQuery) +
        '" />' +
        '<select id="gamesSortSelect" class="field-select" style="width:auto;min-width:155px" aria-label="Sort games">' +
        '<option value="featured"' +
        (activeGameSort === "featured" ? " selected" : "") +
        ">Sort: Featured</option>" +
        '<option value="az"' +
        (activeGameSort === "az" ? " selected" : "") +
        ">Sort: A → Z</option>" +
        '<option value="category"' +
        (activeGameSort === "category" ? " selected" : "") +
        ">Sort: By Genre</option>" +
        "</select></div>" +
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
        (results.length
          ? ""
          : '<div class="games-empty-state" role="status">' +
            (activeGameCategory === "hidden"
              ? "No games are hidden. Use Hide on a title to keep it out of your library."
              : "No games match the current search or filters.") +
            "</div>") +
        '<div class="games-catalog-grid" id="gamesCatalogGrid">' +
        results
          .map(function (g) {
            var isFav = favUrls.indexOf(g.url) !== -1;
            var isHidden = hiddenUrls.indexOf(g.url) !== -1;
            var grad = CAT_GRADIENTS[g.category] || CAT_GRADIENTS.featured;
            var art =
              window.IbossVisualArt && window.IbossVisualArt.getGameCoverMeta
                ? window.IbossVisualArt.getGameCoverMeta(g)
                : null;
            return (
              '<div class="game-tile" data-prewarm-url="' +
              esc(g.url) +
              '">' +
              '<div class="game-cover-banner" style="background:' +
              grad +
              '">' +
              (art
                ? '<img src="' +
                  esc(art.photo) +
                  '" alt="' +
                  esc(g.title + " cover art") +
                  '" loading="lazy" class="game-cover-photo' +
                  (art.hasGameCover ? " game-cover-photo-real" : "") +
                  '"' +
                  (art.hasGameCover
                    ? ""
                    : ' style="filter:hue-rotate(' +
                      art.hueShift +
                      'deg) saturate(1.15)"') +
                  " />" +
                  '<div class="game-cover-scrim' +
                  (art.hasGameCover ? " game-cover-scrim-real" : "") +
                  '"></div>' +
                  (art.hasGameCover
                    ? ""
                    : '<svg viewBox="0 0 64 64" class="game-cover-glyph" aria-hidden="true">' +
                      art.glyphSvg +
                      "</svg>")
                : "") +
              '<span class="game-cover-cat-pill">' +
              esc(g.category) +
              "</span>" +
              '<button type="button" class="game-hover-play" data-play-url="' +
              esc(g.url) +
              '" data-play-title="' +
              esc(g.title) +
              '"><span>▶ Play</span></button>' +
              '<button type="button" class="game-fav-btn' +
              (isFav ? " fav-on" : "") +
              '" data-fav-url="' +
              esc(g.url) +
              '" title="Favorite">' +
              (isFav ? "★" : "☆") +
              "</button></div>" +
              '<div class="game-tile-title">' +
              esc(g.title) +
              "</div>" +
              '<div class="game-tile-actions">' +
              '<button type="button" class="btn btn-ghost btn-xs" data-game-details-url="' +
              esc(g.url) +
              '" aria-label="Details for ' +
              esc(g.title) +
              '" aria-expanded="false">Info</button>' +
              '<button type="button" class="btn btn-ghost btn-xs" data-hide-url="' +
              esc(g.url) +
              '" title="' +
              (isHidden ? "Show this game in the catalog" : "Hide this game") +
              '">' +
              (isHidden ? "Unhide" : "Hide") +
              '</button><button type="button" class="btn btn-primary btn-xs" data-play-url="' +
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
        "</div>" +
        '<div id="gameDetailsBackdrop" class="game-detail-backdrop hidden" aria-hidden="true">' +
        '<aside class="game-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="gameDetailsTitle">' +
        '<header class="game-detail-drawer-header"><div><span id="gameDetailsCategory" class="game-detail-category"></span><h2 id="gameDetailsTitle">Game details</h2></div>' +
        '<button type="button" id="gameDetailsCloseBtn" class="icon-btn" aria-label="Close game details">✕</button></header>' +
        '<div id="gameDetailsBody" class="game-detail-drawer-body" aria-live="polite"></div>' +
        '<footer class="game-detail-drawer-footer"><button type="button" id="gameDetailsPlayBtn" class="btn btn-primary" disabled>Play game</button></footer>' +
        "</aside></div></div>";

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

      var sortEl = container.querySelector("#gamesSortSelect");
      if (sortEl) {
        sortEl.addEventListener("change", function () {
          activeGameSort = sortEl.value;
          renderGamesHub(container);
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

      container.querySelectorAll("[data-hide-url]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var url = btn.getAttribute("data-hide-url");
          var hidden = loadStringList(HIDDEN_GAMES_KEY);
          var index = hidden.indexOf(url);
          if (index === -1) hidden.push(url);
          else hidden.splice(index, 1);
          saveStringList(HIDDEN_GAMES_KEY, hidden);
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

      var detailsBackdrop = container.querySelector("#gameDetailsBackdrop");
      var detailsCloseButton = container.querySelector("#gameDetailsCloseBtn");
      var detailsTitle = container.querySelector("#gameDetailsTitle");
      var detailsCategory = container.querySelector("#gameDetailsCategory");
      var detailsBody = container.querySelector("#gameDetailsBody");
      var detailsPlayButton = container.querySelector("#gameDetailsPlayBtn");
      var activeDetailsGame = null;
      var lastDetailsTrigger = null;

      function closeGameDetails() {
        if (detailsBackdrop) {
          detailsBackdrop.classList.add("hidden");
          detailsBackdrop.setAttribute("aria-hidden", "true");
        }
        if (lastDetailsTrigger) {
          lastDetailsTrigger.setAttribute("aria-expanded", "false");
          lastDetailsTrigger.textContent = "Info";
          lastDetailsTrigger.focus();
          lastDetailsTrigger = null;
        }
        activeDetailsGame = null;
      }

      if (detailsCloseButton) {
        detailsCloseButton.addEventListener("click", closeGameDetails);
      }
      if (detailsBackdrop) {
        detailsBackdrop.addEventListener("click", function (event) {
          if (event.target === detailsBackdrop) closeGameDetails();
        });
        detailsBackdrop.addEventListener("keydown", function (event) {
          if (event.key === "Escape") closeGameDetails();
        });
      }
      if (detailsPlayButton) {
        detailsPlayButton.addEventListener("click", function () {
          if (!activeDetailsGame) return;
          recordRecentGame(activeDetailsGame.url, activeDetailsGame.title);
          hooks.openInNewTab(activeDetailsGame.url);
        });
      }

      container
        .querySelectorAll("[data-game-details-url]")
        .forEach(function (btn) {
          btn.addEventListener("click", function () {
            var url = btn.getAttribute("data-game-details-url");
            var game = window.IbossGamesCatalog.builtin
              .concat(customGames)
              .filter(function (item) {
                return item.url === url;
              })[0];
            if (!game || !detailsBackdrop || !detailsTitle || !detailsBody) {
              return;
            }
            if (
              activeDetailsGame &&
              activeDetailsGame.url === game.url &&
              !detailsBackdrop.classList.contains("hidden")
            ) {
              closeGameDetails();
              return;
            }
            if (lastDetailsTrigger && lastDetailsTrigger !== btn) {
              lastDetailsTrigger.setAttribute("aria-expanded", "false");
              lastDetailsTrigger.textContent = "Info";
            }
            activeDetailsGame = game;
            lastDetailsTrigger = btn;
            btn.setAttribute("aria-expanded", "true");
            btn.textContent = "Close";
            detailsTitle.textContent = game.title;
            detailsCategory.textContent = game.category || "Uncategorized";
            detailsBody.innerHTML =
              '<p class="game-detail-loading">Loading game details…</p>';
            if (detailsPlayButton) detailsPlayButton.disabled = false;
            detailsBackdrop.classList.remove("hidden");
            detailsBackdrop.setAttribute("aria-hidden", "false");
            if (detailsCloseButton) detailsCloseButton.focus();

            loadGameCoverSources().then(function (assets) {
              if (activeDetailsGame !== game) return;
              var source =
                assets[game.cover ? game.cover.split("/").pop() : ""];
              var sourceLink = source && source.sourcePage;
              var rights = source && source.rightsStatus;
              var sourceMarkup = sourceLink
                ? '<p class="game-detail-source">Cover source: <a href="' +
                  esc(sourceLink) +
                  '" target="_blank" rel="noopener noreferrer">View source</a>' +
                  (rights ? " · Rights: " + esc(rights) : "") +
                  "</p>"
                : '<p class="game-detail-source">Cover source and usage rights have not been verified.</p>';
              var art =
                window.IbossVisualArt && window.IbossVisualArt.getGameCoverMeta
                  ? window.IbossVisualArt.getGameCoverMeta(game)
                  : null;
              var coverMarkup =
                art && art.photo
                  ? '<img class="game-detail-drawer-cover" src="' +
                    esc(art.photo) +
                    '" alt="' +
                    esc(game.title + " cover art") +
                    '" />'
                  : "";
              var gameDescription = game.description
                ? "<p>" + esc(game.description) + "</p>"
                : '<p class="game-detail-empty">No game description is available yet.</p>';
              var inputInfo = game.inputs
                ? "<p><strong>Inputs:</strong> " + esc(game.inputs) + "</p>"
                : "";
              var playerInfo = game.playerCount
                ? "<p><strong>Players:</strong> " +
                  esc(game.playerCount) +
                  "</p>"
                : "";
              detailsBody.innerHTML =
                coverMarkup +
                gameDescription +
                inputInfo +
                playerInfo +
                sourceMarkup;
            });
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

    function playCompletionChime() {
      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        var ctx = new AudioCtx();
        [523.25, 659.25, 783.99, 1046.5].forEach(function (freq, idx) {
          var osc = ctx.createOscillator();
          var g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          g.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.12);
          g.gain.exponentialRampToValueAtTime(
            0.18,
            ctx.currentTime + idx * 0.12 + 0.04
          );
          g.gain.exponentialRampToValueAtTime(
            0.0001,
            ctx.currentTime + idx * 0.12 + 0.55
          );
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.12);
          osc.stop(ctx.currentTime + idx * 0.12 + 0.6);
        });
      } catch (_e) {}
    }

    function stopAmbientAudio() {
      if (lpAmbientSource) {
        try {
          if (typeof lpAmbientSource.stop === "function")
            lpAmbientSource.stop();
          if (typeof lpAmbientSource.disconnect === "function")
            lpAmbientSource.disconnect();
        } catch (_e) {}
        lpAmbientSource = null;
      }
      lpAmbientMode = "off";
    }

    function startAmbientAudio(mode) {
      stopAmbientAudio();
      if (mode === "off") return;
      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!lpAmbientCtx) lpAmbientCtx = new AudioCtx();
        if (lpAmbientCtx.state === "suspended") {
          lpAmbientCtx.resume().catch(function () {});
        }
        lpAmbientGain = lpAmbientCtx.createGain();
        lpAmbientGain.gain.value = lpAmbientVol;
        lpAmbientGain.connect(lpAmbientCtx.destination);

        if (mode === "drone") {
          var osc1 = lpAmbientCtx.createOscillator();
          var osc2 = lpAmbientCtx.createOscillator();
          osc1.type = "sine";
          osc2.type = "triangle";
          osc1.frequency.value = 108;
          osc2.frequency.value = 162;
          var subGain = lpAmbientCtx.createGain();
          subGain.gain.value = 0.25;
          osc1.connect(subGain);
          osc2.connect(subGain);
          subGain.connect(lpAmbientGain);
          osc1.start();
          osc2.start();
          lpAmbientSource = {
            stop: function () {
              osc1.stop();
              osc2.stop();
            },
            disconnect: function () {
              subGain.disconnect();
            },
          };
        } else {
          var bufLen = lpAmbientCtx.sampleRate * 3;
          var buf = lpAmbientCtx.createBuffer(
            1,
            bufLen,
            lpAmbientCtx.sampleRate
          );
          var out = buf.getChannelData(0);
          var lastOut = 0;
          for (var i = 0; i < bufLen; i++) {
            var white = Math.random() * 2 - 1;
            if (mode === "brown") {
              out[i] = (lastOut + 0.02 * white) / 1.02;
              lastOut = out[i];
              out[i] *= 3.2;
            } else {
              out[i] = white * 0.45;
            }
          }
          var noise = lpAmbientCtx.createBufferSource();
          noise.buffer = buf;
          noise.loop = true;
          var filter = lpAmbientCtx.createBiquadFilter();
          filter.type = mode === "rain" ? "bandpass" : "lowpass";
          filter.frequency.value = mode === "rain" ? 1100 : 420;
          noise.connect(filter);
          filter.connect(lpAmbientGain);
          noise.start();
          lpAmbientSource = noise;
        }
        lpAmbientMode = mode;
      } catch (_e) {}
    }

    function formatTimerMmSs(sec) {
      var s = Math.max(0, Math.floor(sec));
      var m = Math.floor(s / 60);
      var rem = s % 60;
      return String(m).padStart(2, "0") + ":" + String(rem).padStart(2, "0");
    }

    function renderLaunchpadPage(container) {
      var tasks = loadJsonList(LP_TASKS_KEY);
      var stats = { sessions: 0, focusMinutes: 0 };
      try {
        var rawStats = localStorage.getItem(LP_STATS_KEY);
        if (rawStats) stats = Object.assign(stats, JSON.parse(rawStats));
      } catch (_e) {}

      var doneCount = tasks.filter(function (t) {
        return t && t.done;
      }).length;

      container.innerHTML =
        '<div class="internal-wrap">' +
        '<div class="hub-visual-hero">' +
        '<img src="/ui/assets/banner-cybercity.jpg" alt="" class="hub-hero-bg" />' +
        '<div class="hub-hero-scrim"></div>' +
        '<div class="hub-hero-body">' +
        "<div>" +
        '<span class="bento-kicker">⏱️ Productivity · Study · Procedural Focus Audio</span>' +
        "<h1>Focus &amp; Study Launchpad</h1>" +
        "<p>Pomodoro sprint timer, persistent task checklist, and zero-bandwidth WebAudio focus soundscapes.</p>" +
        "</div>" +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<span class="cat-pill active">🔥 ' +
        (stats.sessions || 0) +
        " Sessions · " +
        (stats.focusMinutes || 0) +
        "m Focused</span>" +
        '<button type="button" class="btn btn-secondary" id="lpJumpToolsBtn">🧮 Codec &amp; Math Tools</button>' +
        "</div></div></div>" +
        '<div class="internal-grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));align-items:start">' +
        // Card 1: Pomodoro Timer
        '<div class="internal-panel">' +
        "<h3>⏳ Pomodoro Sprint Timer</h3>" +
        '<div class="cat-pills" style="margin:10px 0 14px">' +
        [
          { sec: 1500, label: "25m Focus" },
          { sec: 3000, label: "50m Deep" },
          { sec: 300, label: "5m Break" },
          { sec: 900, label: "15m Break" },
        ]
          .map(function (p) {
            return (
              '<button type="button" class="cat-pill' +
              (lpModeSec === p.sec ? " active" : "") +
              '" data-lp-preset="' +
              p.sec +
              '">' +
              p.label +
              "</button>"
            );
          })
          .join("") +
        "</div>" +
        '<div id="lpClockReadout" style="font-size:52px;font-weight:800;letter-spacing:2px;text-align:center;padding:18px 0;font-variant-numeric:tabular-nums;color:var(--accent)">' +
        formatTimerMmSs(lpRemainingSec) +
        "</div>" +
        '<div style="display:flex;gap:8px;justify-content:center">' +
        '<button type="button" class="btn btn-primary" id="lpStartPauseBtn">' +
        (lpRunning ? "⏸ Pause" : "▶ Start Timer") +
        "</button>" +
        '<button type="button" class="btn btn-secondary" id="lpResetBtn">↺ Reset</button>' +
        "</div>" +
        "</div>" +
        // Card 2: Procedural WebAudio Ambient Mixer
        '<div class="internal-panel">' +
        "<h3>🎧 Procedural Focus Soundscape</h3>" +
        '<p class="settings-desc">Synthesized directly via WebAudio — zero network traffic and works offline.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">' +
        [
          { id: "off", label: "🔇 Off" },
          { id: "brown", label: "🌊 Warm Brown Noise" },
          { id: "rain", label: "🌧️ Soft Rain" },
          { id: "drone", label: "🪐 Space Drone" },
        ]
          .map(function (m) {
            return (
              '<button type="button" class="btn ' +
              (lpAmbientMode === m.id ? "btn-primary" : "btn-secondary") +
              ' btn-xs" data-lp-amb="' +
              m.id +
              '">' +
              m.label +
              "</button>"
            );
          })
          .join("") +
        "</div>" +
        '<label class="field-label" for="lpAmbVolRange" style="margin-top:10px">Ambient Volume (' +
        Math.round(lpAmbientVol * 100) +
        "%)</label>" +
        '<input id="lpAmbVolRange" type="range" min="5" max="100" value="' +
        Math.round(lpAmbientVol * 100) +
        '" style="width:100%" />' +
        "</div>" +
        // Card 3: Quick Tasks Checklist
        '<div class="internal-panel" style="grid-column:1 / -1">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">' +
        "<h3>✅ Session Task Board (" +
        doneCount +
        "/" +
        tasks.length +
        " Completed)</h3>" +
        (doneCount > 0
          ? '<button type="button" class="btn btn-ghost btn-xs" id="lpClearDoneBtn">Clear Completed</button>'
          : "") +
        "</div>" +
        '<form id="lpAddTaskForm" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">' +
        '<input id="lpTaskInput" type="text" class="field-input" style="flex:1;min-width:200px" placeholder="Add an assignment, goal, or reminder..." required />' +
        '<select id="lpTaskPrio" class="field-select" style="width:auto">' +
        '<option value="high">🔥 High</option>' +
        '<option value="normal" selected>⚡ Normal</option>' +
        '<option value="chill">🌿 Chill</option>' +
        "</select>" +
        '<button type="submit" class="btn btn-primary">+ Add Task</button>' +
        "</form>" +
        (tasks.length === 0
          ? '<div class="empty-bookmarks">No tasks yet — add your next study sprint or goal above.</div>'
          : '<div style="display:flex;flex-direction:column;gap:8px">' +
            tasks
              .map(function (t, idx) {
                var badge =
                  t.prio === "high"
                    ? "🔥 High"
                    : t.prio === "chill"
                    ? "🌿 Chill"
                    : "⚡ Normal";
                return (
                  '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(15,23,42,0.55);border:1px solid var(--border)">' +
                  '<input type="checkbox" data-lp-toggle="' +
                  idx +
                  '"' +
                  (t.done ? " checked" : "") +
                  ' style="width:17px;height:17px;cursor:pointer" />' +
                  '<span style="flex:1;' +
                  (t.done
                    ? "text-decoration:line-through;opacity:0.55"
                    : "font-weight:500") +
                  '">' +
                  esc(t.text) +
                  "</span>" +
                  '<span class="game-cat-tag">' +
                  badge +
                  "</span>" +
                  '<button type="button" class="btn btn-ghost btn-xs" data-lp-del="' +
                  idx +
                  '" aria-label="Delete task">✕</button>' +
                  "</div>"
                );
              })
              .join("") +
            "</div>") +
        "</div></div></div>";

      function syncReadout() {
        var el = container.querySelector("#lpClockReadout");
        var btn = container.querySelector("#lpStartPauseBtn");
        if (el) el.textContent = formatTimerMmSs(lpRemainingSec);
        if (btn) btn.textContent = lpRunning ? "⏸ Pause" : "▶ Start Timer";
      }

      container
        .querySelector("#lpJumpToolsBtn")
        .addEventListener("click", function () {
          hooks.navigate("iboss://tools");
        });

      container.querySelectorAll("[data-lp-preset]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          lpModeSec = Number(btn.getAttribute("data-lp-preset")) || 1500;
          lpRemainingSec = lpModeSec;
          lpRunning = false;
          if (lpTimerId) {
            clearInterval(lpTimerId);
            lpTimerId = null;
          }
          renderLaunchpadPage(container);
        });
      });

      container
        .querySelector("#lpStartPauseBtn")
        .addEventListener("click", function () {
          lpRunning = !lpRunning;
          if (lpRunning) {
            if (lpTimerId) clearInterval(lpTimerId);
            lpTimerId = setInterval(function () {
              if (!lpRunning) return;
              lpRemainingSec = Math.max(0, lpRemainingSec - 1);
              syncReadout();
              if (lpRemainingSec <= 0) {
                lpRunning = false;
                clearInterval(lpTimerId);
                lpTimerId = null;
                playCompletionChime();
                if (lpModeSec >= 1200) {
                  stats.sessions = (stats.sessions || 0) + 1;
                  stats.focusMinutes =
                    (stats.focusMinutes || 0) + Math.round(lpModeSec / 60);
                  try {
                    localStorage.setItem(LP_STATS_KEY, JSON.stringify(stats));
                  } catch (_e) {}
                }
                lpRemainingSec = lpModeSec;
                if (hooks.toast) {
                  hooks.toast("🎉 Sprint complete! Take a breather.");
                }
                if (container.isConnected) renderLaunchpadPage(container);
              }
            }, 1000);
          } else if (lpTimerId) {
            clearInterval(lpTimerId);
            lpTimerId = null;
          }
          syncReadout();
        });

      container
        .querySelector("#lpResetBtn")
        .addEventListener("click", function () {
          lpRunning = false;
          if (lpTimerId) {
            clearInterval(lpTimerId);
            lpTimerId = null;
          }
          lpRemainingSec = lpModeSec;
          syncReadout();
        });

      container.querySelectorAll("[data-lp-amb]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          startAmbientAudio(btn.getAttribute("data-lp-amb"));
          renderLaunchpadPage(container);
        });
      });

      var volRange = container.querySelector("#lpAmbVolRange");
      if (volRange) {
        volRange.addEventListener("input", function () {
          lpAmbientVol = Math.max(0.05, Number(volRange.value || 35) / 100);
          if (lpAmbientGain) {
            lpAmbientGain.gain.value = lpAmbientVol;
          }
        });
      }

      container
        .querySelector("#lpAddTaskForm")
        .addEventListener("submit", function (ev) {
          ev.preventDefault();
          var inp = container.querySelector("#lpTaskInput");
          var prio = container.querySelector("#lpTaskPrio");
          var txt = (inp && inp.value ? inp.value : "").trim();
          if (!txt) return;
          tasks.unshift({
            text: txt,
            prio: (prio && prio.value) || "normal",
            done: false,
            ts: Date.now(),
          });
          saveStringList(LP_TASKS_KEY, tasks.slice(0, 80));
          renderLaunchpadPage(container);
        });

      container.querySelectorAll("[data-lp-toggle]").forEach(function (chk) {
        chk.addEventListener("change", function () {
          var idx = Number(chk.getAttribute("data-lp-toggle"));
          if (tasks[idx]) {
            tasks[idx].done = Boolean(chk.checked);
            saveStringList(LP_TASKS_KEY, tasks);
            renderLaunchpadPage(container);
          }
        });
      });

      container.querySelectorAll("[data-lp-del]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var idx = Number(btn.getAttribute("data-lp-del"));
          tasks.splice(idx, 1);
          saveStringList(LP_TASKS_KEY, tasks);
          renderLaunchpadPage(container);
        });
      });

      var clearBtn = container.querySelector("#lpClearDoneBtn");
      if (clearBtn) {
        clearBtn.addEventListener("click", function () {
          tasks = tasks.filter(function (t) {
            return t && !t.done;
          });
          saveStringList(LP_TASKS_KEY, tasks);
          renderLaunchpadPage(container);
        });
      }
    }

    var JOJO_HFTF_UPSTREAM_URL =
      "https://www.retrogames.cc/embed/8843-jojos-bizarre-adventure%3A-heritage-for-the-future-jojo-no-kimyou-na-bouken%3A-mirai-e-no-isan-japan-990927-no-cd.html";

    function renderJojoArcadePage(container) {
      recordRecentGame(
        "iboss://jojo",
        "JoJo's Bizarre Adventure: Heritage for the Future"
      );

      var activeMode = "scramjet";
      var aspect43 = true;

      container.innerHTML =
        '<div class="internal-wrap" style="max-width:1160px">' +
        '<div class="games-header-bar" style="flex-wrap:wrap;gap:12px">' +
        "<div>" +
        '<div style="display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin-bottom:4px">' +
        "<span>⭐ Capcom CPS-3 Arcade · Japan 990927 No-CD</span>" +
        '<span style="opacity:.6">•</span>' +
        '<span id="jojoPerceivedBadge">Perceived Link: Cloaked (/lesson-media/unit-8843)</span>' +
        "</div>" +
        '<h1 style="margin:0;font-size:22px">JoJo\'s Bizarre Adventure: Heritage for the Future</h1>' +
        '<p style="margin:4px 0 0;opacity:.78;font-size:13px">Mounted inside a Closed Shadow stage with zero raw external iframe URLs — full <code>cross-origin-isolated</code> WASM &amp; gamepad support.</p>' +
        "</div>" +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
        '<button type="button" class="btn btn-primary" id="jojoFullscreenBtn">⛶ Fullscreen</button>' +
        '<button type="button" class="btn btn-secondary" id="jojoModeToggleBtn">🌐 Switch to Direct Stealth Stream</button>' +
        '<button type="button" class="btn btn-secondary" id="jojoAspectBtn">🖥️ Stretch 16:9</button>' +
        '<button type="button" class="btn btn-secondary" id="jojoBlankPopoutBtn">🕵️ Zero-URL Popout</button>' +
        '<button type="button" class="btn btn-secondary" id="jojoReloadBtn">↻ Reload</button>' +
        "</div></div>" +
        '<div id="jojoStageOuter" style="margin-top:14px;background:#050811;border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:12px;box-shadow:0 20px 50px rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;min-height:480px">' +
        '<div id="jojoShadowHost" style="width:100%;max-width:760px;aspect-ratio:4/3;border-radius:10px;overflow:hidden;background:#000;position:relative"></div>' +
        "</div>" +
        '<details style="margin-top:14px;background:var(--bg-surface);border:1px solid rgba(255,255,255,0.09);border-radius:12px;padding:12px 16px">' +
        '<summary style="cursor:pointer;font-weight:700;font-size:13.5px">🕹️ CPS-3 Stand Controls, Move List &amp; Offline ROM Option</summary>' +
        '<div style="margin-top:10px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;font-size:12.5px;line-height:1.55;opacity:.9">' +
        "<div><strong>Core Arcade Layout (6-Button / 4-Button CPS-3)</strong><br/>• Insert Coin: <code>Shift / Select</code> · Start: <code>Enter</code><br/>• Light / Medium / Heavy Attack + <strong>Stand ON/OFF</strong> button<br/>• Click inside the stage once so keyboard &amp; USB/Bluetooth controllers lock focus.</div>" +
        "<div><strong>Signature Specials</strong><br/>• <strong>Jotaro (Star Platinum)</strong>: <code>↓↘→ + Atk</code> (Ora Ora!) · <code>→↓↘ + Atk</code> (Mach Ora) · Time Stop: <code>→ Medium, Light, →, Stand</code><br/>• <strong>DIO (The World)</strong>: <code>↓↘→ + Atk</code> (Muda Muda!) · Road Roller: <code>↓↙← + AA</code> (Stand OFF)</div>" +
        '<div><strong>Offline Local CPS-3 ROM</strong><br/>Already have <code>jojobanr1.zip</code> or <code>jojoba.zip</code> on your device? Open <button type="button" class="btn btn-secondary" id="jojoOpenLocalEmuBtn" style="padding:2px 8px;font-size:11.5px">iboss://emulator</button> and select <strong>Arcade (FinalBurn Neo)</strong> for 100% offline play.</div>' +
        "</div></details>" +
        "</div>";

      var hostEl = container.querySelector("#jojoShadowHost");
      var badgeEl = container.querySelector("#jojoPerceivedBadge");
      var modeBtn = container.querySelector("#jojoModeToggleBtn");
      var aspectBtn = container.querySelector("#jojoAspectBtn");

      // Closed Shadow DOM hides the internal viewport element from outer document.querySelectorAll('iframe') scanners
      var shadowRoot =
        hostEl && typeof hostEl.attachShadow === "function"
          ? hostEl.attachShadow({ mode: "closed" })
          : hostEl;

      var innerFrame = null;

      function mountPlayer(mode) {
        activeMode = mode;
        if (!shadowRoot) return;
        shadowRoot.innerHTML = "";

        var styleEl = document.createElement("style");
        styleEl.textContent =
          ":host{display:block;width:100%;height:100%;background:#000}" +
          ".stage-surface{width:100%;height:100%;border:0;display:block;background:#000}";
        shadowRoot.appendChild(styleEl);

        innerFrame = document.createElement("iframe");
        innerFrame.className = "stage-surface";
        innerFrame.setAttribute("frameborder", "0");
        innerFrame.setAttribute("scrolling", "no");
        innerFrame.setAttribute("allowfullscreen", "true");
        innerFrame.setAttribute("webkitallowfullscreen", "true");
        innerFrame.setAttribute("mozallowfullscreen", "true");
        innerFrame.setAttribute(
          "allow",
          "fullscreen; autoplay; clipboard-read; clipboard-write; gamepad; cross-origin-isolated"
        );
        shadowRoot.appendChild(innerFrame);

        if (typeof hooks.mountStealthEmbed === "function") {
          hooks.mountStealthEmbed(
            innerFrame,
            JOJO_HFTF_UPSTREAM_URL,
            mode,
            function (perceivedUrl, resolvedMode) {
              activeMode = resolvedMode || mode;
              if (badgeEl) {
                var shortLink =
                  perceivedUrl && perceivedUrl.length > 44
                    ? perceivedUrl.slice(0, 44) + "…"
                    : perceivedUrl || "/lesson-media/unit-8843";
                badgeEl.textContent =
                  "Perceived Link: " + shortLink + " · Closed Shadow";
              }
              if (modeBtn) {
                modeBtn.textContent =
                  activeMode === "stream"
                    ? "⚡ Switch to WISP Stealth Tunnel"
                    : "🌐 Switch to Direct Stealth Stream";
              }
            }
          );
        } else {
          innerFrame.src = "/lesson-media/unit-8843";
          if (badgeEl) {
            badgeEl.textContent =
              "Perceived Link: /lesson-media/unit-8843 · Closed Shadow";
          }
        }
      }

      mountPlayer("scramjet");

      if (modeBtn) {
        modeBtn.addEventListener("click", function () {
          var nextMode = activeMode === "scramjet" ? "stream" : "scramjet";
          mountPlayer(nextMode);
          if (hooks.toast) {
            hooks.toast(
              nextMode === "stream"
                ? "Switched to Direct Stealth Stream (/lesson-media/unit-8843)"
                : "Switched to WISP Stealth Tunnel"
            );
          }
        });
      }

      if (aspectBtn && hostEl) {
        aspectBtn.addEventListener("click", function () {
          aspect43 = !aspect43;
          if (aspect43) {
            hostEl.style.maxWidth = "760px";
            hostEl.style.aspectRatio = "4 / 3";
            aspectBtn.textContent = "🖥️ Stretch 16:9";
          } else {
            hostEl.style.maxWidth = "100%";
            hostEl.style.aspectRatio = "16 / 9";
            aspectBtn.textContent = "📺 4:3 Original (600×450)";
          }
        });
      }

      var fsBtn = container.querySelector("#jojoFullscreenBtn");
      if (fsBtn && hostEl) {
        fsBtn.addEventListener("click", function () {
          var target = hostEl;
          if (target.requestFullscreen) {
            target.requestFullscreen().catch(function () {});
          } else if (target.webkitRequestFullscreen) {
            target.webkitRequestFullscreen();
          }
        });
      }

      var reloadBtn = container.querySelector("#jojoReloadBtn");
      if (reloadBtn) {
        reloadBtn.addEventListener("click", function () {
          mountPlayer(activeMode);
          if (hooks.toast) hooks.toast("Reloading JoJo CPS-3 stage...");
        });
      }

      var popBtn = container.querySelector("#jojoBlankPopoutBtn");
      if (popBtn) {
        popBtn.addEventListener("click", function () {
          var win = window.open("about:blank", "_blank");
          if (!win || !win.document) {
            if (hooks.toast) {
              hooks.toast("Allow popups to open Zero-URL about:blank window.");
            }
            return;
          }
          var origin = window.location.origin;
          var stealthSrc = origin + "/lesson-media/unit-8843";
          win.document.open();
          win.document.write(
            '<!DOCTYPE html><html><head><meta charset="utf-8">' +
              "<title>Unit 8 — Cultural Heritage Study</title>" +
              "<style>html,body,#host{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden}</style>" +
              '</head><body><div id="host"></div><script>' +
              "(function(){var h=document.getElementById('host');" +
              "var r=h.attachShadow?h.attachShadow({mode:'closed'}):h;" +
              "var f=document.createElement('iframe');" +
              "f.style.cssText='width:100%;height:100%;border:0;display:block;background:#000';" +
              "f.setAttribute('allowfullscreen','true');" +
              "f.setAttribute('allow','fullscreen; autoplay; gamepad; cross-origin-isolated');" +
              "f.src=" +
              JSON.stringify(stealthSrc) +
              ";r.appendChild(f);})();" +
              "</script></body></html>"
          );
          win.document.close();
        });
      }

      var emuBtn = container.querySelector("#jojoOpenLocalEmuBtn");
      if (emuBtn && hooks.navigate) {
        emuBtn.addEventListener("click", function () {
          hooks.navigate("iboss://emulator");
        });
      }
    }

    function render(url, container) {
      var clean = String(url || "")
        .toLowerCase()
        .trim();
      if (clean === "iboss://games") {
        renderGamesHub(container);
        return true;
      }
      if (
        clean === "iboss://jojo" ||
        clean === "iboss://hftf" ||
        clean === "iboss://jjba"
      ) {
        renderJojoArcadePage(container);
        return true;
      }
      if (clean === "iboss://launchpad" || clean === "iboss://focus") {
        renderLaunchpadPage(container);
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
      if (clean === "iboss://desktop") {
        if (hooks.navigate) hooks.navigate("iboss://newtab");
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
      if (
        (clean === "iboss://cinecloud" || clean === "iboss://cloud") &&
        window.IbossCineCloud
      ) {
        window.IbossCineCloud.renderCineCloudPage(container, {
          openUrl: hooks.openUrl,
          openPip: hooks.openPip,
          buildProxyFrameUrl: hooks.buildProxyFrameUrl,
          toast: hooks.toast,
        });
        return true;
      }
      if (
        (clean === "iboss://servers" || clean === "iboss://finder") &&
        window.IbossServerFinder
      ) {
        window.IbossServerFinder.renderServerFinderPage(container, {
          publicConfig: hooks.getPublicConfig ? hooks.getPublicConfig() : null,
          getActiveWispUrl: hooks.getActiveWispUrl,
          onSelectWispServer: hooks.onSelectWispServer,
          toast: hooks.toast,
        });
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
