"use strict";

(function (window) {
  function esc(str) {
    return String(str === undefined || str === null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function createInternalPagesController(hooks) {
    var activeGameCategory = "all";
    var activeGameQuery = "";

    function renderUrlDirectory(container) {
      var pages = [
        {
          url: "iboss://newtab",
          title: "New Tab Dashboard",
          desc: "Search omnibox, quick launch cards, clock & saved bookmarks.",
        },
        {
          url: "iboss://games",
          title: "Games & Apps Library (180+)",
          desc:
            "Full MonkeyGG2 HTML5 + Ruffle Flash lineup & web apps with aliases.",
        },
        {
          url: "iboss://extensions",
          title: "Extensions (.zip) & Mods",
          desc:
            "Install Zinc-compatible .zip extensions, FPS HUD & userscripts.",
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
          url: "iboss://settings",
          title: "Settings, Themes & Shortcuts",
          desc:
            "Configure engine, WISP relays, custom colors, particles & hotkeys.",
        },
        {
          url: "iboss://changelog",
          title: "Version & Changelog",
          desc: "See what's new in Ibossbad v3.0.",
        },
        {
          url: "iboss://admin",
          title: "Admin Command Center",
          desc:
            "Live online users, remote controls, IP bans, access logs, 12h keys & roles.",
        },
      ];

      container.innerHTML =
        '<div class="internal-wrap">' +
        '<div class="internal-hero"><h1>Internal <code>iboss://</code> Pages</h1>' +
        "<p>Built-in browser pages inspired by Chrome &amp; Zinc — type any URL below into the address bar or click to open.</p></div>" +
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
        '<div class="internal-hero"><h1>Ibossbad v3.0 Changelog</h1>' +
        "<p>Scramjet + BareMux WASM TLS + MonkeyGG2 + Zinc + Admin Command Center</p></div>" +
        '<div class="changelog-list">' +
        '<div class="internal-panel"><h3>v3.0 — Flagship Browser, 180+ Games &amp; Admin Suite</h3>' +
        "<ul>" +
        "<li>Added full <strong>180+ MonkeyGG2 HTML5 &amp; Flash Games</strong> catalog with search aliases, categories &amp; game request inbox.</li>" +
        "<li>Added <strong>Zinc-style <code>iboss://</code> internal URLs</strong>, <code>.zip</code> Extension Importer (IndexedDB), <code>javascript:</code> bookmarklets, Live Code Editor &amp; Game-Save Cloud Sync.</li>" +
        "<li>Added <strong>Admin Command Center (<code>iboss://admin</code>)</strong>: Live connected users, remote redirect/freeze/popup, Global Teacher Panic Mass-Cloak, IP bans, access history, 12h LootLabs keys, VIP/Mod roles, Discord webhooks &amp; domain policies.</li>" +
        "<li>Added <strong>Stealth v2</strong>: Camouflage Study-App Front Door, Google Docs Boss-Key Decoy Overlay, Auto-Cloak on Tab Switch, Split-Screen Dual Tabs, Floating Mini-Window (PiP), Per-Tab Mute &amp; Chromebook RAM Saver.</li>" +
        "<li>Locked Cloud Account sign-up/sign-in behind the active Proxy Passcode / 12h Key.</li>" +
        "</ul></div>" +
        '<div class="internal-panel"><h3>v2.0 — Scramjet Service-Worker Engine</h3>' +
        "<ul><li>Integrated <code>@mercuryworkshop/scramjet</code> + <code>@mercuryworkshop/bare-mux</code> (Libcurl &amp; Epoxy WASM TLS) with automatic SW-free GUST Blob WISP fallback.</li></ul></div>" +
        "</div></div>";
    }

    function renderGamesHub(container) {
      var customGames = hooks.getCustomGames ? hooks.getCustomGames() : [];
      var cats = window.IbossGamesCatalog
        ? window.IbossGamesCatalog.categories
        : [];
      var results = window.IbossGamesCatalog
        ? window.IbossGamesCatalog.search(
            activeGameQuery,
            activeGameCategory,
            customGames
          )
        : [];

      container.innerHTML =
        '<div class="internal-wrap">' +
        '<div class="games-header-bar">' +
        "<div><h1>Games &amp; Apps Hub</h1>" +
        "<p>180+ real HTML5, WebGL, EaglerCraft &amp; Ruffle Flash titles — launched over Scramjet + WISP.</p></div>" +
        '<div class="games-header-actions">' +
        '<button type="button" class="btn btn-secondary" id="openGameReqModalBtn">+ Request Game / Report Broken</button>' +
        "</div></div>" +
        '<div class="games-toolbar">' +
        '<input type="text" id="gamesSearchInput" class="field-input games-search-input" placeholder="Search 180+ games &amp; aliases (e.g. btd5, mc, 1v1, slope, retro bowl, fnf)..." value="' +
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
            return (
              '<div class="game-tile">' +
              '<div class="game-tile-top">' +
              '<div class="game-tile-badge">' +
              esc(initials || "GM") +
              "</div>" +
              '<span class="game-cat-tag">' +
              esc(g.category) +
              "</span></div>" +
              '<div class="game-tile-title">' +
              esc(g.title) +
              "</div>" +
              '<div class="game-tile-actions">' +
              '<button type="button" class="btn btn-primary btn-xs" data-play-url="' +
              esc(g.url) +
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

      container.querySelectorAll("[data-play-url]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          hooks.openInNewTab(btn.getAttribute("data-play-url"));
        });
      });

      container.querySelectorAll("[data-pip-url]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          hooks.openMiniPlayer(
            btn.getAttribute("data-pip-url"),
            btn.getAttribute("data-pip-title")
          );
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
        '<div class="internal-hero"><h1>Extensions &amp; Built-In Mods</h1>' +
        "<p>Install Zinc-compatible <code>.zip</code> extensions (<code>manifest.json</code>) or toggle built-in userscripts &amp; FPS HUD.</p></div>" +
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
        // Never export sensitive auth tokens
        if (k === "ibossbad.supabase.v1") continue;
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
        "<p>Export, import, or sync your game progress (Infinite Craft, 2048, Cookie Clicker, etc.) across devices.</p></div>" +
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
              if (k !== "ibossbad.supabase.v1" && typeof map[k] === "string") {
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
