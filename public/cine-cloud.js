"use strict";

// Cine-Cloud OS V1.5 Native Hub (106 AAA PC Cloud Games, Controller Navigation, Playtime & 9 Particle Modes)
(function (window) {
  var STORE_KEY = "ibossbad.cineCloudStore.v1";
  var FAVS_KEY = "ibossbad.cineCloudFavs.v1";
  var PARTICLE_KEY = "ibossbad.particleMode.v1";
  var AUTH_READY_KEY = "ibossbad.cineCloudAuth.v1";

  function loadFavIds() {
    try {
      var arr = JSON.parse(window.localStorage.getItem(FAVS_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (_e) {
      return [];
    }
  }

  function saveFavIds(arr) {
    try {
      window.localStorage.setItem(FAVS_KEY, JSON.stringify(arr));
    } catch (_e) {}
  }

  var PARTICLE_MODES = [
    { id: "stars", label: "Stars", icon: "✦" },
    { id: "none", label: "None", icon: "⊘" },
    { id: "snow", label: "Snow", icon: "❄" },
    { id: "rain", label: "Rain", icon: "🌧" },
    { id: "cyber", label: "Cyber", icon: "⚡" },
    { id: "matrix", label: "Matrix", icon: "⌘" },
    { id: "bubbles", label: "Bubbles", icon: "◌" },
    { id: "fireflies", label: "Fireflies", icon: "✨" },
    { id: "nexus", label: "Nexus", icon: "🕸" },
  ];

  var activeParticleMode = "stars";
  try {
    var savedMode = window.localStorage.getItem(PARTICLE_KEY);
    if (savedMode) activeParticleMode = savedMode;
  } catch (_e) {}

  var particleEngineBooted = false;
  var particleItems = [];
  var mouseX = -999;
  var mouseY = -999;
  var playtimeTicker = null;
  var activeSessionGameId = null;

  function loadStore() {
    try {
      return JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch (_e) {
      return {};
    }
  }

  function saveStore(db) {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(db));
    } catch (_e) {}
  }

  function recordGamePlayStart(gameId) {
    var db = loadStore();
    if (!db[gameId]) db[gameId] = { t: 0, l: 0 };
    db[gameId].l = Date.now();
    saveStore(db);
    activeSessionGameId = gameId;
    if (!playtimeTicker) {
      playtimeTicker = setInterval(function () {
        if (!activeSessionGameId || document.hidden) return;
        var cur = loadStore();
        if (!cur[activeSessionGameId]) {
          cur[activeSessionGameId] = { t: 0, l: Date.now() };
        }
        cur[activeSessionGameId].t = (cur[activeSessionGameId].t || 0) + 5;
        cur[activeSessionGameId].l = Date.now();
        saveStore(cur);
      }, 5000);
    }
  }

  function stopGamePlaySession() {
    activeSessionGameId = null;
  }

  function formatShortPlaytime(secs) {
    if (!secs) return "0m";
    var h = Math.floor(secs / 3600);
    var m = Math.floor((secs % 3600) / 60);
    return h > 0 ? h + "h " + m + "m" : Math.max(1, m) + "m";
  }

  function formatHoverPlaytime(secs) {
    var s = secs || 0;
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    return (
      String(d).padStart(2, "0") +
      "d:" +
      String(h).padStart(2, "0") +
      "h:" +
      String(m).padStart(2, "0") +
      "m"
    );
  }

  function formatLastPlayed(ts) {
    if (!ts) return "Never";
    var diff = Date.now() - ts;
    if (diff < 86400000) return "Today";
    if (diff < 172800000) return "Yesterday";
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  function getProxiedArtUrl(rawUrl) {
    if (!rawUrl) return "/ui/assets/cat-action.jpg";
    if (rawUrl.indexOf("/") === 0) return rawUrl;
    return "/proxy/" + rawUrl;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // =========================================================================
  // Cine-Cloud 9-Mode Interactive Canvas Particle Engine (#particleCanvas)
  // =========================================================================
  function rebuildParticles(w, h) {
    particleItems = [];
    if (activeParticleMode === "none" || !w || !h) return;
    var count =
      activeParticleMode === "snow" ||
      activeParticleMode === "rain" ||
      activeParticleMode === "matrix"
        ? 68
        : activeParticleMode === "fireflies" || activeParticleMode === "nexus"
        ? 48
        : 40;

    for (var i = 0; i < count; i++) {
      var mode = activeParticleMode;
      particleItems.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r:
          mode === "snow"
            ? Math.random() * 2 + 1
            : mode === "stars"
            ? Math.random() * 1.6 + 0.6
            : mode === "bubbles"
            ? Math.random() * 4 + 2
            : mode === "fireflies"
            ? Math.random() * 2 + 1.5
            : 2,
        vy:
          mode === "snow"
            ? Math.random() * 1 + 0.45
            : mode === "rain"
            ? Math.random() * 13 + 9
            : mode === "matrix"
            ? Math.random() * 4 + 2
            : mode === "bubbles"
            ? -(Math.random() * 1.6 + 0.6)
            : mode === "fireflies"
            ? Math.random() * 1.4 - 0.7
            : mode === "nexus"
            ? Math.random() * 0.9 - 0.45
            : -(Math.random() * 0.35 + 0.1),
        vx:
          mode === "snow"
            ? Math.random() * 0.7 - 0.35
            : mode === "cyber"
            ? Math.random() * 5 + 2.5
            : mode === "bubbles"
            ? Math.random() * 0.8 - 0.4
            : mode === "fireflies"
            ? Math.random() * 1.4 - 0.7
            : mode === "nexus"
            ? Math.random() * 0.9 - 0.45
            : 0,
        len:
          mode === "rain"
            ? Math.random() * 18 + 10
            : mode === "cyber"
            ? Math.random() * 44 + 18
            : 0,
        alpha: Math.random() * 0.7 + 0.2,
        dAlpha: Math.random() * 0.018 + 0.006,
        ch: String.fromCharCode(0x30a0 + Math.floor(Math.random() * 96)),
      });
    }
  }

  function setParticleMode(mode) {
    activeParticleMode = mode || "none";
    try {
      window.localStorage.setItem(PARTICLE_KEY, activeParticleMode);
    } catch (_e) {}
    var canvas = document.getElementById("particleCanvas");
    if (canvas) {
      rebuildParticles(canvas.width, canvas.height);
    }
    return activeParticleMode;
  }

  function getParticleMode() {
    return activeParticleMode;
  }

  function initGlobalParticleEngine(shouldRenderFn) {
    if (particleEngineBooted) return;
    var canvas = document.getElementById("particleCanvas");
    if (!canvas || typeof canvas.getContext !== "function") return;
    particleEngineBooted = true;
    var ctx = canvas.getContext("2d");

    function syncSize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      rebuildParticles(canvas.width, canvas.height);
    }
    syncSize();
    window.addEventListener("resize", syncSize);
    window.addEventListener(
      "mousemove",
      function (ev) {
        mouseX = ev.clientX;
        mouseY = ev.clientY;
      },
      { passive: true }
    );

    function tick() {
      var allowed =
        activeParticleMode !== "none" &&
        !document.hidden &&
        (typeof shouldRenderFn === "function" ? shouldRenderFn() : true);

      if (!allowed) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        requestAnimationFrame(tick);
        return;
      }

      var w = canvas.width;
      var h = canvas.height;
      var mode = activeParticleMode;
      ctx.clearRect(0, 0, w, h);

      for (var i = 0; i < particleItems.length; i++) {
        var p = particleItems[i];
        ctx.beginPath();
        if (mode === "rain") {
          ctx.fillStyle = "rgba(125, 211, 252, 0.42)";
          ctx.fillRect(p.x, p.y, 1.2, p.len);
        } else if (mode === "cyber") {
          ctx.fillStyle = "rgba(56, 189, 248, 0.45)";
          ctx.fillRect(p.x, p.y, p.len, 1.5);
        } else if (mode === "matrix") {
          ctx.font = "13px monospace";
          ctx.fillStyle = "rgba(74, 222, 128, 0.55)";
          ctx.fillText(p.ch, p.x, p.y);
          if (Math.random() < 0.04) {
            p.ch = String.fromCharCode(0x30a0 + Math.floor(Math.random() * 96));
          }
        } else if (mode === "bubbles") {
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(226, 232, 240, 0.35)";
          ctx.stroke();
        } else {
          if (mode === "stars" || mode === "fireflies") {
            p.alpha += p.dAlpha;
            if (p.alpha > 0.95 || p.alpha < 0.15) p.dAlpha *= -1;
          }
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle =
            mode === "fireflies"
              ? "rgba(253, 224, 71, 0.85)"
              : mode === "nexus"
              ? "rgba(165, 180, 252, 0.65)"
              : "rgba(203, 213, 225, 0.5)";
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        if (mode === "fireflies") {
          var dxF = mouseX - p.x;
          var dyF = mouseY - p.y;
          var dF = Math.sqrt(dxF * dxF + dyF * dyF);
          if (dF > 0 && dF < 110) {
            p.vx -= dxF * 0.004;
            p.vy -= dyF * 0.004;
          }
          p.vx *= 0.96;
          p.vy *= 0.96;
        } else if (mode === "nexus") {
          var dxN = mouseX - p.x;
          var dyN = mouseY - p.y;
          var dN = Math.sqrt(dxN * dxN + dyN * dyN);
          if (dN > 0 && dN < 140) {
            p.x -= dxN * 0.018;
            p.y -= dyN * 0.018;
          }
          for (var j = i + 1; j < particleItems.length; j++) {
            var p2 = particleItems[j];
            var dist2 = Math.hypot(p2.x - p.x, p2.y - p.y);
            if (dist2 < 85) {
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.strokeStyle =
                "rgba(129, 140, 248, " +
                ((1 - dist2 / 85) * 0.38).toFixed(2) +
                ")";
              ctx.stroke();
            }
          }
        }

        p.x += p.vx;
        p.y += p.vy;

        if (mode === "snow" || mode === "rain" || mode === "matrix") {
          if (p.y > h + 20) {
            p.y = -20;
            p.x = Math.random() * w;
          }
          if (p.x > w) p.x = 0;
          if (p.x < 0) p.x = w;
        } else if (mode === "cyber") {
          if (p.x > w + 60) {
            p.x = -80;
            p.y = Math.random() * h;
          }
        } else if (mode === "bubbles" || mode === "stars") {
          if (p.y < -10) {
            p.y = h + 10;
            p.x = Math.random() * w;
          }
        } else if (mode === "fireflies" || mode === "nexus") {
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
        }
      }
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  // =========================================================================
  // Cine-Cloud OS Hub Renderer (iboss://cinecloud)
  // =========================================================================
  function renderCineCloudPage(container, ctx) {
    var games = Array.isArray(window.IBOSS_CINE_CLOUD_CATALOG)
      ? window.IBOSS_CINE_CLOUD_CATALOG
      : [];
    var currentSubTab = "cine"; // "cine" | "lib" | "tut" | "set"
    var libQuery = "";
    var libTag = "all";
    var heroIdx = 0;
    var heroTimer = null;
    var gpRaf = null;
    var lastGp = {};
    var lastGpStep = 0;
    var gpFocused = null;

    var fallbackPoster = "/ui/assets/cat-action.jpg";
    var fallbackBanner = "/ui/assets/banner-games.jpg";

    function buildHeroRotation(db) {
      var arr = [];
      var playedIds = Object.keys(db)
        .filter(function (id) {
          return db[id] && db[id].t > 0;
        })
        .sort(function (a, b) {
          return (db[b].l || 0) - (db[a].l || 0);
        });
      if (playedIds.length) {
        var recent = games.find(function (g) {
          return g.id === playedIds[0];
        });
        if (recent) {
          arr.push({
            game: recent,
            badge: "▶ RESUME SESSION",
            sub:
              formatShortPlaytime(db[recent.id].t) + " Played · " + recent.dev,
          });
        }
      }
      games.slice(0, 5).forEach(function (g) {
        if (
          !arr.some(function (x) {
            return x.game.id === g.id;
          })
        ) {
          arr.push({
            game: g,
            badge: "☁️ FEATURED CLOUD PC",
            sub: (g.tags || []).slice(0, 3).join(" · ") + " — " + g.dev,
          });
        }
      });
      return arr;
    }

    function renderHorizCard(g, db) {
      var secs = (db[g.id] && db[g.id].t) || 0;
      return (
        '<button type="button" class="cc-card-h cc-focusable" data-cc-open="' +
        escapeHtml(g.id) +
        '">' +
        '<img src="' +
        escapeHtml(getProxiedArtUrl(g.bg)) +
        '" alt="' +
        escapeHtml(g.n) +
        '" loading="lazy" onerror="this.onerror=null;this.src=\'' +
        fallbackBanner +
        "'\" />" +
        '<div class="cc-card-scrim"></div>' +
        '<div class="cc-card-info">' +
        "<h4>" +
        escapeHtml(g.n) +
        "</h4>" +
        "<span>" +
        escapeHtml(g.dev) +
        " · ⏱ " +
        escapeHtml(formatHoverPlaytime(secs)) +
        "</span>" +
        "</div>" +
        "</button>"
      );
    }

    function renderVertCard(g, db) {
      var secs = (db[g.id] && db[g.id].t) || 0;
      return (
        '<button type="button" class="cc-card-v cc-focusable" data-cc-open="' +
        escapeHtml(g.id) +
        '">' +
        '<img src="' +
        escapeHtml(getProxiedArtUrl(g.img)) +
        '" alt="' +
        escapeHtml(g.n) +
        '" loading="lazy" onerror="this.onerror=null;this.src=\'' +
        fallbackPoster +
        "'\" />" +
        '<div class="cc-card-scrim"></div>' +
        '<div class="cc-card-info">' +
        "<h4>" +
        escapeHtml(g.n) +
        "</h4>" +
        "<span>" +
        escapeHtml(g.dev) +
        "</span>" +
        '<div class="cc-playtime-pill">⏱ ' +
        escapeHtml(formatShortPlaytime(secs)) +
        "</div>" +
        "</div>" +
        "</button>"
      );
    }

    function cleanupTimers() {
      if (heroTimer) {
        clearInterval(heroTimer);
        heroTimer = null;
      }
      if (gpRaf) {
        cancelAnimationFrame(gpRaf);
        gpRaf = null;
      }
    }

    function openGameModal(gameId) {
      var g = games.find(function (x) {
        return x.id === gameId;
      });
      if (!g) return;
      var db = loadStore();
      var favIds = loadFavIds();
      var isFav = favIds.indexOf(g.id) !== -1;
      var stat = db[g.id] || { t: 0, l: 0 };
      var modal = container.querySelector("#ccModalBackdrop");
      if (!modal) return;
      var rm = g.rm || {};
      var rr = g.rr || {};

      modal.innerHTML =
        '<div class="cc-modal-card">' +
        '<img src="' +
        escapeHtml(getProxiedArtUrl(g.bg)) +
        '" alt="" class="cc-modal-bg" onerror="this.onerror=null;this.src=\'' +
        fallbackBanner +
        "'\" />" +
        '<button type="button" class="cc-modal-close cc-focusable" id="ccCloseModalBtn" title="Close (B)">✕</button>' +
        '<div class="cc-modal-grid">' +
        '<div class="cc-modal-left">' +
        '<img src="' +
        escapeHtml(getProxiedArtUrl(g.img)) +
        '" alt="' +
        escapeHtml(g.n) +
        '" class="cc-modal-poster" onerror="this.onerror=null;this.src=\'' +
        fallbackPoster +
        "'\" />" +
        '<button type="button" class="btn btn-primary btn-block cc-focusable" id="ccLaunchTabBtn">▶ Play via Ibossbad Proxy</button>' +
        '<button type="button" class="btn btn-secondary btn-block cc-focusable" id="ccLaunchEmbedBtn" style="margin-top:8px">🖵 Play Embedded Fullscreen</button>' +
        '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<button type="button" class="btn btn-secondary btn-xs cc-focusable" style="flex:1" id="ccToggleFavBtn">' +
        (isFav ? "★ Favorited" : "☆ Favorite") +
        "</button>" +
        '<button type="button" class="btn btn-secondary btn-xs cc-focusable" style="flex:1" id="ccLaunchPipBtn">🪟 PiP</button>' +
        '<button type="button" class="btn btn-secondary btn-xs cc-focusable" style="flex:1" id="ccCopyEmbedBtn">&lt;/&gt; Embed</button>' +
        "</div>" +
        '<div class="cc-stats-box">' +
        "<div><span>Play Time</span><strong>" +
        escapeHtml(formatShortPlaytime(stat.t)) +
        "</strong></div>" +
        "<div><span>Last Played</span><strong>" +
        escapeHtml(formatLastPlayed(stat.l)) +
        "</strong></div>" +
        "<div><span>Achievements</span><strong>" +
        escapeHtml(String(g.ach || 0)) +
        "</strong></div>" +
        "</div>" +
        "</div>" +
        '<div class="cc-modal-right">' +
        '<span class="bento-kicker">☁️ Cine-Cloud PC Stream</span>' +
        "<h2>" +
        escapeHtml(g.n) +
        "</h2>" +
        '<div class="cc-dev-line">' +
        escapeHtml(g.dev || "Cloud Studio") +
        "</div>" +
        '<div class="cc-tags-row">' +
        (g.tags || [])
          .map(function (t) {
            return '<span class="cc-tag-chip">' + escapeHtml(t) + "</span>";
          })
          .join("") +
        "</div>" +
        '<p class="cc-desc">' +
        escapeHtml(g.desc || "") +
        "</p>" +
        '<div class="cc-specs-grid">' +
        '<div class="cc-spec-box"><h4>Minimum Cloud Rig</h4>' +
        "<div><small>OS:</small> " +
        escapeHtml(rm.os || "Windows 10") +
        "</div>" +
        "<div><small>CPU:</small> " +
        escapeHtml(rm.cpu || "Quad-Core") +
        "</div>" +
        "<div><small>RAM:</small> " +
        escapeHtml(rm.ram || "8 GB") +
        "</div>" +
        "<div><small>GPU:</small> " +
        escapeHtml(rm.gpu || "GTX 1060") +
        "</div></div>" +
        '<div class="cc-spec-box"><h4>Recommended Rig</h4>' +
        "<div><small>OS:</small> " +
        escapeHtml(rr.os || "Windows 11") +
        "</div>" +
        "<div><small>CPU:</small> " +
        escapeHtml(rr.cpu || "Core i7") +
        "</div>" +
        "<div><small>RAM:</small> " +
        escapeHtml(rr.ram || "16 GB") +
        "</div>" +
        "<div><small>GPU:</small> " +
        escapeHtml(rr.gpu || "RTX 2060+") +
        "</div></div>" +
        "</div>" +
        "</div>" +
        "</div>" +
        "</div>";

      modal.classList.remove("hidden");

      modal.querySelector("#ccCloseModalBtn").onclick = function () {
        modal.classList.add("hidden");
      };
      modal.onclick = function (ev) {
        if (ev.target === modal) modal.classList.add("hidden");
      };

      modal.querySelector("#ccLaunchTabBtn").onclick = function () {
        recordGamePlayStart(g.id);
        modal.classList.add("hidden");
        if (ctx && typeof ctx.openUrl === "function") {
          ctx.openUrl(g.url, true);
        }
      };

      modal.querySelector("#ccLaunchEmbedBtn").onclick = function () {
        recordGamePlayStart(g.id);
        modal.classList.add("hidden");
        openEmbeddedPlayer(g);
      };

      modal.querySelector("#ccToggleFavBtn").onclick = function () {
        var curFavs = loadFavIds();
        var ix = curFavs.indexOf(g.id);
        if (ix === -1) {
          curFavs.push(g.id);
        } else {
          curFavs.splice(ix, 1);
        }
        saveFavIds(curFavs);
        openGameModal(g.id);
      };

      modal.querySelector("#ccLaunchPipBtn").onclick = function () {
        recordGamePlayStart(g.id);
        modal.classList.add("hidden");
        if (ctx && typeof ctx.openPip === "function") {
          ctx.openPip(g.url, g.n);
        } else if (ctx && typeof ctx.openUrl === "function") {
          ctx.openUrl(g.url, true);
        }
      };

      modal.querySelector("#ccCopyEmbedBtn").onclick = function () {
        var snippet =
          '<iframe src="' +
          g.url +
          '" style="width:100%;height:100%;border:0" allow="autoplay;fullscreen;pointer-lock;gamepad"></iframe>';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(snippet).catch(function () {});
        }
        if (ctx && ctx.toast) {
          ctx.toast("Embed snippet copied to clipboard!");
        }
      };
    }

    function openEmbeddedPlayer(game) {
      var playerWrap = container.querySelector("#ccEmbeddedPlayer");
      if (!playerWrap) return;
      var proxiedTarget =
        ctx && typeof ctx.buildProxyFrameUrl === "function"
          ? ctx.buildProxyFrameUrl(game.url)
          : "/proxy/" + game.url;

      playerWrap.innerHTML =
        '<div class="cc-player-topbar">' +
        "<div><strong>☁️ " +
        escapeHtml(game.n) +
        '</strong> <span style="font-size:12px;color:#94a3b8;margin-left:8px">Cine-Cloud Stream · Gamepad &amp; Pointer-Lock Ready</span></div>' +
        '<div style="display:flex;gap:8px">' +
        '<button type="button" class="btn btn-secondary btn-xs" id="ccLockPointerBtn">🖵 Fullscreen &amp; Lock Mouse</button>' +
        '<button type="button" class="btn btn-danger btn-xs" id="ccExitEmbedBtn">✕ Exit Session</button>' +
        "</div>" +
        "</div>" +
        '<iframe id="ccEmbedFrame" src="' +
        escapeHtml(proxiedTarget) +
        '" allow="autoplay; fullscreen; pointer-lock; keyboard-map; gamepad; clipboard-read; clipboard-write" class="cc-embed-iframe"></iframe>';

      playerWrap.classList.remove("hidden");

      playerWrap.querySelector("#ccLockPointerBtn").onclick = function () {
        var fr = playerWrap.querySelector("#ccEmbedFrame");
        if (playerWrap.requestFullscreen) {
          playerWrap.requestFullscreen().catch(function () {});
        }
        if (fr) {
          fr.focus();
          if (fr.requestPointerLock) fr.requestPointerLock();
        }
      };

      playerWrap.querySelector("#ccExitEmbedBtn").onclick = function () {
        stopGamePlaySession();
        playerWrap.innerHTML = "";
        playerWrap.classList.add("hidden");
        draw();
      };
    }

    function startGamepadLoop() {
      if (gpRaf || typeof navigator.getGamepads !== "function") return;
      var subTabs = ["cine", "lib", "tut", "set"];

      function loop() {
        if (!container.isConnected) {
          cleanupTimers();
          return;
        }
        var pads = navigator.getGamepads ? navigator.getGamepads() : [];
        var gp = pads && pads[0];
        if (gp) {
          var bA = Boolean(gp.buttons[0] && gp.buttons[0].pressed);
          var bB = Boolean(gp.buttons[1] && gp.buttons[1].pressed);
          var bLB = Boolean(gp.buttons[4] && gp.buttons[4].pressed);
          var bRB = Boolean(gp.buttons[5] && gp.buttons[5].pressed);
          var dU =
            Boolean(gp.buttons[12] && gp.buttons[12].pressed) ||
            (gp.axes && gp.axes[1] < -0.55);
          var dD =
            Boolean(gp.buttons[13] && gp.buttons[13].pressed) ||
            (gp.axes && gp.axes[1] > 0.55);
          var dL =
            Boolean(gp.buttons[14] && gp.buttons[14].pressed) ||
            (gp.axes && gp.axes[0] < -0.55);
          var dR =
            Boolean(gp.buttons[15] && gp.buttons[15].pressed) ||
            (gp.axes && gp.axes[0] > 0.55);

          var modal = container.querySelector("#ccModalBackdrop");
          if (bB && !lastGp.B && modal && !modal.classList.contains("hidden")) {
            modal.classList.add("hidden");
          }
          if (bA && !lastGp.A && gpFocused) {
            gpFocused.click();
          }
          if (bLB && !lastGp.LB) {
            var prevIdx =
              (subTabs.indexOf(currentSubTab) - 1 + subTabs.length) %
              subTabs.length;
            currentSubTab = subTabs[prevIdx];
            draw();
          }
          if (bRB && !lastGp.RB) {
            var nextIdx = (subTabs.indexOf(currentSubTab) + 1) % subTabs.length;
            currentSubTab = subTabs[nextIdx];
            draw();
          }

          var now = Date.now();
          if ((dU || dD || dL || dR) && now - lastGpStep > 165) {
            lastGpStep = now;
            moveGamepadFocus(dU, dD, dL, dR);
          }

          lastGp = { A: bA, B: bB, LB: bLB, RB: bRB };
        }
        gpRaf = requestAnimationFrame(loop);
      }
      gpRaf = requestAnimationFrame(loop);
    }

    function moveGamepadFocus(u, d, l, r) {
      var candidates = Array.from(
        container.querySelectorAll(".cc-focusable")
      ).filter(function (el) {
        return el.offsetParent !== null;
      });
      if (!candidates.length) return;
      if (!gpFocused || candidates.indexOf(gpFocused) === -1) {
        gpFocused = candidates[0];
      } else {
        var cur = gpFocused.getBoundingClientRect();
        var best = null;
        var bestDist = Infinity;
        candidates.forEach(function (el) {
          if (el === gpFocused) return;
          var rect = el.getBoundingClientRect();
          var dx = rect.left - cur.left;
          var dy = rect.top - cur.top;
          var dist = Math.hypot(dx, dy);
          var ok =
            (u && dy < -10 && Math.abs(dx) < Math.abs(dy) * 2.2) ||
            (d && dy > 10 && Math.abs(dx) < Math.abs(dy) * 2.2) ||
            (l && dx < -10 && Math.abs(dy) < Math.abs(dx) * 2.2) ||
            (r && dx > 10 && Math.abs(dy) < Math.abs(dx) * 2.2);
          if (ok && dist < bestDist) {
            best = el;
            bestDist = dist;
          }
        });
        if (best) gpFocused = best;
      }
      container.querySelectorAll(".cc-gp-focus").forEach(function (el) {
        el.classList.remove("cc-gp-focus");
      });
      if (gpFocused) {
        gpFocused.classList.add("cc-gp-focus");
        gpFocused.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
      }
    }

    function draw() {
      cleanupTimers();
      var db = loadStore();
      var authReady = false;
      try {
        authReady = window.localStorage.getItem(AUTH_READY_KEY) === "1";
      } catch (_e) {}

      var bodyHtml = "";
      if (currentSubTab === "cine") {
        var heroList = buildHeroRotation(db);
        var activeHero =
          heroList[heroIdx % Math.max(1, heroList.length)] || null;

        var poppyGames = games.filter(function (g) {
          return g.n.toLowerCase().indexOf("poppy") !== -1;
        });
        var openWorldGames = games
          .filter(function (g) {
            return (
              (g.tags || []).indexOf("Open World") !== -1 ||
              (g.tags || []).indexOf("RPG") !== -1
            );
          })
          .slice(0, 10);
        var racingGames = games
          .filter(function (g) {
            return (
              (g.tags || []).indexOf("Racing") !== -1 ||
              (g.tags || []).indexOf("Simulation") !== -1
            );
          })
          .slice(0, 10);
        var trendingGames = games.slice(8, 20);

        var favList = loadFavIds();
        var playedIds = Object.keys(db).filter(function (k) {
          return db[k] && (db[k].t > 0 || db[k].l > 0);
        });
        var totalPlaySec = playedIds.reduce(function (acc, k) {
          return acc + Number((db[k] && db[k].t) || 0);
        }, 0);

        bodyHtml =
          '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">' +
          '<span class="cat-pill">⏱️ Cloud Playtime: <strong>' +
          escapeHtml(formatShortPlaytime(totalPlaySec)) +
          "</strong></span>" +
          '<span class="cat-pill">🎮 Played: <strong>' +
          playedIds.length +
          "/" +
          games.length +
          "</strong></span>" +
          '<span class="cat-pill">★ Favorites: <strong>' +
          favList.length +
          "</strong></span>" +
          "</div>" +
          (activeHero
            ? '<div class="cc-hero-banner cc-focusable" id="ccHeroCard" data-cc-open="' +
              escapeHtml(activeHero.game.id) +
              '">' +
              '<img src="' +
              escapeHtml(getProxiedArtUrl(activeHero.game.bg)) +
              '" alt="" class="cc-hero-img" id="ccHeroImg" onerror="this.onerror=null;this.src=\'' +
              fallbackBanner +
              "'\" />" +
              '<div class="cc-hero-scrim"></div>' +
              '<div class="cc-hero-content">' +
              '<span class="bento-kicker" id="ccHeroBadge">' +
              escapeHtml(activeHero.badge) +
              "</span>" +
              '<h1 id="ccHeroTitle">' +
              escapeHtml(activeHero.game.n) +
              "</h1>" +
              '<p id="ccHeroSub">' +
              escapeHtml(activeHero.sub) +
              "</p>" +
              "</div>" +
              "</div>"
            : "") +
          '<h3 class="cc-row-title">🔥 Open World &amp; AAA RPGs</h3>' +
          '<div class="cc-carousel-row">' +
          openWorldGames
            .map(function (g) {
              return renderHorizCard(g, db);
            })
            .join("") +
          "</div>" +
          (poppyGames.length
            ? '<h3 class="cc-row-title">🧸 Poppy Playtime Universe</h3>' +
              '<div class="cc-carousel-row">' +
              poppyGames
                .map(function (g) {
                  return renderHorizCard(g, db);
                })
                .join("") +
              "</div>"
            : "") +
          '<h3 class="cc-row-title">🏎️ Racing, Flight &amp; Sim</h3>' +
          '<div class="cc-carousel-row">' +
          racingGames
            .map(function (g) {
              return renderHorizCard(g, db);
            })
            .join("") +
          "</div>" +
          '<h3 class="cc-row-title">⚡ Trending Cloud Releases</h3>' +
          '<div class="cc-carousel-row">' +
          trendingGames
            .map(function (g) {
              return renderHorizCard(g, db);
            })
            .join("") +
          "</div>";

        if (heroList.length > 1) {
          heroTimer = setInterval(function () {
            if (!container.isConnected || currentSubTab !== "cine") {
              clearInterval(heroTimer);
              return;
            }
            heroIdx = (heroIdx + 1) % heroList.length;
            var nextH = heroList[heroIdx];
            var cardEl = container.querySelector("#ccHeroCard");
            var imgEl = container.querySelector("#ccHeroImg");
            var badgeEl = container.querySelector("#ccHeroBadge");
            var titleEl = container.querySelector("#ccHeroTitle");
            var subEl = container.querySelector("#ccHeroSub");
            if (cardEl && imgEl && titleEl) {
              cardEl.setAttribute("data-cc-open", nextH.game.id);
              imgEl.src = getProxiedArtUrl(nextH.game.bg);
              badgeEl.textContent = nextH.badge;
              titleEl.textContent = nextH.game.n;
              subEl.textContent = nextH.sub;
            }
          }, 6000);
        }
      } else if (currentSubTab === "lib") {
        var favIdsLib = loadFavIds();
        var tagOptions = [
          "all",
          "favorites",
          "Open World",
          "RPG",
          "Action",
          "Horror",
          "Racing",
          "Simulation",
          "Anime",
          "Fighting",
          "Multiplayer",
        ];
        var qLower = libQuery.trim().toLowerCase();
        var filtered = games.filter(function (g) {
          if (libTag === "favorites" && favIdsLib.indexOf(g.id) === -1) {
            return false;
          }
          if (
            libTag !== "all" &&
            libTag !== "favorites" &&
            (g.tags || []).indexOf(libTag) === -1
          ) {
            return false;
          }
          if (!qLower) return true;
          var hay = (
            g.n +
            " " +
            (g.dev || "") +
            " " +
            (g.tags || []).join(" ")
          ).toLowerCase();
          return hay.indexOf(qLower) !== -1;
        });

        bodyHtml =
          '<div class="games-toolbar" style="margin-bottom:14px">' +
          '<input id="ccLibSearchInput" type="text" class="field-input games-search-input" placeholder="Search all ' +
          games.length +
          ' AAA PC Cloud games by title, studio, or genre..." value="' +
          escapeHtml(libQuery) +
          '" />' +
          '<div class="games-cat-strip">' +
          tagOptions
            .map(function (tg) {
              var lbl =
                tg === "all"
                  ? "All (" + games.length + ")"
                  : tg === "favorites"
                  ? "★ Favorites (" + favIdsLib.length + ")"
                  : tg;
              return (
                '<button type="button" class="cat-pill cc-focusable' +
                (libTag === tg ? " active" : "") +
                '" data-cc-tag="' +
                escapeHtml(tg) +
                '">' +
                escapeHtml(lbl) +
                "</button>"
              );
            })
            .join("") +
          "</div></div>" +
          '<div class="cc-grid-v">' +
          filtered
            .map(function (g) {
              return renderVertCard(g, db);
            })
            .join("") +
          "</div>";
      } else if (currentSubTab === "tut") {
        bodyHtml =
          '<div class="internal-grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">' +
          '<div class="internal-card">' +
          "<h3>1. Sign In to Raccoon Cloud Rig</h3>" +
          '<p style="color:var(--text-secondary);font-size:13px;line-height:1.55">Cine-Cloud streams PC titles (Cyberpunk 2077, Elden Ring, GTA V, Poppy Playtime) from Raccoon Cloud Gaming. Open the login page inside an Ibossbad proxied tab once to activate your cloud session.</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
          '<button type="button" class="btn btn-primary cc-focusable" id="ccOpenRaccoonLoginBtn">🔑 Open Raccoon Login (Proxied)</button>' +
          '<button type="button" class="btn btn-secondary cc-focusable" id="ccToggleAuthReadyBtn">' +
          (authReady ? "✓ Marked Logged In" : "Mark as Logged In") +
          "</button>" +
          "</div>" +
          "</div>" +
          '<div class="internal-card">' +
          "<h3>2. Need a Disposable Verification Email?</h3>" +
          '<p style="color:var(--text-secondary);font-size:13px;line-height:1.55">Just like Cine-Cloud OS, you can launch TempMail right inside a proxied tab to grab an instant verification code without using a personal email.</p>' +
          '<button type="button" class="btn btn-secondary cc-focusable" id="ccOpenTempMailBtn" style="margin-top:12px">📬 Open TempMail.ing (Proxied)</button>' +
          "</div>" +
          "</div>";
      } else if (currentSubTab === "set") {
        var gpList =
          typeof navigator.getGamepads === "function"
            ? Array.from(navigator.getGamepads() || []).filter(Boolean)
            : [];
        var gpStatus = gpList.length
          ? "🟢 Connected: " + gpList[0].id
          : "⚪ Plug in or pair an Xbox / PlayStation / Bluetooth controller and press any button";

        bodyHtml =
          '<div class="internal-card" style="margin-bottom:16px">' +
          "<h3>✨ Cine-Cloud Interactive Background Particles</h3>" +
          '<p style="color:var(--text-secondary);font-size:13px;margin:4px 0 14px">Choose from all 9 Cine-Cloud OS ambient canvas effects (active across New Tab &amp; internal hubs).</p>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          PARTICLE_MODES.map(function (pm) {
            var isAct = activeParticleMode === pm.id;
            return (
              '<button type="button" class="btn ' +
              (isAct ? "btn-primary" : "btn-secondary") +
              ' cc-focusable" data-cc-particle="' +
              escapeHtml(pm.id) +
              '">' +
              pm.icon +
              " " +
              escapeHtml(pm.label) +
              "</button>"
            );
          }).join("") +
          "</div></div>" +
          '<div class="internal-card">' +
          "<h3>🎮 V1.5 Controller &amp; Mobile/iPad Support</h3>" +
          '<p style="color:var(--text-secondary);font-size:13px;margin:6px 0 10px">' +
          escapeHtml(gpStatus) +
          "</p>" +
          '<div style="font-size:12.5px;color:var(--text-muted);line-height:1.6">' +
          "• <strong>D-Pad / Left Stick</strong>: Navigate game cards &amp; buttons<br/>" +
          "• <strong>A / Cross</strong>: Open game details or launch<br/>" +
          "• <strong>B / Circle</strong>: Close detail modal<br/>" +
          "• <strong>LB / RB</strong>: Switch between Discover, Library, Cloud Login &amp; Particles" +
          "</div></div>";
      }

      container.innerHTML =
        '<div class="internal-page cc-page-root">' +
        '<div class="cc-top-bar">' +
        '<div class="cc-brand-pill"><span>☁️</span><strong>Cine-Cloud OS</strong><small>v1.5 · ' +
        games.length +
        " PC Titles</small></div>" +
        '<div class="cc-dock-tabs">' +
        '<button type="button" class="cat-pill cc-focusable' +
        (currentSubTab === "cine" ? " active" : "") +
        '" data-cc-tab="cine">🔥 Discover</button>' +
        '<button type="button" class="cat-pill cc-focusable' +
        (currentSubTab === "lib" ? " active" : "") +
        '" data-cc-tab="lib">📚 All Games (' +
        games.length +
        ")</button>" +
        '<button type="button" class="cat-pill cc-focusable' +
        (currentSubTab === "tut" ? " active" : "") +
        '" data-cc-tab="tut">🔑 Cloud Login</button>' +
        '<button type="button" class="cat-pill cc-focusable' +
        (currentSubTab === "set" ? " active" : "") +
        '" data-cc-tab="set">✨ Particles &amp; Gamepad</button>' +
        '<button type="button" class="cat-pill cc-focusable" id="ccRandomPickBtn">🎲 Surprise AAA</button>' +
        "</div>" +
        "</div>" +
        bodyHtml +
        '<div id="ccModalBackdrop" class="cc-modal-backdrop hidden"></div>' +
        '<div id="ccEmbeddedPlayer" class="cc-embedded-player hidden"></div>' +
        "</div>";

      var randomPickBtn = container.querySelector("#ccRandomPickBtn");
      if (randomPickBtn) {
        randomPickBtn.onclick = function () {
          if (!games.length) return;
          var pick = games[Math.floor(Math.random() * games.length)];
          openGameModal(pick.id);
        };
      }

      container.querySelectorAll("[data-cc-tab]").forEach(function (btn) {
        btn.onclick = function () {
          currentSubTab = btn.getAttribute("data-cc-tab");
          draw();
        };
      });

      container.querySelectorAll("[data-cc-open]").forEach(function (el) {
        el.onclick = function () {
          openGameModal(el.getAttribute("data-cc-open"));
        };
      });

      var searchEl = container.querySelector("#ccLibSearchInput");
      if (searchEl) {
        searchEl.oninput = function () {
          libQuery = searchEl.value;
          var pos = searchEl.selectionStart || libQuery.length;
          draw();
          var nextInput = container.querySelector("#ccLibSearchInput");
          if (nextInput) {
            nextInput.focus();
            try {
              nextInput.setSelectionRange(pos, pos);
            } catch (_e) {}
          }
        };
      }

      container.querySelectorAll("[data-cc-tag]").forEach(function (btn) {
        btn.onclick = function () {
          libTag = btn.getAttribute("data-cc-tag");
          draw();
        };
      });

      var racBtn = container.querySelector("#ccOpenRaccoonLoginBtn");
      if (racBtn) {
        racBtn.onclick = function () {
          if (ctx && typeof ctx.openUrl === "function") {
            ctx.openUrl(
              "https://www.raccoongame.com/login?redirect_uri=https%3A%2F%2Fwww.raccoongame.com%2Fwap%2Fdist%2F%23%2Fplatform%2Fset&lang=en",
              true
            );
          }
        };
      }

      var mailBtn = container.querySelector("#ccOpenTempMailBtn");
      if (mailBtn) {
        mailBtn.onclick = function () {
          if (ctx && typeof ctx.openUrl === "function") {
            ctx.openUrl("https://tempmail.ing/", true);
          }
        };
      }

      var markBtn = container.querySelector("#ccToggleAuthReadyBtn");
      if (markBtn) {
        markBtn.onclick = function () {
          var next = !authReady;
          try {
            window.localStorage.setItem(AUTH_READY_KEY, next ? "1" : "0");
          } catch (_e) {}
          if (ctx && ctx.toast) {
            ctx.toast(
              next
                ? "Raccoon Cloud marked as ready!"
                : "Cloud login status reset."
            );
          }
          draw();
        };
      }

      container.querySelectorAll("[data-cc-particle]").forEach(function (btn) {
        btn.onclick = function () {
          var chosen = btn.getAttribute("data-cc-particle");
          setParticleMode(chosen);
          if (ctx && ctx.toast) {
            ctx.toast("Background particles: " + chosen);
          }
          draw();
        };
      });

      startGamepadLoop();
    }

    draw();
  }

  window.IbossCineCloud = {
    PARTICLE_MODES: PARTICLE_MODES,
    setParticleMode: setParticleMode,
    getParticleMode: getParticleMode,
    initGlobalParticleEngine: initGlobalParticleEngine,
    renderCineCloudPage: renderCineCloudPage,
  };
})(window);
