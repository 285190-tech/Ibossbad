"use strict";

(function (window) {
  var WALLPAPER_KEY = "ibossbad.wallpaper.v1";

  var WALLPAPERS = [
    {
      id: "nebula",
      label: "Cosmic Nebula",
      src: "/ui/assets/hero-nebula.jpg",
    },
    {
      id: "liquid",
      label: "Liquid Sapphire",
      src: "/ui/assets/banner-desktop.jpg",
    },
    {
      id: "cybercity",
      label: "Neon City",
      src: "/ui/assets/banner-cybercity.jpg",
    },
    {
      id: "minimal",
      label: "Minimal Dark",
      src: "",
    },
  ];

  var BANNERS = {
    hero: "/ui/assets/hero-nebula.jpg",
    games: "/ui/assets/banner-games.jpg",
    media: "/ui/assets/banner-media.jpg",
    emulator: "/ui/assets/banner-emulator.jpg",
    desktop: "/ui/assets/banner-desktop.jpg",
    cybercity: "/ui/assets/banner-cybercity.jpg",
    action: "/ui/assets/cat-action.jpg",
    racing: "/ui/assets/cat-racing.jpg",
    sandbox: "/ui/assets/cat-sandbox.jpg",
    puzzle: "/ui/assets/cat-puzzle.jpg",
  };

  var CATEGORY_PHOTO_MAP = {
    featured: BANNERS.games,
    action: BANNERS.action,
    racing: BANNERS.racing,
    sandbox: BANNERS.sandbox,
    puzzle: BANNERS.puzzle,
    flash: BANNERS.emulator,
    arcade: BANNERS.games,
    sports: BANNERS.racing,
    escape: BANNERS.cybercity,
    idle: BANNERS.sandbox,
    apps: BANNERS.media,
  };

  function hashString(str) {
    var s = String(str || "");
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function escAttr(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getActiveWallpaperId() {
    try {
      var saved = window.localStorage.getItem(WALLPAPER_KEY);
      if (
        saved &&
        WALLPAPERS.some(function (w) {
          return w.id === saved;
        })
      ) {
        return saved;
      }
    } catch (_e) {}
    return "nebula";
  }

  function setActiveWallpaperId(id) {
    try {
      window.localStorage.setItem(WALLPAPER_KEY, String(id || "nebula"));
    } catch (_e) {}
  }

  function getActiveWallpaper() {
    var id = getActiveWallpaperId();
    return (
      WALLPAPERS.find(function (w) {
        return w.id === id;
      }) || WALLPAPERS[0]
    );
  }

  function cycleWallpaper() {
    var cur = getActiveWallpaperId();
    var idx = WALLPAPERS.findIndex(function (w) {
      return w.id === cur;
    });
    var next = WALLPAPERS[(idx + 1) % WALLPAPERS.length];
    setActiveWallpaperId(next.id);
    return next;
  }

  // Crisp vector emblem SVG paths keyed by game theme / title keywords
  function pickGameGlyphSvg(title, category) {
    var t = String(title || "").toLowerCase();
    var cat = String(category || "arcade").toLowerCase();

    if (
      t.indexOf("minecraft") !== -1 ||
      t.indexOf("eagler") !== -1 ||
      t.indexOf("craft") !== -1 ||
      t.indexOf("terraria") !== -1 ||
      cat === "sandbox"
    ) {
      // Isometric 3D voxel cube
      return (
        '<polygon points="32,10 52,21 52,43 32,54 12,43 12,21" fill="rgba(16,185,129,0.28)" stroke="#6ee7b7" stroke-width="2.4"/>' +
        '<polyline points="12,21 32,32 52,21" fill="none" stroke="#a7f3d0" stroke-width="2.2"/>' +
        '<line x1="32" y1="32" x2="32" y2="54" stroke="#6ee7b7" stroke-width="2.2"/>'
      );
    }
    if (
      t.indexOf("moto") !== -1 ||
      t.indexOf("drift") !== -1 ||
      t.indexOf("car") !== -1 ||
      t.indexOf("drive") !== -1 ||
      t.indexOf("race") !== -1 ||
      t.indexOf("kart") !== -1 ||
      cat === "racing"
    ) {
      // Speedometer + lightning
      return (
        '<path d="M12 42a20 20 0 1 1 40 0" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M32 38 L43 23" stroke="#f43f5e" stroke-width="3.2" stroke-linecap="round"/>' +
        '<circle cx="32" cy="38" r="4" fill="#f8fafc"/>'
      );
    }
    if (
      t.indexOf("chess") !== -1 ||
      t.indexOf("2048") !== -1 ||
      t.indexOf("wordle") !== -1 ||
      t.indexOf("minesweeper") !== -1 ||
      t.indexOf("tetris") !== -1 ||
      t.indexOf("sudoku") !== -1 ||
      cat === "puzzle"
    ) {
      // Glowing puzzle / strategy diamond grid
      return (
        '<rect x="14" y="14" width="15" height="15" rx="3.5" fill="rgba(250,204,21,0.3)" stroke="#fde047" stroke-width="2.2"/>' +
        '<rect x="35" y="14" width="15" height="15" rx="3.5" fill="rgba(99,102,241,0.35)" stroke="#a5b4fc" stroke-width="2.2"/>' +
        '<rect x="14" y="35" width="15" height="15" rx="3.5" fill="rgba(56,189,248,0.3)" stroke="#7dd3fc" stroke-width="2.2"/>' +
        '<rect x="35" y="35" width="15" height="15" rx="3.5" fill="rgba(244,114,182,0.3)" stroke="#f9a8d4" stroke-width="2.2"/>'
      );
    }
    if (
      t.indexOf("1v1") !== -1 ||
      t.indexOf("krunker") !== -1 ||
      t.indexOf("shoot") !== -1 ||
      t.indexOf("sniper") !== -1 ||
      t.indexOf("gun") !== -1 ||
      t.indexOf("combat") !== -1 ||
      t.indexOf("war") !== -1 ||
      cat === "action"
    ) {
      // Tactical neon reticle
      return (
        '<circle cx="32" cy="32" r="17" fill="rgba(244,63,94,0.18)" stroke="#fb7185" stroke-width="2.4"/>' +
        '<circle cx="32" cy="32" r="5" fill="#38bdf8"/>' +
        '<path d="M32 9v8M32 47v8M9 32h8M47 32h8" stroke="#f8fafc" stroke-width="2.4" stroke-linecap="round"/>'
      );
    }
    if (
      t.indexOf("bowl") !== -1 ||
      t.indexOf("basket") !== -1 ||
      t.indexOf("soccer") !== -1 ||
      t.indexOf("football") !== -1 ||
      t.indexOf("tennis") !== -1 ||
      t.indexOf("golf") !== -1 ||
      cat === "sports"
    ) {
      // Championship trophy / stadium sphere
      return (
        '<circle cx="32" cy="32" r="18" fill="rgba(16,185,129,0.22)" stroke="#34d399" stroke-width="2.5"/>' +
        '<path d="M16 24c8 4 24 4 32 0M16 40c8-4 24-4 32 0M32 14v36" fill="none" stroke="#a7f3d0" stroke-width="2"/>'
      );
    }
    if (
      t.indexOf("cookie") !== -1 ||
      t.indexOf("clicker") !== -1 ||
      t.indexOf("idle") !== -1 ||
      t.indexOf("tycoon") !== -1 ||
      t.indexOf("doge") !== -1 ||
      cat === "idle"
    ) {
      // Radiant crystal coin / star
      return '<polygon points="32,10 38.5,24 54,26 42.5,36.8 45.5,52 32,44.5 18.5,52 21.5,36.8 10,26 25.5,24" fill="rgba(251,191,36,0.32)" stroke="#fde68a" stroke-width="2.3" stroke-linejoin="round"/>';
    }
    if (
      t.indexOf("fnaf") !== -1 ||
      t.indexOf("five nights") !== -1 ||
      t.indexOf("escape") !== -1 ||
      t.indexOf("abandoned") !== -1 ||
      t.indexOf("backrooms") !== -1 ||
      cat === "escape"
    ) {
      // Mystery key / portal eye
      return (
        '<path d="M10 32s8-13 22-13 22 13 22 13-8 13-22 13S10 32 10 32z" fill="rgba(168,85,247,0.25)" stroke="#d8b4fe" stroke-width="2.4"/>' +
        '<circle cx="32" cy="32" r="6.5" fill="#c084fc" stroke="#f8fafc" stroke-width="2"/>'
      );
    }
    if (cat === "flash") {
      // Classic Flash lightning bolt emblem
      return '<polygon points="35,10 17,34 30,34 27,54 47,28 34,28" fill="rgba(249,115,22,0.36)" stroke="#fdba74" stroke-width="2.3" stroke-linejoin="round"/>';
    }
    if (cat === "apps") {
      // Connected globe / app spark
      return (
        '<rect x="14" y="14" width="36" height="36" rx="10" fill="rgba(56,189,248,0.24)" stroke="#7dd3fc" stroke-width="2.3"/>' +
        '<path d="M25 32l5 5 10-11" fill="none" stroke="#f8fafc" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'
      );
    }
    // Default Arcade / Slope / Neon Controller
    return (
      '<rect x="11" y="20" width="42" height="25" rx="11" fill="rgba(99,102,241,0.3)" stroke="#a5b4fc" stroke-width="2.4"/>' +
      '<path d="M22 29v7M18.5 32.5h7" stroke="#f8fafc" stroke-width="2.4" stroke-linecap="round"/>' +
      '<circle cx="41" cy="30" r="2.3" fill="#f472b6"/>' +
      '<circle cx="45.5" cy="34.5" r="2.3" fill="#38bdf8"/>'
    );
  }

  function getGameCoverMeta(game) {
    var g = game || {};
    var cat = String(g.category || "arcade").toLowerCase();
    var h = hashString((g.title || "") + "|" + (g.url || ""));
    var hueShift = (h % 56) - 28; // subtle +/-28 deg hue variation per game so cards look distinct
    var hasGameCover =
      typeof g.cover === "string" &&
      /^\/ui\/assets\/game-covers\/[a-z0-9-]+\.webp$/.test(g.cover);
    var photo = hasGameCover
      ? g.cover
      : CATEGORY_PHOTO_MAP[cat] || BANNERS.games;
    var glyphSvg = pickGameGlyphSvg(g.title, cat);
    return {
      photo: photo,
      hueShift: hueShift,
      glyphSvg: glyphSvg,
      hasGameCover: hasGameCover,
    };
  }

  // Known site & internal page crisp vector icons (zero external network leak, instant render)
  function getSiteIconHtml(url, fallbackTitle) {
    var u = String(url || "").toLowerCase();
    var title = String(fallbackTitle || url || "?").trim();

    if (u.indexOf("iboss://") === 0) {
      var map = {
        "iboss://games": {
          bg: "linear-gradient(135deg,#6366f1,#ec4899)",
          g: "🎮",
        },
        "iboss://media": {
          bg: "linear-gradient(135deg,#8b5cf6,#06b6d4)",
          g: "🎬",
        },
        "iboss://emulator": {
          bg: "linear-gradient(135deg,#0ea5e9,#6366f1)",
          g: "🕹️",
        },
        "iboss://store": {
          bg: "linear-gradient(135deg,#f59e0b,#ef4444)",
          g: "🧩",
        },
        "iboss://diagnostics": {
          bg: "linear-gradient(135deg,#06b6d4,#3b82f6)",
          g: "⚡",
        },
        "iboss://history": {
          bg: "linear-gradient(135deg,#8b5cf6,#ec4899)",
          g: "🗂️",
        },
        "iboss://tools": {
          bg: "linear-gradient(135deg,#14b8a6,#6366f1)",
          g: "🛠️",
        },
        "iboss://admin": {
          bg: "linear-gradient(135deg,#f59e0b,#d97706)",
          g: "👑",
        },
        "iboss://downloads": {
          bg: "linear-gradient(135deg,#3b82f6,#1d4ed8)",
          g: "⬇️",
        },
        "iboss://storage": {
          bg: "linear-gradient(135deg,#6366f1,#4f46e5)",
          g: "💾",
        },
        "iboss://cinecloud": {
          bg: "linear-gradient(135deg,#0ea5e9,#6366f1)",
          g: "☁️",
        },
        "iboss://servers": {
          bg: "linear-gradient(135deg,#10b981,#06b6d4)",
          g: "🛰️",
        },
      };
      var hit = map[u] || {
        bg: "linear-gradient(135deg,#6366f1,#38bdf8)",
        g: "✦",
      };
      return (
        '<span class="rich-site-icon" style="background:' +
        hit.bg +
        '">' +
        hit.g +
        "</span>"
      );
    }

    if (u.indexOf("/mgg-games/") === 0) {
      return '<span class="rich-site-icon" style="background:linear-gradient(135deg,#6366f1,#a855f7)">🎮</span>';
    }

    if (u.indexOf("youtube.com") !== -1 || u.indexOf("youtu.be") !== -1) {
      return (
        '<span class="rich-site-icon" style="background:linear-gradient(135deg,#ef4444,#b91c1c)">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><polygon points="9.5,7.5 17.5,12 9.5,16.5"/></svg></span>'
      );
    }
    if (u.indexOf("discord.com") !== -1) {
      return (
        '<span class="rich-site-icon" style="background:linear-gradient(135deg,#5865F2,#4752C4)">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M19.3 5.3A16 16 0 0 0 15.2 4l-.5 1a14.8 14.8 0 0 0-5.4 0L8.8 4a16 16 0 0 0-4.1 1.3C2.1 9.2 1.4 13 1.8 16.7A16.5 16.5 0 0 0 6.8 19l1-1.5a10.6 10.6 0 0 1-1.6-.8l.4-.3a11.7 11.7 0 0 0 10.8 0l.4.3c-.5.3-1 .6-1.6.8l1 1.5a16.4 16.4 0 0 0 5-2.3c.5-4.3-.8-8.1-2.9-11.4zM8.7 14.4c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z"/></svg></span>'
      );
    }
    if (u.indexOf("spotify.com") !== -1) {
      return (
        '<span class="rich-site-icon" style="background:linear-gradient(135deg,#22c55e,#15803d)">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"><path d="M6 9.5c4-1.2 8.5-.9 12 1M7 13c3.2-.9 6.8-.7 9.8.8M8 16.3c2.5-.6 5.2-.4 7.5.6"/></svg></span>'
      );
    }
    if (u.indexOf("twitch.tv") !== -1) {
      return (
        '<span class="rich-site-icon" style="background:linear-gradient(135deg,#9146FF,#6d28d9)">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.2"><path d="M4 3h16v11l-4 4h-4l-3 3v-3H4V3z"/><line x1="11" y1="8" x2="11" y2="12"/><line x1="15" y1="8" x2="15" y2="12"/></svg></span>'
      );
    }
    if (u.indexOf("github.com") !== -1) {
      return (
        '<span class="rich-site-icon" style="background:linear-gradient(135deg,#334155,#0f172a)">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.58 9.58 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg></span>'
      );
    }
    if (u.indexOf("reddit.com") !== -1) {
      return (
        '<span class="rich-site-icon" style="background:linear-gradient(135deg,#ff4500,#ea580c)">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><circle cx="12" cy="13" r="6"/><circle cx="9.8" cy="12" r="1" fill="#ff4500"/><circle cx="14.2" cy="12" r="1" fill="#ff4500"/></svg></span>'
      );
    }
    if (u.indexOf("wikipedia.org") !== -1) {
      return '<span class="rich-site-icon" style="background:linear-gradient(135deg,#475569,#1e293b);font-family:Georgia,serif;font-weight:700;color:#fff">W</span>';
    }
    if (u.indexOf("neal.fun") !== -1) {
      return '<span class="rich-site-icon" style="background:linear-gradient(135deg,#f59e0b,#ec4899);color:#fff">✦</span>';
    }
    if (u.indexOf("poki.com") !== -1 || u.indexOf("crazygames.com") !== -1) {
      return '<span class="rich-site-icon" style="background:linear-gradient(135deg,#06b6d4,#6366f1);color:#fff">🎮</span>';
    }
    if (u.indexOf("geforcenow") !== -1) {
      return '<span class="rich-site-icon" style="background:linear-gradient(135deg,#76b900,#15803d);color:#fff">⚡</span>';
    }
    if (u.indexOf("duckduckgo") !== -1) {
      return '<span class="rich-site-icon" style="background:linear-gradient(135deg,#de5833,#b91c1c);color:#fff">🔍</span>';
    }

    var palettes = [
      "linear-gradient(135deg,#6366f1,#38bdf8)",
      "linear-gradient(135deg,#8b5cf6,#ec4899)",
      "linear-gradient(135deg,#0ea5e9,#10b981)",
      "linear-gradient(135deg,#f59e0b,#ef4444)",
      "linear-gradient(135deg,#14b8a6,#6366f1)",
      "linear-gradient(135deg,#f43f5e,#8b5cf6)",
    ];
    var h = hashString(u || title);
    var grad = palettes[h % palettes.length];
    var clean = title.replace(/^https?:\/\/(www\.)?/i, "");
    var letter = (clean.charAt(0) || "•").toUpperCase();
    return (
      '<span class="rich-site-icon" style="background:' +
      grad +
      '">' +
      escAttr(letter) +
      "</span>"
    );
  }

  window.IbossVisualArt = {
    WALLPAPERS: WALLPAPERS,
    BANNERS: BANNERS,
    getActiveWallpaperId: getActiveWallpaperId,
    setActiveWallpaperId: setActiveWallpaperId,
    getActiveWallpaper: getActiveWallpaper,
    cycleWallpaper: cycleWallpaper,
    getGameCoverMeta: getGameCoverMeta,
    getSiteIconHtml: getSiteIconHtml,
  };
})(window);
