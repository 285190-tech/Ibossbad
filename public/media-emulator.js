"use strict";

(function (window) {
  function esc(str) {
    return String(str === undefined || str === null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var RADIO_STATIONS = [
    {
      id: "groovesalad",
      name: "Chill / Lofi Beats (SomaFM Groove Salad)",
      url: "https://ice2.somafm.com/groovesalad-128-mp3",
    },
    {
      id: "defcon",
      name: "Electronic / Hacker Focus (SomaFM DEF CON)",
      url: "https://ice2.somafm.com/defcon-128-mp3",
    },
    {
      id: "dronezone",
      name: "Deep Ambient Study (SomaFM Drone Zone)",
      url: "https://ice2.somafm.com/dronezone-128-mp3",
    },
    {
      id: "nightride",
      name: "Synthwave / Outrun (Nightride FM)",
      url: "https://stream.nightride.fm/nightride.m4a",
    },
    {
      id: "lush",
      name: "Mellow Vocal Chill (SomaFM Lush)",
      url: "https://ice2.somafm.com/lush-128-mp3",
    },
  ];

  var MEDIA_APPS = [
    {
      title: "Invidious (Ad-Free YouTube)",
      url: "https://inv.nadeko.net/",
      cat: "Video",
      badge: "IV",
    },
    {
      title: "YouTube",
      url: "https://www.youtube.com/",
      cat: "Video",
      badge: "YT",
    },
    {
      title: "Twitch",
      url: "https://www.twitch.tv/",
      cat: "Live",
      badge: "TW",
    },
    {
      title: "Kick",
      url: "https://kick.com/",
      cat: "Live",
      badge: "KK",
    },
    {
      title: "SoundCloud",
      url: "https://soundcloud.com/discover",
      cat: "Music",
      badge: "SC",
    },
    {
      title: "Spotify Web",
      url: "https://open.spotify.com/",
      cat: "Music",
      badge: "SP",
    },
    {
      title: "Pluto TV (Free Live TV & Movies)",
      url: "https://pluto.tv/",
      cat: "Movies/TV",
      badge: "PT",
    },
    {
      title: "Tubi (Free Movies & Shows)",
      url: "https://tubitv.com/",
      cat: "Movies/TV",
      badge: "TB",
    },
    {
      title: "Internet Archive Movies",
      url: "https://archive.org/details/moviesandfilms",
      cat: "Movies/TV",
      badge: "IA",
    },
    {
      title: "Radio Garden (World Radio Globe)",
      url: "https://radio.garden/",
      cat: "Music",
      badge: "RG",
    },
    {
      title: "MyRetroTVs (90s/00s TV Simulator)",
      url: "https://www.myretrotvs.com/",
      cat: "Retro TV",
      badge: "TV",
    },
    {
      title: "Wikimedia Commons Media",
      url: "https://commons.wikimedia.org/",
      cat: "Media",
      badge: "WM",
    },
  ];

  var EMULATOR_CORES = [
    { id: "auto", label: "Auto-Detect from File Extension" },
    { id: "gba", label: "Game Boy Advance (.gba)" },
    { id: "nds", label: "Nintendo DS (.nds)" },
    { id: "nes", label: "NES / Famicom (.nes)" },
    { id: "snes", label: "Super Nintendo (.sfc / .smc)" },
    { id: "n64", label: "Nintendo 64 (.z64 / .n64 / .v64)" },
    { id: "gb", label: "Game Boy / Color (.gb / .gbc)" },
    { id: "segaMD", label: "Sega Genesis / Mega Drive (.md / .gen / .bin)" },
    { id: "segaMS", label: "Sega Master System / Game Gear (.sms / .gg)" },
    { id: "psx", label: "PlayStation 1 (.bin / .iso / .pbp)" },
  ];

  function extractYoutubeId(input) {
    var s = String(input || "").trim();
    var m =
      s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/) ||
      (/^[A-Za-z0-9_-]{11}$/.test(s) ? [s, s] : null);
    return m ? m[1] : null;
  }

  function detectCoreFromFilename(name) {
    var lower = String(name || "").toLowerCase();
    if (lower.endsWith(".gba")) return "gba";
    if (lower.endsWith(".nds")) return "nds";
    if (lower.endsWith(".nes")) return "nes";
    if (lower.endsWith(".sfc") || lower.endsWith(".smc")) return "snes";
    if (
      lower.endsWith(".z64") ||
      lower.endsWith(".n64") ||
      lower.endsWith(".v64")
    ) {
      return "n64";
    }
    if (lower.endsWith(".gb") || lower.endsWith(".gbc")) return "gb";
    if (lower.endsWith(".md") || lower.endsWith(".gen")) return "segaMD";
    if (lower.endsWith(".sms") || lower.endsWith(".gg")) return "segaMS";
    if (lower.endsWith(".pbp") || lower.endsWith(".cue")) return "psx";
    return "gba";
  }

  function createMediaEmulatorController(hooks) {
    // Persistent Background Audio Player
    var bgAudio = new Audio();
    bgAudio.crossOrigin = "anonymous";
    var currentStationTitle = "";
    var isBgPlaying = false;

    function syncRadioMiniBar() {
      var bar = document.getElementById("radioMiniBar");
      var lbl = document.getElementById("radioNowPlaying");
      var toggleBtn = document.getElementById("radioPlayPauseBtn");
      if (!bar) return;
      if (!currentStationTitle) {
        bar.classList.add("hidden");
        return;
      }
      bar.classList.remove("hidden");
      if (lbl) lbl.textContent = "🎵 " + currentStationTitle;
      if (toggleBtn) toggleBtn.textContent = isBgPlaying ? "Pause" : "Play";
    }

    function playRadioStream(url, title) {
      try {
        bgAudio.src = url;
        currentStationTitle = title || "Background Audio";
        bgAudio
          .play()
          .then(function () {
            isBgPlaying = true;
            syncRadioMiniBar();
            hooks.toast("Playing: " + currentStationTitle);
          })
          .catch(function () {
            // If direct stream blocked by school firewall, fallback through /proxy/
            bgAudio.src = "/proxy/" + url;
            bgAudio
              .play()
              .then(function () {
                isBgPlaying = true;
                syncRadioMiniBar();
                hooks.toast("Playing via Proxy: " + currentStationTitle);
              })
              .catch(function () {
                isBgPlaying = false;
                syncRadioMiniBar();
                hooks.toast("Unable to start audio stream.");
              });
          });
      } catch (_e) {}
    }

    function toggleRadioPause(forcePause) {
      if (!currentStationTitle) return;
      if (forcePause === true || isBgPlaying) {
        bgAudio.pause();
        isBgPlaying = false;
      } else {
        bgAudio.play().catch(function () {});
        isBgPlaying = true;
      }
      syncRadioMiniBar();
    }

    function stopRadio() {
      bgAudio.pause();
      bgAudio.src = "";
      currentStationTitle = "";
      isBgPlaying = false;
      syncRadioMiniBar();
    }

    function renderMediaPage(container) {
      container.innerHTML =
        '<div class="internal-wrap">' +
        '<div class="internal-hero"><h1>Media, Ad-Free YouTube &amp; Radio Hub (<code>iboss://media</code>)</h1>' +
        "<p>Bypass YouTube bot-checks via privacy frontends, play persistent background study/gaming radio, or launch streaming apps.</p></div>" +
        '<div class="internal-panel" style="margin-bottom:18px">' +
        "<h3>Smart Ad-Free YouTube &amp; Video Launcher</h3>" +
        '<p class="settings-desc">Paste any YouTube link, video ID, or search query to watch ad-free without datacenter bot blocks.</p>' +
        '<div class="req-grid" style="margin-top:10px">' +
        '<input id="ytSmartInput" type="text" class="field-input" placeholder="Paste youtube.com/watch?v=... or search term..." style="grid-column:span 2" />' +
        '<select id="ytFrontendSelect" class="field-select">' +
        '<option value="nocookie">YouTube No-Cookie Embed (Fastest Video)</option>' +
        '<option value="invidious">Invidious Privacy Frontend (Search + Browse)</option>' +
        '<option value="piped">Piped Frontend</option>' +
        '<option value="direct">Direct YouTube via Scramjet</option>' +
        "</select>" +
        '<button type="button" class="btn btn-primary" id="ytLaunchTabBtn">Watch in Tab</button>' +
        '<button type="button" class="btn btn-secondary" id="ytLaunchPipBtn">Mini PiP</button>' +
        "</div></div>" +
        '<div class="internal-panel" style="margin-bottom:18px">' +
        "<h3>Persistent Background Radio &amp; Custom Stream Player</h3>" +
        '<p class="settings-desc">Keeps playing across all tabs and games — and automatically pauses when you hit your Boss Key.</p>' +
        '<div class="internal-grid" style="margin-top:12px">' +
        RADIO_STATIONS.map(function (st) {
          return (
            '<div class="internal-card" data-radio-url="' +
            esc(st.url) +
            '" data-radio-name="' +
            esc(st.name) +
            '">' +
            '<div class="internal-card-code">LIVE STREAM</div>' +
            "<h3>" +
            esc(st.name) +
            "</h3><p>Click to play in persistent mini-bar</p></div>"
          );
        }).join("") +
        "</div>" +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
        '<input id="customAudioUrlInput" type="text" class="field-input" placeholder="Or paste custom .mp3 / .m4a / Icecast radio stream URL..." style="flex:1;min-width:240px" />' +
        '<button type="button" class="btn btn-secondary" id="playCustomAudioBtn">Play Custom Audio</button>' +
        "</div></div>" +
        '<div class="section-header"><h2>Streaming, Live TV &amp; Music Web Apps</h2></div>' +
        '<div class="games-catalog-grid">' +
        MEDIA_APPS.map(function (m) {
          return (
            '<div class="game-tile">' +
            '<div class="game-tile-top"><div class="game-tile-badge">' +
            esc(m.badge) +
            '</div><span class="game-cat-tag">' +
            esc(m.cat) +
            "</span></div>" +
            '<div class="game-tile-title">' +
            esc(m.title) +
            "</div>" +
            '<div class="game-tile-actions">' +
            '<button type="button" class="btn btn-primary btn-xs" data-media-open="' +
            esc(m.url) +
            '">Open</button>' +
            '<button type="button" class="btn btn-secondary btn-xs" data-media-pip="' +
            esc(m.url) +
            '" data-media-title="' +
            esc(m.title) +
            '">Mini</button></div></div>'
          );
        }).join("") +
        "</div></div>";

      function resolveYtTarget() {
        var raw = container.querySelector("#ytSmartInput").value.trim();
        var mode = container.querySelector("#ytFrontendSelect").value;
        if (!raw) return null;
        var vid = extractYoutubeId(raw);
        if (mode === "nocookie") {
          if (vid) {
            return (
              "https://www.youtube-nocookie.com/embed/" + vid + "?autoplay=1"
            );
          }
          return "https://inv.nadeko.net/search?q=" + encodeURIComponent(raw);
        }
        if (mode === "invidious") {
          return vid
            ? "https://inv.nadeko.net/watch?v=" + vid
            : "https://inv.nadeko.net/search?q=" + encodeURIComponent(raw);
        }
        if (mode === "piped") {
          return vid
            ? "https://piped.video/watch?v=" + vid
            : "https://piped.video/results?search_query=" +
                encodeURIComponent(raw);
        }
        return vid
          ? "https://www.youtube.com/watch?v=" + vid
          : "https://www.youtube.com/results?search_query=" +
              encodeURIComponent(raw);
      }

      container
        .querySelector("#ytLaunchTabBtn")
        .addEventListener("click", function () {
          var u = resolveYtTarget();
          if (!u) {
            hooks.toast("Enter a YouTube link or search query.");
            return;
          }
          hooks.openInNewTab(u);
        });

      container
        .querySelector("#ytLaunchPipBtn")
        .addEventListener("click", function () {
          var u = resolveYtTarget();
          if (!u) {
            hooks.toast("Enter a YouTube link or search query.");
            return;
          }
          hooks.openMiniPlayer(u, "YouTube Player");
        });

      container.querySelectorAll("[data-radio-url]").forEach(function (card) {
        card.addEventListener("click", function () {
          playRadioStream(
            card.getAttribute("data-radio-url"),
            card.getAttribute("data-radio-name")
          );
        });
      });

      container
        .querySelector("#playCustomAudioBtn")
        .addEventListener("click", function () {
          var u = container.querySelector("#customAudioUrlInput").value.trim();
          if (u) playRadioStream(u, "Custom Stream");
        });

      container.querySelectorAll("[data-media-open]").forEach(function (b) {
        b.addEventListener("click", function () {
          hooks.openInNewTab(b.getAttribute("data-media-open"));
        });
      });
      container.querySelectorAll("[data-media-pip]").forEach(function (b) {
        b.addEventListener("click", function () {
          hooks.openMiniPlayer(
            b.getAttribute("data-media-pip"),
            b.getAttribute("data-media-title")
          );
        });
      });
    }

    function renderEmulatorPage(container) {
      var pads = navigator.getGamepads
        ? Array.from(navigator.getGamepads()).filter(Boolean)
        : [];
      var padLabel = pads.length
        ? "Controller Connected: " + pads[0].id.slice(0, 32)
        : "Keyboard Ready (Connect Xbox/PS/Switch controller anytime)";

      container.innerHTML =
        '<div class="internal-wrap" style="max-width:1160px">' +
        '<div class="games-header-bar"><div><h1>Retro EmulatorJS Player (<code>iboss://emulator</code>)</h1>' +
        "<p>Drop in any local GBA, NDS, NES, SNES, N64, GB/GBC, Genesis, or PS1 ROM from your device — powered by EmulatorJS.</p></div>" +
        '<div style="display:flex;gap:8px;align-items:center">' +
        '<span class="cat-pill">' +
        esc(padLabel) +
        "</span>" +
        '<button type="button" class="btn btn-secondary" id="emuSavesBtn">Save Manager</button>' +
        '<button type="button" class="btn btn-secondary" id="emuFullscreenBtn">Fullscreen</button>' +
        "</div></div>" +
        '<div class="internal-panel" style="margin-bottom:16px">' +
        '<div class="req-grid">' +
        '<input type="file" id="emuRomInput" class="field-input" accept=".gba,.nds,.nes,.sfc,.smc,.z64,.n64,.v64,.gb,.gbc,.md,.gen,.bin,.sms,.gg,.iso,.cue,.pbp,.zip" />' +
        '<select id="emuCoreSelect" class="field-select">' +
        EMULATOR_CORES.map(function (c) {
          return (
            '<option value="' + esc(c.id) + '">' + esc(c.label) + "</option>"
          );
        }).join("") +
        "</select>" +
        '<button type="button" class="btn btn-primary" id="emuLaunchBtn">Boot ROM</button>' +
        '<button type="button" class="btn btn-secondary" id="emuTurboIsolatedBtn" title="Open in isolated COOP/COEP window with SharedArrayBuffer multi-threading">⚡ Turbo Multi-Thread</button>' +
        "</div></div>" +
        '<div id="emuStageBox" class="emu-stage-box">' +
        '<div class="empty-bookmarks">Select a ROM file above and click <strong>Boot ROM</strong> to start playing.</div>' +
        "</div></div>";

      container
        .querySelector("#emuSavesBtn")
        .addEventListener("click", function () {
          hooks.navigate("iboss://storage");
        });

      container
        .querySelector("#emuFullscreenBtn")
        .addEventListener("click", function () {
          var box = container.querySelector("#emuStageBox");
          if (box && box.requestFullscreen) {
            box.requestFullscreen().catch(function () {});
          }
        });

      container
        .querySelector("#emuLaunchBtn")
        .addEventListener("click", function () {
          var fileInput = container.querySelector("#emuRomInput");
          var file = fileInput.files && fileInput.files[0];
          if (!file) {
            hooks.toast("Choose a ROM file from your device first.");
            return;
          }
          var selectedCore = container.querySelector("#emuCoreSelect").value;
          var core =
            selectedCore === "auto"
              ? detectCoreFromFilename(file.name)
              : selectedCore;
          var romBlobUrl = URL.createObjectURL(file);
          var cleanTitle = file.name.replace(/\.[^.]+$/, "");

          var emuHtml =
            '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body,#game{margin:0;padding:0;width:100%;height:100%;background:#050811;overflow:hidden}</style></head>' +
            '<body><div id="game"></div><script>' +
            "window.EJS_player = '#game';" +
            "window.EJS_core = " +
            JSON.stringify(core) +
            ";" +
            "window.EJS_gameName = " +
            JSON.stringify(cleanTitle) +
            ";" +
            "window.EJS_gameUrl = " +
            JSON.stringify(romBlobUrl) +
            ";" +
            "window.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/';" +
            "window.EJS_startOnLoaded = true;" +
            "</script>" +
            '<script src="https://cdn.emulatorjs.org/stable/data/loader.js"></script></body></html>';

          var stage = container.querySelector("#emuStageBox");
          stage.innerHTML = "";
          var frame = document.createElement("iframe");
          frame.className = "emu-iframe";
          frame.setAttribute("allow", "fullscreen; autoplay; gamepad");
          frame.src = URL.createObjectURL(
            new Blob([emuHtml], { type: "text/html" })
          );
          stage.appendChild(frame);
          hooks.toast(
            "Booting " + cleanTitle + " (" + core.toUpperCase() + ")"
          );
        });

      var turboBtn = container.querySelector("#emuTurboIsolatedBtn");
      if (turboBtn) {
        turboBtn.addEventListener("click", async function () {
          var fileInput = container.querySelector("#emuRomInput");
          var file = fileInput.files && fileInput.files[0];
          if (!file) {
            hooks.toast("Choose a ROM file from your device first.");
            return;
          }
          var selectedCore = container.querySelector("#emuCoreSelect").value;
          var core =
            selectedCore === "auto"
              ? detectCoreFromFilename(file.name)
              : selectedCore;
          var cleanTitle = file.name.replace(/\.[^.]+$/, "");
          var buf = await file.arrayBuffer();

          if (typeof BroadcastChannel !== "undefined") {
            var bc = new BroadcastChannel("ibossbad-emu-channel");
            var sent = false;
            var sendPayload = function () {
              if (sent) return;
              sent = true;
              bc.postMessage({
                type: "iboss-emu-boot",
                romBuffer: buf,
                core: core,
                title: cleanTitle,
              });
              setTimeout(function () {
                bc.close();
              }, 3000);
            };
            bc.onmessage = function (ev) {
              if (ev.data && ev.data.type === "iboss-emu-ready") {
                sendPayload();
              }
            };
            setTimeout(sendPayload, 1200);
          }
          window.open(
            "/emulator-sandbox",
            "_blank",
            "width=1024,height=720,menubar=no,toolbar=no"
          );
          hooks.toast(
            "Launched isolated SharedArrayBuffer emulator (" +
              core.toUpperCase() +
              ")"
          );
        });
      }
    }

    function renderDownloaderPage(container) {
      container.innerHTML =
        '<div class="internal-wrap" style="max-width:780px">' +
        '<div class="internal-hero"><h1>Safe-Filename Proxy Downloader (<code>iboss://downloads</code>)</h1>' +
        "<p>Stream remote files through the Ibossbad server with a custom school-safe filename so download history stays clean.</p></div>" +
        '<div class="internal-panel">' +
        '<label class="field-label">Direct File URL (http / https)</label>' +
        '<input id="dlSourceUrl" type="url" class="field-input" placeholder="https://example.com/archive.zip" />' +
        '<label class="field-label" style="margin-top:12px">Save As Clean Filename</label>' +
        '<input id="dlCleanName" type="text" class="field-input" placeholder="e.g. unit-5-reading-packet.pdf" />' +
        '<div style="margin-top:16px;display:flex;gap:10px;align-items:center">' +
        '<button type="button" class="btn btn-primary" id="startSafeDlBtn">Download via Proxy</button>' +
        '<span class="settings-desc">Protected by domain policy &amp; private-IP SSRF guard (100 MB max).</span>' +
        "</div></div></div>";

      container
        .querySelector("#startSafeDlBtn")
        .addEventListener("click", function () {
          var u = container.querySelector("#dlSourceUrl").value.trim();
          var fn = container.querySelector("#dlCleanName").value.trim();
          if (!u) {
            hooks.toast("Paste a file URL first.");
            return;
          }
          var href =
            "/api/safe-download?url=" +
            encodeURIComponent(u) +
            (fn ? "&filename=" + encodeURIComponent(fn) : "");
          var a = document.createElement("a");
          a.href = href;
          a.target = "_blank";
          document.body.appendChild(a);
          a.click();
          a.remove();
          hooks.toast("Started proxied download!");
        });
    }

    // Optional Terbium / Anura-Style Multi-Window WebOS Desktop Mode
    var desktopWinSeq = 1;
    var desktopZ = 20;

    function renderDesktopMode(container) {
      container.innerHTML =
        '<div class="webos-desktop" id="webosSurface">' +
        '<div class="webos-icons-col">' +
        '<button type="button" class="webos-desk-icon" data-os-app="browser"><span class="webos-glyph">🌐</span><span>Web Browser</span></button>' +
        '<button type="button" class="webos-desk-icon" data-os-app="games"><span class="webos-glyph">🎮</span><span>200+ Games</span></button>' +
        '<button type="button" class="webos-desk-icon" data-os-app="media"><span class="webos-glyph">🎵</span><span>Media &amp; YT</span></button>' +
        '<button type="button" class="webos-desk-icon" data-os-app="emulator"><span class="webos-glyph">🕹️</span><span>Retro ROMs</span></button>' +
        '<button type="button" class="webos-desk-icon" data-os-app="store"><span class="webos-glyph">🧩</span><span>Mod Store</span></button>' +
        '<button type="button" class="webos-desk-icon" data-os-app="terminal"><span class="webos-glyph">⌨️</span><span>Terminal</span></button>' +
        "</div>" +
        '<div id="webosWindowsLayer" class="webos-windows-layer"></div>' +
        '<footer class="webos-dock">' +
        '<button type="button" class="webos-dock-btn" data-os-app="browser" title="New Browser Window">🌐 Browser</button>' +
        '<button type="button" class="webos-dock-btn" data-os-app="games" title="Games Library">🎮 Games</button>' +
        '<button type="button" class="webos-dock-btn" data-os-app="media" title="Media & Radio">🎵 Media</button>' +
        '<button type="button" class="webos-dock-btn" data-os-app="emulator" title="EmulatorJS">🕹️ Emulator</button>' +
        '<button type="button" class="webos-dock-btn" data-os-app="editor" title="Code Playground">💻 Code</button>' +
        '<button type="button" class="webos-dock-btn" data-os-app="terminal" title="Shell">⌨️ Terminal</button>' +
        '<div style="flex:1"></div>' +
        '<span id="webosClock" class="webos-clock"></span>' +
        '<button type="button" class="webos-dock-btn" id="exitWebosBtn">Exit Desktop</button>' +
        "</footer></div>";

      var layer = container.querySelector("#webosWindowsLayer");
      var clockEl = container.querySelector("#webosClock");
      if (clockEl) {
        clockEl.textContent = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
      }

      function spawnOsWindow(kind) {
        var wid = "osw-" + desktopWinSeq++;
        var win = document.createElement("div");
        win.className = "webos-window";
        win.style.zIndex = String(++desktopZ);
        var offset = ((desktopWinSeq * 26) % 160) + 40;
        win.style.left = offset + 90 + "px";
        win.style.top = Math.max(20, offset - 10) + "px";

        var titleMap = {
          browser: "Stealth Web Window",
          games: "Games Quick Launcher",
          media: "YouTube & Radio Widget",
          emulator: "Retro EmulatorJS",
          store: "1-Click Mod Store",
          editor: "Scratchpad & HTML Runner",
          terminal: "Ibossbad WebOS Terminal",
        };

        win.innerHTML =
          '<div class="webos-win-bar">' +
          '<span class="webos-win-title">' +
          esc(titleMap[kind] || "Window") +
          "</span>" +
          '<div class="webos-win-btns">' +
          '<button type="button" class="webos-win-ctl" data-win-max="1">▢</button>' +
          '<button type="button" class="webos-win-ctl webos-close" data-win-close="1">✕</button>' +
          "</div></div>" +
          '<div class="webos-win-body"></div>';

        var body = win.querySelector(".webos-win-body");
        if (kind === "browser") {
          body.innerHTML =
            '<div style="display:flex;gap:6px;padding:8px;background:var(--bg-surface);border-bottom:1px solid var(--border-subtle)">' +
            '<input type="text" class="field-input os-url-in" placeholder="Enter URL (e.g. https://neal.fun or https://duckduckgo.com)..." value="https://neal.fun/" />' +
            '<button type="button" class="btn btn-primary btn-xs os-go-btn">Go</button></div>' +
            '<iframe class="os-frame" allow="fullscreen; autoplay; gamepad"></iframe>';
          var inp = body.querySelector(".os-url-in");
          var fr = body.querySelector(".os-frame");
          var go = function () {
            var target = hooks.resolveUrl(inp.value);
            if (target) hooks.loadIntoFrame(wid, fr, target);
          };
          body.querySelector(".os-go-btn").addEventListener("click", go);
          inp.addEventListener("keydown", function (e) {
            if (e.key === "Enter") go();
          });
          go();
        } else if (kind === "terminal") {
          body.innerHTML =
            '<div class="os-term-out" style="padding:12px;font-family:monospace;font-size:12px;color:#34d399;flex:1;overflow-y:auto">' +
            "<div>Ibossbad WebOS v4.0 — Type <strong>help</strong> for commands.</div></div>" +
            '<form class="os-term-form" style="display:flex;border-top:1px solid #1e293b;background:#050811">' +
            '<span style="padding:8px;color:#38bdf8;font-family:monospace">$</span>' +
            '<input type="text" class="os-term-in" style="flex:1;background:transparent;border:0;color:#f8fafc;font-family:monospace;outline:none" placeholder="help, games, open <url>, cloak, fps, clear..." /></form>';
          body.style.display = "flex";
          body.style.flexDirection = "column";
          body.style.background = "#050811";
          var out = body.querySelector(".os-term-out");
          var tf = body.querySelector(".os-term-form");
          var ti = body.querySelector(".os-term-in");
          tf.addEventListener("submit", function (ev) {
            ev.preventDefault();
            var cmd = ti.value.trim();
            ti.value = "";
            if (!cmd) return;
            var line = document.createElement("div");
            line.textContent = "$ " + cmd;
            out.appendChild(line);
            var rep = document.createElement("div");
            rep.style.color = "#cbd5e1";
            if (cmd === "help") {
              rep.textContent =
                "Commands: open <url> | games | media | admin | fps | clear | whoami";
            } else if (cmd === "clear") {
              out.innerHTML = "";
              return;
            } else if (cmd === "whoami") {
              rep.textContent = navigator.userAgent;
            } else if (cmd === "fps") {
              var m = window.IbossExtensions.loadMods();
              m.fpsOverlay = !m.fpsOverlay;
              window.IbossExtensions.saveMods(m);
              rep.textContent =
                "FPS HUD: " + (m.fpsOverlay ? "ENABLED" : "OFF");
            } else if (cmd === "games" || cmd === "media" || cmd === "admin") {
              hooks.navigate("iboss://" + cmd);
              return;
            } else if (cmd.indexOf("open ") === 0) {
              hooks.openInNewTab(cmd.slice(5).trim());
              rep.textContent = "Opened in browser tab.";
            } else {
              rep.textContent = "Unknown command: " + cmd;
            }
            out.appendChild(rep);
            out.scrollTop = out.scrollHeight;
          });
        } else if (kind === "games") {
          var sample = window.IbossGamesCatalog
            ? window.IbossGamesCatalog.getAll(hooks.getCustomGames()).slice(
                0,
                36
              )
            : [];
          body.style.overflowY = "auto";
          body.style.padding = "12px";
          body.innerHTML =
            '<div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">' +
            "<strong>Quick Launch Window</strong>" +
            '<button type="button" class="btn btn-secondary btn-xs" id="fullGamesJump">Full 200+ Hub</button></div>' +
            '<div class="games-catalog-grid">' +
            sample
              .map(function (g) {
                return (
                  '<div class="game-tile"><div class="game-tile-title">' +
                  esc(g.title) +
                  '</div><button type="button" class="btn btn-primary btn-xs" data-os-play="' +
                  esc(g.url) +
                  '">Launch Window</button></div>'
                );
              })
              .join("") +
            "</div>";
          body
            .querySelector("#fullGamesJump")
            .addEventListener("click", function () {
              hooks.navigate("iboss://games");
            });
          body.querySelectorAll("[data-os-play]").forEach(function (b) {
            b.addEventListener("click", function () {
              var u = b.getAttribute("data-os-play");
              body.style.padding = "0";
              body.innerHTML =
                '<iframe class="os-frame" allow="fullscreen; autoplay; gamepad"></iframe>';
              hooks.loadIntoFrame(wid, body.querySelector(".os-frame"), u);
            });
          });
        } else if (kind === "media") {
          body.style.overflowY = "auto";
          renderMediaPage(body);
        } else if (kind === "emulator") {
          body.style.overflowY = "auto";
          renderEmulatorPage(body);
        } else {
          hooks.navigate("iboss://" + kind);
          return;
        }

        win.addEventListener("mousedown", function () {
          win.style.zIndex = String(++desktopZ);
        });
        win
          .querySelector("[data-win-close]")
          .addEventListener("click", function () {
            win.remove();
          });
        win
          .querySelector("[data-win-max]")
          .addEventListener("click", function () {
            win.classList.toggle("maximized");
          });

        var bar = win.querySelector(".webos-win-bar");
        var drag = false;
        var sx = 0;
        var sy = 0;
        var ox = 0;
        var oy = 0;
        bar.addEventListener("mousedown", function (ev) {
          if (
            ev.target.tagName === "BUTTON" ||
            win.classList.contains("maximized")
          ) {
            return;
          }
          drag = true;
          sx = ev.clientX;
          sy = ev.clientY;
          ox = win.offsetLeft;
          oy = win.offsetTop;
        });
        window.addEventListener("mousemove", function (ev) {
          if (!drag) return;
          win.style.left = Math.max(0, ox + (ev.clientX - sx)) + "px";
          win.style.top = Math.max(0, oy + (ev.clientY - sy)) + "px";
        });
        window.addEventListener("mouseup", function () {
          drag = false;
        });

        layer.appendChild(win);
      }

      container.querySelectorAll("[data-os-app]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          spawnOsWindow(btn.getAttribute("data-os-app"));
        });
      });

      container
        .querySelector("#exitWebosBtn")
        .addEventListener("click", function () {
          hooks.navigate("iboss://newtab");
        });

      // Spawn a starter terminal or browser window immediately
      spawnOsWindow("browser");
    }

    return {
      renderMediaPage: renderMediaPage,
      renderEmulatorPage: renderEmulatorPage,
      renderDownloaderPage: renderDownloaderPage,
      renderDesktopMode: renderDesktopMode,
      toggleRadioPause: toggleRadioPause,
      stopRadio: stopRadio,
    };
  }

  window.IbossMediaEmulator = {
    create: createMediaEmulatorController,
  };
})(window);
