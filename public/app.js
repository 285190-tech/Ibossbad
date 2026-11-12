"use strict";

(function () {
  const STORAGE_KEYS = {
    BOOKMARKS: "ibossbad_bookmarks_v1",
    SETTINGS: "ibossbad_settings_v1",
    SUPABASE_SESSION: "ibossbad_supabase_session_v1",
    OPEN_TABS: "ibossbad_open_tabs_v1",
  };

  const SEARCH_ENGINES = {
    ddg: {
      name: "DuckDuckGo",
      buildUrl: (q) => "https://duckduckgo.com/?q=" + encodeURIComponent(q),
    },
    brave: {
      name: "Brave",
      buildUrl: (q) =>
        "https://search.brave.com/search?q=" + encodeURIComponent(q),
    },
    wikipedia: {
      name: "Wikipedia",
      buildUrl: (q) =>
        "https://en.wikipedia.org/w/index.php?search=" + encodeURIComponent(q),
    },
    google: {
      name: "Google",
      buildUrl: (q) =>
        "https://www.google.com/search?q=" + encodeURIComponent(q),
    },
  };

  const THEME_PRESETS = {
    midnight: {
      bgBase: "#090d16",
      bgSurface: "#111827",
      bgElevated: "#1a2336",
      accent: "#6366f1",
      textPrimary: "#f1f5f9",
    },
    oled: {
      bgBase: "#000000",
      bgSurface: "#0a0a0c",
      bgElevated: "#141418",
      accent: "#0ea5e9",
      textPrimary: "#f8fafc",
    },
    catppuccin: {
      bgBase: "#1e1e2e",
      bgSurface: "#181825",
      bgElevated: "#313244",
      accent: "#cba6f7",
      textPrimary: "#cdd6f4",
    },
    cyberpunk: {
      bgBase: "#0b0716",
      bgSurface: "#160d29",
      bgElevated: "#241442",
      accent: "#f43f5e",
      textPrimary: "#fdf2f8",
    },
    nord: {
      bgBase: "#242933",
      bgSurface: "#2e3440",
      bgElevated: "#3b4252",
      accent: "#88c0d0",
      textPrimary: "#eceff4",
    },
  };

  function svgDataUri(svg) {
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  const CLOAK_PRESETS = {
    none: {
      label: "Default",
      title: "Ibossbad",
      icon: svgDataUri(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0ea5e9"/><path d="M9 16.5L14 21.5L23 11.5" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>'
      ),
    },
    gdocs: {
      label: "Google Docs",
      title: "Untitled document - Google Docs",
      icon: svgDataUri(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="5" y="2" width="22" height="28" rx="3" fill="#4285F4"/><path d="M20 2l7 7h-7z" fill="#A1C2FA"/><rect x="9" y="13" width="14" height="2" fill="#fff"/><rect x="9" y="18" width="14" height="2" fill="#fff"/><rect x="9" y="23" width="10" height="2" fill="#fff"/></svg>'
      ),
    },
    classroom: {
      label: "Classroom",
      title: "Classes",
      icon: svgDataUri(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="4" width="28" height="24" rx="3" fill="#0F9D58"/><rect x="5" y="7" width="22" height="18" rx="1" fill="#137333"/><circle cx="16" cy="14" r="3" fill="#fff"/><path d="M10 22c0-3 3-4.5 6-4.5s6 1.5 6 4.5" fill="#fff"/></svg>'
      ),
    },
    gdrive: {
      label: "Google Drive",
      title: "My Drive - Google Drive",
      icon: svgDataUri(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><polygon points="11,4 21,4 30,20 20,20" fill="#FBBC04"/><polygon points="11,4 2,20 7,28 16,12" fill="#0F9D58"/><polygon points="7,28 25,28 30,20 12,20" fill="#4285F4"/></svg>'
      ),
    },
    canvas: {
      label: "Canvas",
      title: "Dashboard",
      icon: svgDataUri(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#E13F2B"/><circle cx="16" cy="16" r="6" fill="#fff"/></svg>'
      ),
    },
    schoology: {
      label: "Schoology",
      title: "Home | Schoology",
      icon: svgDataUri(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#0277BD"/><text x="16" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="18" fill="#fff">S</text></svg>'
      ),
    },
    clever: {
      label: "Clever",
      title: "Clever | Portal",
      icon: svgDataUri(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#1D63DC"/><text x="16" y="23" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="20" fill="#fff">C</text></svg>'
      ),
    },
    khan: {
      label: "Khan Academy",
      title: "Dashboard | Khan Academy",
      icon: svgDataUri(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#14BF96"/><circle cx="16" cy="12" r="4" fill="#fff"/><path d="M8 18c0 5 4 8 8 8s8-3 8-8c-4 0-7 2-8 4-1-2-4-4-8-4z" fill="#fff"/></svg>'
      ),
    },
    custom: {
      label: "Custom",
      title: "Google Docs",
      icon: "",
    },
  };

  const QUICK_LINKS = [
    { title: "180+ Games Hub", url: "iboss://games", badge: "GM" },
    { title: "Neal.fun", url: "https://neal.fun/", badge: "NF" },
    {
      title: "Infinite Craft",
      url: "https://neal.fun/infinite-craft/",
      badge: "IC",
    },
    { title: "YouTube", url: "https://www.youtube.com/", badge: "YT" },
    { title: "Discord", url: "https://discord.com/app", badge: "DC" },
    {
      title: "EaglerCraft 1.8",
      url: "https://monkeygg2.github.io/games/eaglercraft/",
      badge: "MC",
    },
    {
      title: "Slope",
      url: "https://monkeygg2.github.io/games/slope/",
      badge: "SL",
    },
    {
      title: "Retro Bowl",
      url: "https://monkeygg2.github.io/games/retro-bowl/",
      badge: "RB",
    },
  ];

  const DEFAULT_SETTINGS = {
    cloak: "none",
    customTitle: "",
    customIcon: "",
    panicKey: "`",
    panicUrl: "https://classroom.google.com",
    searchEngine: "ddg",
    proxyEngine: "scramjet",
    bareTransport: "libcurl",
    wispPreset: "auto",
    customWispUrl: "",
    shieldEnabled: true,
    themePreset: "midnight",
    customColors: {
      bgBase: "#090d16",
      bgSurface: "#111827",
      accent: "#0ea5e9",
      textPrimary: "#f1f5f9",
    },
    particlesEnabled: true,
    autoCloakBlur: false,
    antiClose: false,
    ramSaver: true,
    hkGames: "Alt+G",
    hkSplit: "Alt+S",
  };

  const state = {
    prefix: "/proxy/",
    authenticated: false,
    authRequired: true,
    passcodeEnabled: true,
    camouflageServerEnabled: false,
    camoRevealed: false,
    lootlabs: { enabled: false, durationHours: 12 },
    chatEnabled: true,
    isAdmin: false,
    user: null,
    supabase: { enabled: false, url: "", anonKey: "" },
    authMode: "login",
    gateForceOpen: false,
    recordingPanicKey: false,
    decoyActive: false,
    lastPanicTapTs: 0,
    splitMode: false,
    customGames: [],
    dismissedBroadcastTs: 0,
    settings: loadJson(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS),
    bookmarks: loadJson(STORAGE_KEYS.BOOKMARKS, []),
    tabs: [],
    activeTabId: null,
    nextTabNum: 1,
    wispStatus: { label: "Ready", latency: null, blockedCount: 0 },
    requestLogs: [],
  };

  state.settings = Object.assign({}, DEFAULT_SETTINGS, state.settings || {});

  let scramjetEngine = null;
  let wispEngine = null;
  let internalPages = null;
  let adminPanel = null;
  let particlesActive = false;

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_e) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_e) {}
  }

  function showToast(msg) {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 3000);
  }

  function setLoadingProgress(active, stageMessage) {
    const bar = document.getElementById("pageProgressBar");
    const chip = document.getElementById("loadingStageChip");
    const text = document.getElementById("loadingStageText");
    if (bar) bar.classList.toggle("hidden", !active);
    if (chip) chip.classList.toggle("hidden", !active || !stageMessage);
    if (text && stageMessage) text.textContent = stageMessage;
  }

  function updateClock() {
    const clockEl = document.getElementById("heroClock");
    const dateEl = document.getElementById("heroDate");
    if (!clockEl || !dateEl) return;
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    dateEl.textContent = now.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  function getDomain(urlStr) {
    if (!urlStr) return "";
    if (/^iboss:\/\//i.test(urlStr)) {
      return urlStr.toLowerCase();
    }
    try {
      return new URL(urlStr).hostname.replace(/^www\./, "");
    } catch (_e) {
      return urlStr;
    }
  }

  function isInternalUrl(urlStr) {
    return /^iboss:\/\//i.test(String(urlStr || "").trim());
  }

  function resolveInputToUrl(rawInput) {
    const input = (rawInput || "").trim();
    if (!input) return null;

    if (/^iboss:\/\//i.test(input)) {
      return input.toLowerCase();
    }

    if (/^javascript:/i.test(input)) {
      return input;
    }

    if (input.indexOf(state.prefix) === 0) {
      return input.substr(state.prefix.length);
    }

    if (/^https?:\/\//i.test(input)) {
      return input;
    }

    const hasNoSpaces = !/\s/.test(input);
    const looksLikeHost =
      /^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(input) ||
      /^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/.*)?$/i.test(input);

    if (hasNoSpaces && looksLikeHost) {
      const isLocal = /^(localhost|127\.0\.0\.1)/i.test(input);
      return (isLocal ? "http://" : "https://") + input;
    }

    const engine =
      SEARCH_ENGINES[state.settings.searchEngine] || SEARCH_ENGINES.ddg;
    return engine.buildUrl(input);
  }

  function buildProxiedPath(targetUrl) {
    return state.prefix + targetUrl;
  }

  // --- Theme & Particle Starfield ---
  function applyTheme() {
    const presetName = state.settings.themePreset || "midnight";
    const colors =
      presetName === "custom"
        ? Object.assign(
            {},
            THEME_PRESETS.midnight,
            state.settings.customColors || {}
          )
        : THEME_PRESETS[presetName] || THEME_PRESETS.midnight;

    const root = document.documentElement;
    root.style.setProperty("--bg-base", colors.bgBase);
    root.style.setProperty("--bg-surface", colors.bgSurface);
    if (colors.bgElevated) {
      root.style.setProperty("--bg-elevated", colors.bgElevated);
    }
    root.style.setProperty("--accent", colors.accent);
    root.style.setProperty("--accent-hover", colors.accent);
    root.style.setProperty("--text-primary", colors.textPrimary);
  }

  function initParticleStarfield() {
    const canvas = document.getElementById("particleCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const stars = [];
    for (let i = 0; i < 45; i++) {
      stars.push({
        x: Math.random() * 1400,
        y: Math.random() * 900,
        r: Math.random() * 1.6 + 0.5,
        vy: Math.random() * 0.35 + 0.1,
      });
    }
    function resize() {
      canvas.width = canvas.clientWidth || window.innerWidth;
      canvas.height = canvas.clientHeight || window.innerHeight;
    }
    window.addEventListener("resize", resize);
    resize();

    function frame() {
      if (
        particlesActive &&
        state.settings.particlesEnabled !== false &&
        !document.hidden
      ) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(148, 163, 184, 0.35)";
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          s.y -= s.vy;
          if (s.y < 0) {
            s.y = canvas.height;
            s.x = Math.random() * canvas.width;
          }
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function applyWispConfiguration() {
    const preset = state.settings.wispPreset || "auto";
    let customUrl = "";
    let allowPool = true;
    if (preset === "self") {
      const proto = window.location.protocol === "https:" ? "wss://" : "ws://";
      customUrl = proto + window.location.host + "/wisp/";
      allowPool = false;
    } else if (preset === "custom") {
      customUrl = (state.settings.customWispUrl || "").trim();
      allowPool = false;
    } else if (/^wss?:\/\//i.test(preset)) {
      customUrl = preset;
      allowPool = false;
    }

    if (scramjetEngine) {
      scramjetEngine.configure({
        customWispUrl: customUrl,
        allowPoolFailover: allowPool,
        bareTransport: state.settings.bareTransport || "libcurl",
        shieldEnabled: state.settings.shieldEnabled !== false,
      });
    }
    if (wispEngine) {
      wispEngine.configure({
        customWispUrl: customUrl,
        allowPoolFailover: allowPool,
        adblockEnabled: state.settings.shieldEnabled !== false,
        blockWebrtc: state.settings.shieldEnabled !== false,
      });
    }
    updateTransportPill();
  }

  function updateTransportPill() {
    const label = document.getElementById("transportLabel");
    const shieldBtn = document.getElementById("shieldBtn");
    const shieldCount = document.getElementById("shieldCountLabel");
    const relayBadge = document.getElementById("inspectorRelayBadge");

    if (label) {
      if (state.settings.proxyEngine === "stream") {
        label.textContent = "Stream (/proxy/)";
      } else if (state.settings.proxyEngine === "wisp") {
        const ms = state.wispStatus.latency
          ? " · " + state.wispStatus.latency + "ms"
          : "";
        label.textContent = "GUST WISP" + ms;
      } else {
        const ms = state.wispStatus.latency
          ? " · " + state.wispStatus.latency + "ms"
          : "";
        label.textContent = "Scramjet" + ms;
      }
    }
    if (relayBadge) {
      relayBadge.textContent =
        state.settings.proxyEngine === "stream"
          ? "Server /proxy/"
          : state.wispStatus.label || "WISP";
    }
    if (shieldBtn) {
      shieldBtn.classList.toggle(
        "active",
        state.settings.shieldEnabled !== false
      );
    }
    if (shieldCount) {
      shieldCount.textContent =
        state.settings.shieldEnabled === false
          ? "Off"
          : String(state.wispStatus.blockedCount || 0);
    }
  }

  function appendInspectorLog(entry) {
    state.requestLogs.unshift(entry);
    if (state.requestLogs.length > 100) {
      state.requestLogs.pop();
    }
    const list = document.getElementById("inspectorList");
    if (!list) return;
    if (list.querySelector(".empty-bookmarks")) {
      list.innerHTML = "";
    }
    const row = document.createElement("div");
    row.className = "log-row";

    const st = document.createElement("span");
    st.className = "log-status " + (entry.status >= 400 ? "err" : "ok");
    st.textContent = String(entry.status || 200);

    const u = document.createElement("span");
    u.className = "log-url";
    u.title = entry.url;
    u.textContent = entry.url.replace(/^https?:\/\//i, "");

    const meta = document.createElement("span");
    meta.className = "log-meta";
    const kb = ((entry.bytes || 0) / 1024).toFixed(1);
    meta.textContent = kb + "KB · " + entry.ms + "ms";

    row.appendChild(st);
    row.appendChild(u);
    row.appendChild(meta);
    list.insertBefore(row, list.firstChild);
    while (list.children.length > 100) {
      list.removeChild(list.lastChild);
    }
  }

  // --- Stealth: Cloak, Decoy Overlay, about:blank, blob: & Panic ---
  function getEffectiveCloak() {
    if (state.decoyActive) {
      return {
        label: "Google Docs",
        title: CLOAK_PRESETS.gdocs.title,
        icon: CLOAK_PRESETS.gdocs.icon,
        presetKey: "gdocs",
      };
    }
    const presetKey = state.settings.cloak || "none";
    const preset = CLOAK_PRESETS[presetKey] || CLOAK_PRESETS.none;
    const title =
      presetKey === "custom"
        ? state.settings.customTitle || "Google Docs"
        : preset.title;
    const icon =
      presetKey === "custom"
        ? state.settings.customIcon || CLOAK_PRESETS.gdocs.icon
        : preset.icon;
    return { label: preset.label, title, icon, presetKey };
  }

  function applyCloak(forceBlurDocs) {
    const c = forceBlurDocs
      ? {
          label: "Google Docs",
          title: CLOAK_PRESETS.gdocs.title,
          icon: CLOAK_PRESETS.gdocs.icon,
        }
      : getEffectiveCloak();
    document.title = c.title;
    let link = document.getElementById("pageFavicon");
    if (!link) {
      link = document.createElement("link");
      link.id = "pageFavicon";
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = c.icon;

    const panicKeyBadge = document.getElementById("panicKeyBadge");
    if (panicKeyBadge) {
      panicKeyBadge.textContent = state.settings.panicKey || "`";
    }
    const statusText = document.getElementById("stealthStatusText");
    if (statusText) {
      const engLabel =
        state.settings.proxyEngine === "stream"
          ? "Server Stream"
          : state.settings.proxyEngine === "wisp"
          ? "GUST Blob WISP"
          : "Scramjet + WISP";
      statusText.textContent =
        engLabel +
        " · Cloak: " +
        c.label +
        " · Boss: [" +
        (state.settings.panicKey || "`") +
        "]";
    }
  }

  function setTabAudioMuted(tab, muted) {
    tab.muted = Boolean(muted);
    if (tab.iframe) {
      tab.iframe.dataset.muted = tab.muted ? "true" : "false";
      try {
        const doc = tab.iframe.contentDocument;
        if (doc) {
          doc.querySelectorAll("video, audio").forEach((m) => {
            m.muted = tab.muted;
          });
        }
      } catch (_e) {}
    }
    updateMuteButtonUI();
  }

  function setDecoyOverlay(active) {
    state.decoyActive = Boolean(active);
    const el = document.getElementById("decoyOverlay");
    if (el) {
      el.classList.toggle("hidden", !state.decoyActive);
    }
    if (state.decoyActive) {
      state.tabs.forEach((t) => setTabAudioMuted(t, true));
    }
    applyCloak();
  }

  function triggerPanicRedirect() {
    const dest =
      (state.settings.panicUrl || "").trim() || "https://classroom.google.com";
    try {
      window.top.location.replace(dest);
    } catch (_e) {
      window.location.replace(dest);
    }
  }

  function handleBossKeyActivation() {
    const now = Date.now();
    if (now - state.lastPanicTapTs < 450) {
      triggerPanicRedirect();
      return;
    }
    state.lastPanicTapTs = now;
    setDecoyOverlay(!state.decoyActive);
  }

  function openInAboutBlank(targetHref) {
    const urlToEmbed = targetHref || window.location.href;
    const win = window.open("about:blank", "_blank");
    if (!win || !win.document) {
      showToast("Popup blocked — allow popups to use about:blank stealth.");
      return;
    }

    const c = getEffectiveCloak();
    const cloakTitle =
      c.presetKey === "none" ? CLOAK_PRESETS.gdocs.title : c.title;
    const cloakIcon =
      c.presetKey === "none" ? CLOAK_PRESETS.gdocs.icon : c.icon;

    const doc = win.document;
    doc.open();
    doc.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title></title>' +
        '<link id="icon" rel="icon">' +
        "<style>html,body,iframe{margin:0;padding:0;width:100%;height:100%;border:0;overflow:hidden;background:#090d16}</style>" +
        '</head><body><iframe allow="fullscreen; autoplay; clipboard-read; clipboard-write; gamepad"></iframe></body></html>'
    );
    doc.close();
    doc.title = cloakTitle;
    const iconEl = doc.getElementById("icon");
    if (iconEl) iconEl.href = cloakIcon;
    doc.querySelector("iframe").src = urlToEmbed;
  }

  function openInBlobTab(targetHref) {
    const urlToEmbed = targetHref || window.location.href;
    const c = getEffectiveCloak();
    const cloakTitle =
      c.presetKey === "none" ? CLOAK_PRESETS.gdocs.title : c.title;
    const cloakIcon =
      c.presetKey === "none" ? CLOAK_PRESETS.gdocs.icon : c.icon;

    const html =
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
      cloakTitle.replace(/</g, "&lt;") +
      '</title><link rel="icon" href="' +
      cloakIcon.replace(/"/g, "&quot;") +
      '"><style>html,body,iframe{margin:0;padding:0;width:100%;height:100%;border:0;overflow:hidden;background:#090d16}</style></head>' +
      '<body><iframe src="' +
      urlToEmbed.replace(/"/g, "&quot;") +
      '" allow="fullscreen; autoplay; clipboard-read; clipboard-write; gamepad"></iframe></body></html>';
    const bUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const win = window.open(bUrl, "_blank");
    if (!win) {
      showToast("Popup blocked — allow popups to launch blob: tab.");
    }
  }

  // --- Supabase Cloud Sync (Bookmarks + Settings + Game Saves) ---
  function getStoredSupabaseTokens() {
    return loadJson(STORAGE_KEYS.SUPABASE_SESSION, null);
  }

  function setStoredSupabaseTokens(tokens) {
    if (!tokens) {
      localStorage.removeItem(STORAGE_KEYS.SUPABASE_SESSION);
      return;
    }
    saveJson(STORAGE_KEYS.SUPABASE_SESSION, tokens);
  }

  async function syncFromCloud(restoreSavesToo) {
    const tokens = getStoredSupabaseTokens();
    if (!tokens || !tokens.access_token || !state.supabase.url) return;

    try {
      const res = await fetch("/api/user-data", {
        headers: { "X-Supabase-Token": tokens.access_token },
      });
      const payload = await res.json();

      let cloudRow = null;
      if (payload.ok && payload.data) {
        cloudRow = payload.data;
      } else if (payload.fallbackDirect && tokens.user && tokens.user.id) {
        const directRes = await fetch(
          state.supabase.url +
            "/rest/v1/ibossbad_user_data?user_id=eq." +
            encodeURIComponent(tokens.user.id) +
            "&select=bookmarks,settings,game_saves,updated_at&limit=1",
          {
            headers: {
              apikey: state.supabase.anonKey,
              Authorization: "Bearer " + tokens.access_token,
            },
          }
        );
        if (directRes.ok) {
          const rows = await directRes.json();
          cloudRow = Array.isArray(rows) ? rows[0] : null;
        }
      }

      if (cloudRow) {
        if (Array.isArray(cloudRow.bookmarks) && cloudRow.bookmarks.length) {
          state.bookmarks = cloudRow.bookmarks;
          saveJson(STORAGE_KEYS.BOOKMARKS, state.bookmarks);
        }
        if (
          cloudRow.settings &&
          typeof cloudRow.settings === "object" &&
          Object.keys(cloudRow.settings).length
        ) {
          state.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            cloudRow.settings
          );
          saveJson(STORAGE_KEYS.SETTINGS, state.settings);
        }
        if (
          restoreSavesToo &&
          cloudRow.game_saves &&
          typeof cloudRow.game_saves === "object"
        ) {
          Object.keys(cloudRow.game_saves).forEach((k) => {
            if (
              k !== STORAGE_KEYS.SUPABASE_SESSION &&
              typeof cloudRow.game_saves[k] === "string"
            ) {
              localStorage.setItem(k, cloudRow.game_saves[k]);
            }
          });
          showToast("Game saves restored from Cloud!");
        }
        applyTheme();
        applyCloak();
        applyWispConfiguration();
        syncToolbarSettings();
        renderBookmarks();
      }
    } catch (_e) {}
  }

  async function pushToCloud(optionalGameSaves) {
    const tokens = getStoredSupabaseTokens();
    if (!tokens || !tokens.access_token || !state.supabase.url) {
      if (optionalGameSaves) {
        showToast("Sign in with Cloud Account first to sync game saves.");
      }
      return;
    }

    const bodyPayload = {
      bookmarks: state.bookmarks,
      settings: state.settings,
    };
    if (optionalGameSaves) {
      bodyPayload.game_saves = optionalGameSaves;
    }

    try {
      const res = await fetch("/api/user-data", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Supabase-Token": tokens.access_token,
        },
        body: JSON.stringify(bodyPayload),
      });
      const payload = await res.json();

      if (payload.fallbackDirect && tokens.user && tokens.user.id) {
        const directBody = {
          user_id: tokens.user.id,
          bookmarks: state.bookmarks,
          settings: state.settings,
          updated_at: new Date().toISOString(),
        };
        if (optionalGameSaves) {
          directBody.game_saves = optionalGameSaves;
        }
        await fetch(
          state.supabase.url +
            "/rest/v1/ibossbad_user_data?on_conflict=user_id",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: state.supabase.anonKey,
              Authorization: "Bearer " + tokens.access_token,
              Prefer: "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(directBody),
          }
        );
      }
      if (optionalGameSaves) {
        showToast("Synced game saves to Cloud!");
      }
    } catch (_e) {}
  }

  // --- Tabs, Split-Screen, PiP & RAM Saver ---
  function getActiveTab() {
    return state.tabs.find((t) => t.id === state.activeTabId) || null;
  }

  function persistOpenTabs() {
    if (state.settings.ramSaver === false) return;
    const urls = state.tabs
      .map((t) => t.url)
      .filter((u) => u && !/^javascript:/i.test(u));
    saveJson(STORAGE_KEYS.OPEN_TABS, urls.slice(0, 12));
  }

  function tearDownAllTabs() {
    state.tabs.forEach((t) => {
      if (scramjetEngine) scramjetEngine.destroyTabFrame(t.id);
      if (t.blobUrl) URL.revokeObjectURL(t.blobUrl);
      if (t.iframe) t.iframe.remove();
    });
    state.tabs = [];
    state.activeTabId = null;
    localStorage.removeItem(STORAGE_KEYS.OPEN_TABS);
    createTab("", true);
  }

  function createTab(initialUrl, switchImmediately) {
    const id = "tab-" + state.nextTabNum++;
    const tab = {
      id: id,
      title: "New Tab",
      url: "",
      iframe: null,
      blobUrl: null,
      history: [],
      historyIdx: -1,
      navToken: 0,
      muted: false,
      sleeping: false,
      lastActiveTs: Date.now(),
    };
    state.tabs.push(tab);

    if (switchImmediately !== false) {
      state.activeTabId = id;
    }

    if (initialUrl) {
      navigateTab(tab, initialUrl, true);
    } else {
      renderTabs();
      updateViewportForActiveTab();
    }

    return tab;
  }

  function ensureIframeForTab(tab) {
    if (tab.iframe) return tab.iframe;
    const stage = document.getElementById("iframesContainer");
    const iframe = document.createElement("iframe");
    iframe.className = "proxy-iframe tab-iframe";
    iframe.dataset.tabId = tab.id;
    iframe.dataset.muted = tab.muted ? "true" : "false";
    iframe.setAttribute(
      "allow",
      "fullscreen; autoplay; clipboard-read; clipboard-write; gamepad"
    );
    iframe.addEventListener("load", () => {
      try {
        const docTitle = iframe.contentDocument && iframe.contentDocument.title;
        if (docTitle) {
          tab.title = docTitle;
        }
        const loc = iframe.contentWindow && iframe.contentWindow.location;
        if (loc && loc.pathname && loc.pathname.indexOf(state.prefix) === 0) {
          const decoded =
            loc.pathname.substr(state.prefix.length) +
            (loc.search || "") +
            (loc.hash || "");
          tab.url = decoded.replace(/^(https?:\/)([^/])/i, "$1/$2");
        }
        if (window.IbossExtensions && iframe.contentWindow) {
          window.IbossExtensions.applyModsAndExtensionsToWindow(
            iframe.contentWindow
          );
        }
      } catch (_e) {}
      renderTabs();
      if (tab.id === state.activeTabId) {
        updateOmniboxForTab(tab);
      }
    });
    stage.appendChild(iframe);
    tab.iframe = iframe;
    return iframe;
  }

  function buildErrorBlobUrl(targetUrl, errMsg, tabId) {
    const safeUrl = String(targetUrl)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
    const safeErr = String(errMsg || "Unable to connect")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;");
    const html =
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Blocked / Error</title>' +
      "<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0b0f19;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}" +
      ".card{max-width:490px;width:100%;background:#131a2b;border:1px solid #1e293b;border-radius:16px;padding:28px;box-shadow:0 20px 40px rgba(0,0,0,.45)}" +
      "h1{margin:0 0 10px;font-size:20px;color:#f8fafc}p{margin:0 0 14px;color:#94a3b8;line-height:1.5;font-size:14px}" +
      "code{display:block;background:#090d16;border:1px solid #1e293b;padding:10px 12px;border-radius:8px;color:#f87171;font-size:12px;word-break:break-all;margin-bottom:18px}" +
      ".btns{display:flex;gap:10px;flex-wrap:wrap}button{background:#0ea5e9;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:600;cursor:pointer;font-size:13px}</style></head>" +
      '<body><div class="card"><h1>Unable to open site</h1>' +
      "<p>Target: <strong>" +
      safeUrl +
      "</strong></p>" +
      "<code>" +
      safeErr +
      "</code>" +
      '<div class="btns">' +
      "<button onclick=\"window.top.postMessage({__ibossWisp:true,tabId:'" +
      String(tabId || "") +
      "',action:'reload'},'*')\">Retry</button>" +
      "</div></div></body></html>";
    return URL.createObjectURL(new Blob([html], { type: "text/html" }));
  }

  function executeJavascriptInActiveTab(jsUriOrCode) {
    const code = String(jsUriOrCode).replace(/^javascript:\s*/i, "");
    let decoded = code;
    try {
      decoded = decodeURIComponent(code);
    } catch (_e) {}
    const tab = getActiveTab();
    try {
      const targetWin =
        tab && tab.iframe && tab.iframe.contentWindow
          ? tab.iframe.contentWindow
          : window;
      const result = targetWin.eval(decoded);
      appendConsoleLine("> " + decoded, result);
      showToast("Executed javascript: snippet");
    } catch (err) {
      appendConsoleLine("Error: " + (err && err.message ? err.message : err));
      showToast("Script error: " + (err.message || err));
    }
  }

  async function navigateTab(tab, rawOrResolvedUrl, pushToHistory) {
    const resolved = resolveInputToUrl(rawOrResolvedUrl);
    if (!resolved) return;

    // 1) javascript: bookmarklet execution
    if (/^javascript:/i.test(resolved)) {
      executeJavascriptInActiveTab(resolved);
      return;
    }

    tab.sleeping = false;
    tab.lastActiveTs = Date.now();
    const myToken = ++tab.navToken;

    // 2) iboss:// internal protocol pages
    if (isInternalUrl(resolved)) {
      if (resolved === "iboss://settings") {
        openSettingsModal();
        return;
      }
      if (resolved === "iboss://newtab") {
        tab.url = "";
        tab.title = "New Tab";
        if (tab.iframe) {
          tab.iframe.remove();
          tab.iframe = null;
        }
        renderTabs();
        updateViewportForActiveTab();
        persistOpenTabs();
        return;
      }
      tab.url = resolved;
      tab.title = resolved.replace(/^iboss:\/\//i, "").toUpperCase();
      if (pushToHistory !== false && tab.history[tab.historyIdx] !== resolved) {
        tab.history = tab.history.slice(0, tab.historyIdx + 1);
        tab.history.push(resolved);
        tab.historyIdx = tab.history.length - 1;
      }
      renderTabs();
      updateViewportForActiveTab();
      persistOpenTabs();
      return;
    }

    tab.url = resolved;
    tab.title = getDomain(resolved);

    if (pushToHistory !== false) {
      if (tab.history[tab.historyIdx] !== resolved) {
        tab.history = tab.history.slice(0, tab.historyIdx + 1);
        tab.history.push(resolved);
        tab.historyIdx = tab.history.length - 1;
      }
    }

    const iframe = ensureIframeForTab(tab);
    renderTabs();
    updateViewportForActiveTab();
    persistOpenTabs();

    // Policy check + Access Log recording across all engines
    try {
      const checkRes = await fetch(
        "/api/check-url?url=" +
          encodeURIComponent(resolved) +
          "&engine=" +
          encodeURIComponent(state.settings.proxyEngine)
      );
      if (checkRes.status === 403 || checkRes.status === 503) {
        const checkData = await checkRes.json();
        tab.blobUrl = buildErrorBlobUrl(
          resolved,
          (checkData && checkData.reason) || "Blocked by instance policy.",
          tab.id
        );
        iframe.src = tab.blobUrl;
        return;
      }
    } catch (_e) {}

    // Classic Server Stream (/proxy/) engine
    if (state.settings.proxyEngine === "stream") {
      if (tab.blobUrl) {
        URL.revokeObjectURL(tab.blobUrl);
        tab.blobUrl = null;
      }
      iframe.src = buildProxiedPath(resolved);
      return;
    }

    // Flagship Scramjet Service Worker + BareMux WISP engine
    if (state.settings.proxyEngine === "scramjet" && scramjetEngine) {
      if (tab.id === state.activeTabId) {
        setLoadingProgress(true, "Starting Scramjet...");
      }
      try {
        if (tab.blobUrl) {
          URL.revokeObjectURL(tab.blobUrl);
          tab.blobUrl = null;
        }
        await scramjetEngine.navigateTabFrame(
          tab.id,
          iframe,
          resolved,
          (stage) => {
            if (tab.id === state.activeTabId && tab.navToken === myToken) {
              setLoadingProgress(true, stage);
            }
          }
        );
        const onLoadedOnce = () => {
          iframe.removeEventListener("load", onLoadedOnce);
          if (tab.id === state.activeTabId && tab.navToken === myToken) {
            setLoadingProgress(false, "");
          }
        };
        iframe.addEventListener("load", onLoadedOnce);
        return;
      } catch (sjErr) {
        if (!wispEngine) {
          if (tab.id === state.activeTabId && tab.navToken === myToken) {
            setLoadingProgress(false, "");
          }
          tab.blobUrl = buildErrorBlobUrl(
            resolved,
            (sjErr && sjErr.message) || "Scramjet initialization failed",
            tab.id
          );
          iframe.src = tab.blobUrl;
          return;
        }
        showToast(
          "Service Worker restricted — switched to SW-free GUST WISP fallback"
        );
      }
    }

    // SW-Free GUST Blob WISP fallback
    if (!wispEngine) {
      iframe.src = buildProxiedPath(resolved);
      return;
    }

    if (tab.id === state.activeTabId) {
      setLoadingProgress(true, "Connecting via WISP...");
    }

    try {
      const res = await wispEngine.loadPage(resolved, tab.id, (stage) => {
        if (tab.id === state.activeTabId && tab.navToken === myToken) {
          setLoadingProgress(true, stage);
        }
      });

      if (tab.navToken !== myToken) {
        URL.revokeObjectURL(res.blobUrl);
        return;
      }

      if (tab.blobUrl) {
        URL.revokeObjectURL(tab.blobUrl);
      }
      tab.blobUrl = res.blobUrl;
      tab.url = res.finalUrl || resolved;
      tab.title = res.title || getDomain(tab.url);
      tab.history[tab.historyIdx] = tab.url;
      iframe.src = res.blobUrl;
      renderTabs();
      if (tab.id === state.activeTabId) {
        updateOmniboxForTab(tab);
      }
    } catch (err) {
      if (tab.navToken !== myToken) return;
      if (tab.blobUrl) URL.revokeObjectURL(tab.blobUrl);
      tab.blobUrl = buildErrorBlobUrl(
        resolved,
        (err && err.message) || "WISP connection failed",
        tab.id
      );
      iframe.src = tab.blobUrl;
    } finally {
      if (tab.id === state.activeTabId && tab.navToken === myToken) {
        setLoadingProgress(false, "");
      }
    }
  }

  function closeTab(tabId) {
    const idx = state.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const [removed] = state.tabs.splice(idx, 1);
    if (scramjetEngine) {
      scramjetEngine.destroyTabFrame(tabId);
    }
    if (removed.blobUrl) {
      URL.revokeObjectURL(removed.blobUrl);
    }
    if (removed.iframe) {
      removed.iframe.remove();
    }

    if (state.tabs.length === 0) {
      createTab("", true);
      return;
    }

    if (state.activeTabId === tabId) {
      const nextIdx = Math.min(idx, state.tabs.length - 1);
      state.activeTabId = state.tabs[nextIdx].id;
    }

    renderTabs();
    updateViewportForActiveTab();
    persistOpenTabs();
  }

  function switchTab(tabId) {
    state.activeTabId = tabId;
    const tab = getActiveTab();
    if (tab) {
      tab.lastActiveTs = Date.now();
      if (tab.sleeping && tab.url) {
        tab.sleeping = false;
        navigateTab(tab, tab.url, false);
        return;
      }
    }
    setLoadingProgress(false, "");
    renderTabs();
    updateViewportForActiveTab();
  }

  function updateMuteButtonUI() {
    const btn = document.getElementById("muteTabBtn");
    const tab = getActiveTab();
    if (!btn) return;
    btn.style.color = tab && tab.muted ? "var(--danger)" : "";
  }

  function updateOmniboxForTab(tab) {
    const input = document.getElementById("omniboxInput");
    const bmBtn = document.getElementById("bookmarkToggleBtn");
    const starIcon = document.getElementById("bookmarkStarIcon");
    updateMuteButtonUI();
    if (!tab || !tab.url) {
      input.value = "";
      bmBtn.classList.add("hidden");
      return;
    }
    input.value = tab.url;
    bmBtn.classList.remove("hidden");
    const isSaved = state.bookmarks.some((b) => b.url === tab.url);
    bmBtn.classList.toggle("bookmarked", isSaved);
    starIcon.setAttribute("fill", isSaved ? "currentColor" : "none");
  }

  function updateViewportForActiveTab() {
    const activeTab = getActiveTab();
    const newTabView = document.getElementById("newTabView");
    const internalView = document.getElementById("internalPageView");
    const iframesStage = document.getElementById("iframesContainer");

    const url = (activeTab && activeTab.url) || "";
    const internal = isInternalUrl(url);

    // Pause background particles whenever an active external game/site is showing
    particlesActive = !url;

    // Determine secondary tab if Split-Screen mode is active
    let secondaryTabId = null;
    if (state.splitMode) {
      const other = state.tabs.find(
        (t) =>
          t.id !== (activeTab && activeTab.id) &&
          t.url &&
          !isInternalUrl(t.url) &&
          t.iframe
      );
      if (other) secondaryTabId = other.id;
    }

    iframesStage.classList.toggle(
      "split-active",
      Boolean(state.splitMode && secondaryTabId)
    );

    state.tabs.forEach((t) => {
      if (t.iframe) {
        const isPrimary = Boolean(
          activeTab && t.id === activeTab.id && t.url && !internal
        );
        const isSecondary = Boolean(secondaryTabId && t.id === secondaryTabId);
        t.iframe.classList.toggle("active", isPrimary);
        t.iframe.classList.toggle("split-visible", isPrimary || isSecondary);
      }
    });

    if (!url) {
      newTabView.classList.remove("hidden");
      internalView.classList.add("hidden");
      iframesStage.classList.add("hidden");
    } else if (internal) {
      newTabView.classList.add("hidden");
      iframesStage.classList.add("hidden");
      internalView.classList.remove("hidden");
      if (url === "iboss://admin" && adminPanel) {
        adminPanel.open(internalView);
      } else if (internalPages) {
        internalPages.render(url, internalView);
      }
    } else {
      newTabView.classList.add("hidden");
      internalView.classList.add("hidden");
      iframesStage.classList.remove("hidden");
    }

    updateOmniboxForTab(activeTab);
  }

  function renderTabs() {
    const container = document.getElementById("tabsContainer");
    container.innerHTML = "";

    state.tabs.forEach((tab) => {
      const el = document.createElement("div");
      el.className =
        "browser-tab" + (tab.id === state.activeTabId ? " active" : "");
      el.setAttribute("role", "tab");

      const badge = document.createElement("span");
      badge.className = "tab-favicon";
      badge.textContent = tab.muted
        ? "🔇"
        : tab.sleeping
        ? "💤"
        : tab.url
        ? getDomain(tab.url)
            .replace(/^iboss:\/\//, "")
            .charAt(0)
            .toUpperCase()
        : "+";

      const title = document.createElement("span");
      title.className = "tab-title";
      title.textContent = tab.title || "New Tab";

      const close = document.createElement("button");
      close.type = "button";
      close.className = "tab-close";
      close.title = "Close Tab";
      close.textContent = "×";
      close.addEventListener("click", (ev) => {
        ev.stopPropagation();
        closeTab(tab.id);
      });

      el.addEventListener("click", () => switchTab(tab.id));
      el.appendChild(badge);
      el.appendChild(title);
      el.appendChild(close);
      container.appendChild(el);
    });
  }

  // --- Floating Mini-Window (PiP) ---
  function openMiniPlayer(targetUrl, titleText, isRawBlob) {
    const winEl = document.getElementById("miniPlayerWindow");
    const frameEl = document.getElementById("miniPlayerFrame");
    const titleEl = document.getElementById("miniPlayerTitle");
    if (!winEl || !frameEl) return;
    titleEl.textContent = titleText || "Mini Window";
    winEl.classList.remove("hidden");

    if (isRawBlob) {
      frameEl.src = targetUrl;
      return;
    }
    if (state.settings.proxyEngine === "scramjet" && scramjetEngine) {
      scramjetEngine
        .navigateTabFrame("mini-pip", frameEl, targetUrl)
        .catch(() => {
          frameEl.src = buildProxiedPath(targetUrl);
        });
    } else {
      frameEl.src = buildProxiedPath(targetUrl);
    }
  }

  function initDraggableMiniPlayer() {
    const winEl = document.getElementById("miniPlayerWindow");
    const headerEl = document.getElementById("miniPlayerHeader");
    const closeBtn = document.getElementById("closeMiniPlayerBtn");
    if (!winEl || !headerEl || !closeBtn) return;

    closeBtn.addEventListener("click", () => {
      winEl.classList.add("hidden");
      document.getElementById("miniPlayerFrame").src = "about:blank";
    });

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    headerEl.addEventListener("mousedown", (ev) => {
      if (ev.target === closeBtn) return;
      dragging = true;
      const rect = winEl.getBoundingClientRect();
      startX = ev.clientX;
      startY = ev.clientY;
      origLeft = rect.left;
      origTop = rect.top;
      winEl.style.right = "auto";
      winEl.style.bottom = "auto";
      winEl.style.left = origLeft + "px";
      winEl.style.top = origTop + "px";
    });

    window.addEventListener("mousemove", (ev) => {
      if (!dragging) return;
      winEl.style.left = Math.max(0, origLeft + (ev.clientX - startX)) + "px";
      winEl.style.top = Math.max(0, origTop + (ev.clientY - startY)) + "px";
    });
    window.addEventListener("mouseup", () => {
      dragging = false;
    });
  }

  // --- Unblocked DevTools Console Drawer ---
  function appendConsoleLine(label, value) {
    const out = document.getElementById("devtoolsOutput");
    if (!out) return;
    if (out.querySelector(".empty-bookmarks")) out.innerHTML = "";
    const row = document.createElement("div");
    row.className = "log-row";
    let formatted = label;
    if (arguments.length > 1) {
      try {
        formatted +=
          " -> " +
          (typeof value === "object" ? JSON.stringify(value) : String(value));
      } catch (_e) {
        formatted += " -> [Object]";
      }
    }
    row.textContent = formatted;
    out.appendChild(row);
    out.scrollTop = out.scrollHeight;
  }

  // --- Quick Links & Bookmarks ---
  function renderQuickLinks() {
    const grid = document.getElementById("quickLinksGrid");
    grid.innerHTML = "";

    QUICK_LINKS.forEach((item) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "site-card";
      card.addEventListener("click", () => {
        const tab = getActiveTab() || createTab("", true);
        navigateTab(tab, item.url, true);
      });

      const icon = document.createElement("div");
      icon.className = "card-icon";
      icon.textContent = item.badge;

      const meta = document.createElement("div");
      meta.className = "card-meta";
      const t = document.createElement("div");
      t.className = "card-title";
      t.textContent = item.title;
      const d = document.createElement("div");
      d.className = "card-domain";
      d.textContent = getDomain(item.url);
      meta.appendChild(t);
      meta.appendChild(d);

      card.appendChild(icon);
      card.appendChild(meta);
      grid.appendChild(card);
    });
  }

  function renderBookmarksBar() {
    const bar = document.getElementById("bookmarksBar");
    if (!bar) return;
    bar.innerHTML = "";
    const items = state.bookmarks.length
      ? state.bookmarks
      : QUICK_LINKS.slice(0, 6);

    items.forEach((bm) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "bm-chip";
      chip.title = bm.url;
      chip.addEventListener("click", () => {
        const tab = getActiveTab() || createTab("", true);
        navigateTab(tab, bm.url, true);
      });

      const dot = document.createElement("span");
      dot.className = "bm-chip-dot";
      const label = document.createElement("span");
      label.textContent = bm.title || getDomain(bm.url);
      chip.appendChild(dot);
      chip.appendChild(label);
      bar.appendChild(chip);
    });
  }

  function renderBookmarks() {
    renderBookmarksBar();
    const grid = document.getElementById("bookmarksGrid");
    grid.innerHTML = "";

    if (!state.bookmarks.length) {
      const empty = document.createElement("div");
      empty.className = "empty-bookmarks";
      empty.textContent =
        "No saved bookmarks yet. Click the star in the address bar or '+ Add Bookmark' to pin your favorite sites.";
      grid.appendChild(empty);
      return;
    }

    state.bookmarks.forEach((bm, idx) => {
      const card = document.createElement("div");
      card.className = "site-card";
      card.addEventListener("click", () => {
        const tab = getActiveTab() || createTab("", true);
        navigateTab(tab, bm.url, true);
      });

      const icon = document.createElement("div");
      icon.className = "card-icon";
      icon.textContent = (bm.title || getDomain(bm.url) || "B")
        .charAt(0)
        .toUpperCase();

      const meta = document.createElement("div");
      meta.className = "card-meta";
      const t = document.createElement("div");
      t.className = "card-title";
      t.textContent = bm.title || getDomain(bm.url);
      const d = document.createElement("div");
      d.className = "card-domain";
      d.textContent = getDomain(bm.url);
      meta.appendChild(t);
      meta.appendChild(d);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "card-delete";
      del.title = "Remove bookmark";
      del.textContent = "×";
      del.addEventListener("click", (ev) => {
        ev.stopPropagation();
        state.bookmarks.splice(idx, 1);
        saveJson(STORAGE_KEYS.BOOKMARKS, state.bookmarks);
        renderBookmarks();
        updateOmniboxForTab(getActiveTab());
        pushToCloud();
      });

      card.appendChild(icon);
      card.appendChild(meta);
      card.appendChild(del);
      grid.appendChild(card);
    });
  }

  function toggleBookmarkForActiveTab() {
    const tab = getActiveTab();
    if (!tab || !tab.url) return;
    const existingIdx = state.bookmarks.findIndex((b) => b.url === tab.url);
    if (existingIdx !== -1) {
      state.bookmarks.splice(existingIdx, 1);
      showToast("Removed bookmark");
    } else {
      state.bookmarks.unshift({
        title: tab.title || getDomain(tab.url),
        url: tab.url,
      });
      showToast("Saved bookmark");
    }
    saveJson(STORAGE_KEYS.BOOKMARKS, state.bookmarks);
    renderBookmarks();
    updateOmniboxForTab(tab);
    pushToCloud();
  }

  // --- Camouflage Front Door + Auth Gate + Passcode-Locked Account ---
  function initCamouflageSuite() {
    let timerSecs = 25 * 60;
    let timerId = null;
    const disp = document.getElementById("camoTimerDisplay");
    function drawTimer() {
      const m = String(Math.floor(timerSecs / 60)).padStart(2, "0");
      const s = String(timerSecs % 60).padStart(2, "0");
      if (disp) disp.textContent = m + ":" + s;
    }
    document
      .getElementById("camoStartTimerBtn")
      .addEventListener("click", (ev) => {
        if (timerId) {
          clearInterval(timerId);
          timerId = null;
          ev.target.textContent = "Start Focus";
        } else {
          ev.target.textContent = "Pause";
          timerId = setInterval(() => {
            if (timerSecs > 0) timerSecs--;
            drawTimer();
          }, 1000);
        }
      });
    document
      .getElementById("camoResetTimerBtn")
      .addEventListener("click", () => {
        timerSecs = 25 * 60;
        drawTimer();
      });
    document
      .getElementById("camoBreakTimerBtn")
      .addEventListener("click", () => {
        timerSecs = 5 * 60;
        drawTimer();
      });

    document.getElementById("camoCalcEvalBtn").addEventListener("click", () => {
      const raw = document.getElementById("camoCalcInput").value;
      const out = document.getElementById("camoCalcResult");
      if (!/^[0-9+\-*/().%\s]+$/.test(raw)) {
        out.textContent = "= Invalid";
        return;
      }
      try {
        // eslint-disable-next-line no-new-func
        const val = Function('"use strict"; return (' + raw + ");")();
        out.textContent = "= " + Number(val.toFixed(6));
      } catch (_e) {
        out.textContent = "= Error";
      }
    });

    // Secret Unlock Trigger 1: Join Study Room Form
    document
      .getElementById("camoRoomForm")
      .addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const code = document.getElementById("camoCodeInput").value.trim();
        if (!code) {
          state.camoRevealed = true;
          refreshGateVisibility();
          return;
        }
        const res = await fetch("/api/auth/passcode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passcode: code }),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          state.authenticated = true;
          state.camoRevealed = true;
          state.user = data.user;
          document.getElementById("camoCodeInput").value = "";
          refreshGateVisibility();
          showToast("Browser unlocked");
        } else {
          state.camoRevealed = true;
          refreshGateVisibility();
          setGateAlert(data.error || "Enter valid passcode or 12h key.");
        }
      });

    // Secret Unlock Trigger 2: Triple-click footer version
    let footerClicks = 0;
    document
      .getElementById("camoVersionTrigger")
      .addEventListener("click", () => {
        footerClicks++;
        if (footerClicks >= 3) {
          footerClicks = 0;
          state.camoRevealed = true;
          refreshGateVisibility();
        }
      });
  }

  function setGateAlert(msg) {
    const alertBox = document.getElementById("gateAlert");
    if (!msg) {
      alertBox.classList.add("hidden");
      alertBox.textContent = "";
      return;
    }
    alertBox.textContent = msg;
    alertBox.classList.remove("hidden");
  }

  function switchGateTab(which) {
    const passTab = document.getElementById("gateTabPasscode");
    const accTab = document.getElementById("gateTabAccount");
    const passForm = document.getElementById("passcodeForm");
    const accForm = document.getElementById("accountForm");
    setGateAlert("");

    if (which === "account") {
      passTab.classList.remove("active");
      accTab.classList.add("active");
      passForm.classList.add("hidden");
      accForm.classList.remove("hidden");
    } else {
      accTab.classList.remove("active");
      passTab.classList.add("active");
      accForm.classList.add("hidden");
      passForm.classList.remove("hidden");
    }
  }

  function updateAccountBadge() {
    const dot = document.getElementById("syncDot");
    const label = document.getElementById("accountBadgeLabel");
    if (state.user && state.user.mode === "supabase") {
      dot.classList.add("synced");
      const roleTag =
        state.user.role && state.user.role !== "USER"
          ? " [" + state.user.role + "]"
          : "";
      label.textContent =
        (state.user.email ? state.user.email.split("@")[0] : "Synced") +
        roleTag;
    } else {
      dot.classList.remove("synced");
      label.textContent = "Sign In / Sync";
    }
  }

  function refreshGateVisibility() {
    const camoGate = document.getElementById("camoGate");
    const gate = document.getElementById("authGate");
    const passTab = document.getElementById("gateTabPasscode");
    const gateCodeRow = document.getElementById("accountGateCodeRow");
    const gateCodeInput = document.getElementById("accountGateCode");
    const llBtn = document.getElementById("lootlabsClaimBtn");

    if (llBtn) {
      llBtn.classList.toggle(
        "hidden",
        !(state.lootlabs && state.lootlabs.enabled)
      );
    }

    if (!state.passcodeEnabled) {
      passTab.classList.add("hidden");
      switchGateTab("account");
    } else {
      passTab.classList.remove("hidden");
    }

    // Require site passcode on Cloud Account form whenever not yet unlocked
    const needPasscodeOnAccount = state.passcodeEnabled && !state.authenticated;
    if (gateCodeRow && gateCodeInput) {
      gateCodeRow.classList.toggle("hidden", !needPasscodeOnAccount);
      gateCodeInput.required = needPasscodeOnAccount;
    }

    if (
      !state.authenticated &&
      state.camouflageServerEnabled &&
      !state.camoRevealed
    ) {
      camoGate.classList.remove("hidden");
      gate.classList.add("hidden");
    } else if (!state.authenticated || state.gateForceOpen) {
      camoGate.classList.add("hidden");
      gate.classList.remove("hidden");
    } else {
      camoGate.classList.add("hidden");
      gate.classList.add("hidden");
    }
    updateAccountBadge();
  }

  function handlePostUnlockRedirect() {
    const params = new URLSearchParams(window.location.search);
    const pendingUrl = params.get("url");
    if (params.get("key_claimed") === "1") {
      window.history.replaceState({}, "", "/");
      showToast("12-Hour Access Key activated!");
    }
    if (pendingUrl) {
      window.history.replaceState({}, "", "/");
      const tab = getActiveTab() || createTab("", true);
      navigateTab(tab, pendingUrl, true);
    }
  }

  async function handlePasscodeSubmit(ev) {
    ev.preventDefault();
    setGateAlert("");
    const code = document.getElementById("passcodeInput").value;
    const btn = document.getElementById("passcodeSubmitBtn");
    btn.disabled = true;
    try {
      const res = await fetch("/api/auth/passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: code }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setGateAlert(data.error || "Incorrect passcode or key.");
        return;
      }
      state.authenticated = true;
      state.gateForceOpen = false;
      state.user = data.user;
      document.getElementById("passcodeInput").value = "";
      refreshGateVisibility();
      if (scramjetEngine) scramjetEngine.reconnect().catch(() => {});
      if (wispEngine) wispEngine.reconnect().catch(() => {});
      handlePostUnlockRedirect();
      showToast("Browser unlocked");
    } catch (_err) {
      setGateAlert("Network error verifying passcode.");
    } finally {
      btn.disabled = false;
    }
  }

  async function handleAccountSubmit(ev) {
    ev.preventDefault();
    setGateAlert("");
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    const gateCode = document.getElementById("accountGateCode").value;

    if (!email || !password || password.length < 6) {
      setGateAlert("Enter a valid email and password (at least 6 characters).");
      return;
    }
    if (state.passcodeEnabled && !state.authenticated && !gateCode) {
      setGateAlert("Site Passcode or 12h Key is required.");
      return;
    }

    const btn = document.getElementById("accountSubmitBtn");
    btn.disabled = true;

    const isSignup = state.authMode === "signup";
    const endpoint = isSignup ? "/api/auth/signup" : "/api/auth/login";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, passcode: gateCode }),
      });
      const payload = await res.json();

      // If passcode was wrong (401/429), block immediately before any fallback!
      if (res.status === 401 || res.status === 429) {
        setGateAlert(payload.error || "Invalid site passcode.");
        return;
      }

      let sessionObj = payload.ok ? payload.session : null;

      if (payload.fallbackDirect && state.supabase.url) {
        const supaUrl = isSignup
          ? state.supabase.url + "/auth/v1/signup"
          : state.supabase.url + "/auth/v1/token?grant_type=password";

        const directRes = await fetch(supaUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: state.supabase.anonKey,
            Authorization: "Bearer " + state.supabase.anonKey,
          },
          body: JSON.stringify({ email, password }),
        });
        const directData = await directRes.json();
        const directUser =
          directData &&
          (directData.user || (directData.id ? directData : null));

        if (!directRes.ok || !directUser || !directData.access_token) {
          setGateAlert(
            (directData &&
              (directData.error_description ||
                directData.msg ||
                directData.message)) ||
              "Authentication failed (check email confirmation or credentials)."
          );
          return;
        }

        const tokenRes = await fetch("/api/auth/token-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: directData.access_token,
            passcode: gateCode,
          }),
        });
        const tokenPayload = await tokenRes.json();
        if (!tokenRes.ok || !tokenPayload.ok) {
          setGateAlert(tokenPayload.error || "Unable to establish session.");
          return;
        }

        sessionObj = {
          access_token: directData.access_token,
          refresh_token: directData.refresh_token || null,
          user: tokenPayload.user || {
            id: directUser.id,
            email: directUser.email,
            mode: "supabase",
          },
        };
      } else if (!res.ok || !payload.ok) {
        setGateAlert(payload.error || "Authentication failed.");
        return;
      }

      if (sessionObj && sessionObj.access_token) {
        setStoredSupabaseTokens(sessionObj);
      }

      state.authenticated = true;
      state.gateForceOpen = false;
      state.user = sessionObj.user;
      document.getElementById("authPassword").value = "";
      document.getElementById("accountGateCode").value = "";
      refreshGateVisibility();
      if (scramjetEngine) scramjetEngine.reconnect().catch(() => {});
      if (wispEngine) wispEngine.reconnect().catch(() => {});
      await syncFromCloud(false);
      await pushToCloud();
      handlePostUnlockRedirect();
      showToast(isSignup ? "Account created & synced!" : "Signed in & synced!");
    } catch (_err) {
      setGateAlert("Unable to reach authentication service.");
    } finally {
      btn.disabled = false;
    }
  }

  async function logoutSession() {
    await fetch("/api/auth/logout", { method: "POST" });
    setStoredSupabaseTokens(null);
    state.user = null;
    state.authenticated = !state.authRequired;
    tearDownAllTabs();
    document.getElementById("settingsModal").classList.add("hidden");
    refreshGateVisibility();
    showToast("Locked & signed out");
  }

  // --- Live Presence Heartbeat, 12h Key Timer & Instance Chat ---
  function updateKeyCountdownPill() {
    const pill = document.getElementById("keyTimerPill");
    if (!pill) return;
    const exp = state.user && state.user.keyExpiresAt;
    if (!exp || (state.user && state.user.role === "VIP")) {
      pill.classList.add("hidden");
      return;
    }
    const diff = exp - Date.now();
    if (diff <= 0) {
      pill.classList.add("hidden");
      logoutSession();
      setGateAlert("Your temporary access key has expired.");
      return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    pill.textContent =
      "Key: " +
      h +
      "h " +
      String(m).padStart(2, "0") +
      "m " +
      String(s).padStart(2, "0") +
      "s";
    pill.classList.remove("hidden");
  }

  async function sendPresenceHeartbeat() {
    if (!state.authenticated) return;
    const tab = getActiveTab();
    try {
      const res = await fetch("/api/presence/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: (tab && tab.url) || "iboss://newtab",
          title: (tab && tab.title) || "New Tab",
          engine: state.settings.proxyEngine,
        }),
      });
      if (res.status === 401 || res.status === 403) {
        logoutSession();
        return;
      }
      const data = await res.json();
      if (data.revoked) {
        logoutSession();
        return;
      }

      // Broadcast Banner
      const banner = document.getElementById("broadcastBanner");
      const bText = document.getElementById("broadcastText");
      if (
        data.broadcast &&
        data.broadcast.text &&
        data.broadcast.createdAt !== state.dismissedBroadcastTs
      ) {
        banner.className =
          "broadcast-banner " + (data.broadcast.level || "info");
        bText.textContent = "📢 " + data.broadcast.text;
        banner.dataset.ts = String(data.broadcast.createdAt || 0);
      } else {
        banner.classList.add("hidden");
      }

      // Freeze Screen
      const freezeEl = document.getElementById("freezeOverlay");
      if (data.frozen) {
        document.getElementById("freezeMessageText").textContent =
          data.freezeMessage || "Paused by Administrator.";
        freezeEl.classList.remove("hidden");
      } else {
        freezeEl.classList.add("hidden");
      }

      // Remote Admin Commands
      if (Array.isArray(data.commands)) {
        data.commands.forEach((cmd) => {
          if (cmd.type === "cloak") {
            setDecoyOverlay(true);
          } else if (cmd.type === "redirect" && cmd.data && cmd.data.url) {
            const cur = getActiveTab() || createTab("", true);
            navigateTab(cur, cmd.data.url, true);
          } else if (cmd.type === "popup" && cmd.data && cmd.data.message) {
            window.alert("Message from Admin:\n\n" + cmd.data.message);
          }
        });
      }
    } catch (_e) {}
  }

  async function refreshChatMessages() {
    const drawer = document.getElementById("chatDrawer");
    if (!drawer || drawer.classList.contains("hidden")) return;
    try {
      const r = await fetch("/api/chat");
      const d = await r.json();
      const list = document.getElementById("chatMessagesList");
      if (!d.enabled) {
        list.innerHTML =
          '<div class="empty-bookmarks">Chat is currently disabled by Admin.</div>';
        return;
      }
      if (!d.messages || !d.messages.length) {
        list.innerHTML =
          '<div class="empty-bookmarks">No messages yet — say hi!</div>';
        return;
      }
      list.innerHTML = d.messages
        .map((m) => {
          const badge =
            m.role && m.role !== "USER"
              ? '<span class="chat-badge-' + m.role + '">' + m.role + "</span> "
              : "";
          const safeAuthor = String(m.author || "user").replace(/</g, "&lt;");
          const safeText = String(m.text || "").replace(/</g, "&lt;");
          return (
            '<div class="log-row" style="flex-wrap:wrap">' +
            badge +
            "<strong>" +
            safeAuthor +
            ":</strong> <span>" +
            safeText +
            "</span></div>"
          );
        })
        .join("");
      list.scrollTop = list.scrollHeight;
    } catch (_e) {}
  }

  async function reloadCustomGames() {
    try {
      const r = await fetch("/api/games");
      const d = await r.json();
      if (d && Array.isArray(d.customGames)) {
        state.customGames = d.customGames;
      }
    } catch (_e) {}
  }

  // --- Settings Modal ---
  function syncToolbarSettings() {
    const engineSelect = document.getElementById("engineSelect");
    if (engineSelect) {
      engineSelect.value = state.settings.searchEngine || "ddg";
    }
    updateTransportPill();
  }

  function openSettingsModal() {
    const modal = document.getElementById("settingsModal");
    const grid = document.getElementById("cloakPresetsGrid");
    grid.innerHTML = "";

    Object.keys(CLOAK_PRESETS).forEach((key) => {
      const preset = CLOAK_PRESETS[key];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "cloak-option" + (state.settings.cloak === key ? " active" : "");
      if (preset.icon) {
        const img = document.createElement("img");
        img.src = preset.icon;
        img.alt = "";
        btn.appendChild(img);
      }
      const span = document.createElement("span");
      span.textContent = preset.label;
      btn.appendChild(span);

      btn.addEventListener("click", () => {
        state.settings.cloak = key;
        openSettingsModal();
      });
      grid.appendChild(btn);
    });

    document.getElementById("proxyEngineSelect").value =
      state.settings.proxyEngine || "scramjet";
    document.getElementById("bareTransportSelect").value =
      state.settings.bareTransport || "libcurl";
    document.getElementById("wispPresetSelect").value =
      state.settings.wispPreset || "auto";
    document
      .getElementById("customWispBox")
      .classList.toggle("hidden", state.settings.wispPreset !== "custom");
    document.getElementById("customWispInput").value =
      state.settings.customWispUrl || "";
    document.getElementById("shieldModeSelect").value =
      state.settings.shieldEnabled === false ? "off" : "on";

    document.getElementById("themePresetSelect").value =
      state.settings.themePreset || "midnight";
    document
      .getElementById("customThemePickers")
      .classList.toggle("hidden", state.settings.themePreset !== "custom");
    const cc = state.settings.customColors || DEFAULT_SETTINGS.customColors;
    document.getElementById("colBgPrimary").value = cc.bgBase || "#090d16";
    document.getElementById("colBgSurface").value = cc.bgSurface || "#111827";
    document.getElementById("colAccent").value = cc.accent || "#0ea5e9";
    document.getElementById("colText").value = cc.textPrimary || "#f1f5f9";
    document.getElementById("particlesSelect").value =
      state.settings.particlesEnabled === false ? "off" : "on";

    const customFields = document.getElementById("customCloakFields");
    customFields.classList.toggle("hidden", state.settings.cloak !== "custom");
    document.getElementById("customCloakTitle").value =
      state.settings.customTitle || "";
    document.getElementById("customCloakIcon").value =
      state.settings.customIcon || "";

    document.getElementById("autoCloakBlurSelect").value = state.settings
      .autoCloakBlur
      ? "on"
      : "off";
    document.getElementById("antiCloseSelect").value = state.settings.antiClose
      ? "on"
      : "off";
    document.getElementById("ramSaverSelect").value =
      state.settings.ramSaver === false ? "off" : "on";

    document.getElementById("currentPanicKeyLabel").textContent =
      state.settings.panicKey || "`";
    document.getElementById("panicUrlInput").value =
      state.settings.panicUrl || "https://classroom.google.com";
    document.getElementById("hkGamesInput").value =
      state.settings.hkGames || "Alt+G";
    document.getElementById("hkSplitInput").value =
      state.settings.hkSplit || "Alt+S";

    const sessionBox = document.getElementById("sessionInfoBox");
    sessionBox.innerHTML = "";
    const infoText = document.createElement("div");
    if (state.user && state.user.mode === "supabase") {
      infoText.textContent =
        "Signed in as " +
        (state.user.email || "Cloud User") +
        " (Cloud Sync active)";
    } else if (
      state.user &&
      (state.user.mode === "key" || state.user.mode === "temp_key")
    ) {
      infoText.textContent = "Unlocked with Temporary Access Key";
    } else if (state.user && state.user.mode === "passcode") {
      infoText.textContent = "Unlocked with Passcode";
    } else {
      infoText.textContent = "Local session";
    }
    sessionBox.appendChild(infoText);

    const actionWrap = document.createElement("div");
    actionWrap.style.display = "flex";
    actionWrap.style.gap = "8px";

    if (!state.user || state.user.mode !== "supabase") {
      const signInBtn = document.createElement("button");
      signInBtn.type = "button";
      signInBtn.className = "btn btn-secondary";
      signInBtn.textContent = "Cloud Sign In";
      signInBtn.addEventListener("click", () => {
        modal.classList.add("hidden");
        state.gateForceOpen = true;
        switchGateTab("account");
        refreshGateVisibility();
      });
      actionWrap.appendChild(signInBtn);
    }

    if (state.user || state.authRequired) {
      const outBtn = document.createElement("button");
      outBtn.type = "button";
      outBtn.className = "btn btn-danger";
      outBtn.textContent = state.authRequired ? "Lock / Sign Out" : "Sign Out";
      outBtn.addEventListener("click", logoutSession);
      actionWrap.appendChild(outBtn);
    }

    sessionBox.appendChild(actionWrap);
    modal.classList.remove("hidden");
  }

  function saveSettingsFromModal() {
    state.settings.proxyEngine =
      document.getElementById("proxyEngineSelect").value || "scramjet";
    state.settings.bareTransport =
      document.getElementById("bareTransportSelect").value || "libcurl";
    state.settings.wispPreset =
      document.getElementById("wispPresetSelect").value || "auto";
    state.settings.customWispUrl = document
      .getElementById("customWispInput")
      .value.trim();
    state.settings.shieldEnabled =
      document.getElementById("shieldModeSelect").value !== "off";

    state.settings.themePreset =
      document.getElementById("themePresetSelect").value || "midnight";
    state.settings.customColors = {
      bgBase: document.getElementById("colBgPrimary").value,
      bgSurface: document.getElementById("colBgSurface").value,
      accent: document.getElementById("colAccent").value,
      textPrimary: document.getElementById("colText").value,
    };
    state.settings.particlesEnabled =
      document.getElementById("particlesSelect").value !== "off";

    state.settings.customTitle = document
      .getElementById("customCloakTitle")
      .value.trim();
    state.settings.customIcon = document
      .getElementById("customCloakIcon")
      .value.trim();
    state.settings.autoCloakBlur =
      document.getElementById("autoCloakBlurSelect").value === "on";
    state.settings.antiClose =
      document.getElementById("antiCloseSelect").value === "on";
    state.settings.ramSaver =
      document.getElementById("ramSaverSelect").value !== "off";

    state.settings.panicUrl =
      document.getElementById("panicUrlInput").value.trim() ||
      "https://classroom.google.com";
    state.settings.hkGames =
      document.getElementById("hkGamesInput").value.trim() || "Alt+G";
    state.settings.hkSplit =
      document.getElementById("hkSplitInput").value.trim() || "Alt+S";

    saveJson(STORAGE_KEYS.SETTINGS, state.settings);
    applyTheme();
    applyCloak();
    applyWispConfiguration();
    syncToolbarSettings();
    pushToCloud();
    document.getElementById("settingsModal").classList.add("hidden");
    showToast("Settings & theme applied");
  }

  function matchesShortcut(ev, comboStr) {
    if (!comboStr) return false;
    const parts = comboStr
      .toLowerCase()
      .split("+")
      .map((s) => s.trim());
    const needAlt = parts.includes("alt");
    const needCtrl = parts.includes("ctrl") || parts.includes("control");
    const needShift = parts.includes("shift");
    const keyPart = parts[parts.length - 1];
    return (
      Boolean(ev.altKey) === needAlt &&
      Boolean(ev.ctrlKey) === needCtrl &&
      Boolean(ev.shiftKey) === needShift &&
      String(ev.key || "").toLowerCase() === keyPart
    );
  }

  // --- Initialization & Event Listeners ---
  async function bootstrap() {
    updateClock();
    setInterval(updateClock, 10000);
    applyTheme();
    initParticleStarfield();
    initCamouflageSuite();
    initDraggableMiniPlayer();

    if (window.IbossExtensions) {
      window.IbossExtensions.syncFpsHud();
    }

    if (window.IbossInternalPages) {
      internalPages = window.IbossInternalPages.create({
        navigate: (url) => {
          const tab = getActiveTab() || createTab("", true);
          navigateTab(tab, url, true);
        },
        openInNewTab: (url) => createTab(url, true),
        openMiniPlayer: openMiniPlayer,
        getCustomGames: () => state.customGames,
        pushGameSavesToCloud: (savesObj) => pushToCloud(savesObj),
        pullGameSavesFromCloud: () => syncFromCloud(true),
        toast: showToast,
      });
    }

    if (window.IbossAdminPanel) {
      adminPanel = window.IbossAdminPanel.create({
        getSupabaseConfig: () => state.supabase,
        onAdminAuthenticated: () => {
          state.isAdmin = true;
          showToast("Admin Command Center unlocked");
        },
        reloadCustomGames: reloadCustomGames,
        toast: showToast,
      });
    }

    if (window.IbossScramjetEngine) {
      scramjetEngine = window.IbossScramjetEngine.create({
        onStatus: (st) => {
          if (state.settings.proxyEngine === "scramjet") {
            state.wispStatus = st;
            updateTransportPill();
          }
        },
        onRequestLog: (entry) => appendInspectorLog(entry),
        onPopup: (_tabId, popupUrl) => {
          createTab(popupUrl, true);
          showToast("Opened popup in new tab");
        },
        onPageUpdate: (tabId, url, title) => {
          const targetTab = state.tabs.find((t) => t.id === tabId);
          if (!targetTab) return;
          if (url && /^https?:\/\//i.test(url)) {
            targetTab.url = url;
          }
          if (title) {
            targetTab.title = title;
          } else if (url && !targetTab.title) {
            targetTab.title = getDomain(url);
          }
          renderTabs();
          if (targetTab.id === state.activeTabId) {
            updateOmniboxForTab(targetTab);
          }
        },
        onSubframeKeydown: (key) => {
          if (state.settings.panicKey && key === state.settings.panicKey) {
            handleBossKeyActivation();
          }
        },
      });
    }

    if (window.IbossWispEngine) {
      wispEngine = window.IbossWispEngine.create({
        onStatus: (st) => {
          if (state.settings.proxyEngine === "wisp") {
            state.wispStatus = st;
            updateTransportPill();
          }
        },
        onRequestLog: (entry) => appendInspectorLog(entry),
        onNavigate: (tabId, url, newTab) => {
          if (newTab) {
            createTab(url, true);
          } else {
            const targetTab =
              state.tabs.find((t) => t.id === tabId) || getActiveTab();
            if (targetTab) {
              navigateTab(targetTab, url, true);
            }
          }
        },
        onReload: (tabId) => {
          const targetTab =
            state.tabs.find((t) => t.id === tabId) || getActiveTab();
          if (targetTab && targetTab.url) {
            navigateTab(targetTab, targetTab.url, false);
          }
        },
        onPageUpdate: (tabId, url, title) => {
          const targetTab = state.tabs.find((t) => t.id === tabId);
          if (!targetTab) return;
          if (url) targetTab.url = url;
          if (title) targetTab.title = title;
          renderTabs();
          if (targetTab.id === state.activeTabId) {
            updateOmniboxForTab(targetTab);
          }
        },
      });
    }

    applyCloak();
    applyWispConfiguration();
    syncToolbarSettings();
    renderQuickLinks();
    renderBookmarks();

    // Fetch backend status & restore tabs if unlocked
    try {
      const res = await fetch("/api/status");
      const status = await res.json();
      state.authenticated = Boolean(status.authenticated);
      state.authRequired = Boolean(status.authRequired);
      state.passcodeEnabled = Boolean(status.passcodeEnabled);
      state.camouflageServerEnabled = Boolean(status.camouflage);
      state.lootlabs = status.lootlabs || { enabled: false };
      state.chatEnabled = status.chatEnabled !== false;
      state.isAdmin = Boolean(status.isAdmin);
      state.prefix = status.prefix || "/proxy/";
      state.user = status.user || null;
      state.supabase = status.supabase || { enabled: false };

      const savedSupa = getStoredSupabaseTokens();
      if (
        !state.authenticated &&
        savedSupa &&
        savedSupa.access_token &&
        !state.passcodeEnabled
      ) {
        const restoreRes = await fetch("/api/auth/token-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: savedSupa.access_token }),
        });
        const restoreData = await restoreRes.json();
        if (restoreRes.ok && restoreData.ok) {
          state.authenticated = true;
          state.user = restoreData.user;
        }
      }

      await reloadCustomGames();
      refreshGateVisibility();

      if (state.authenticated) {
        if (scramjetEngine && state.settings.proxyEngine === "scramjet") {
          scramjetEngine.ensureReady().catch(() => {});
        } else if (wispEngine && state.settings.proxyEngine === "wisp") {
          wispEngine.ensureConnected().catch(() => {});
        }
        if (state.user && state.user.mode === "supabase") {
          syncFromCloud(false);
        }
        const savedTabs = loadJson(STORAGE_KEYS.OPEN_TABS, []);
        if (state.settings.ramSaver !== false && savedTabs.length > 0) {
          savedTabs.forEach((u, i) => createTab(u, i === 0));
        } else {
          createTab("", true);
        }
        handlePostUnlockRedirect();
      } else {
        createTab("", true);
      }
    } catch (_e) {
      createTab("", true);
    }

    // Periodic Heartbeat, Key Timer & Chromebook RAM Saver
    setInterval(updateKeyCountdownPill, 1000);
    setInterval(() => {
      sendPresenceHeartbeat();
      refreshChatMessages();
    }, 4500);

    setInterval(() => {
      if (state.settings.ramSaver === false) return;
      const now = Date.now();
      state.tabs.forEach((t) => {
        if (
          t.id !== state.activeTabId &&
          !t.sleeping &&
          t.iframe &&
          t.url &&
          !isInternalUrl(t.url) &&
          now - t.lastActiveTs > 10 * 60 * 1000
        ) {
          t.sleeping = true;
          if (scramjetEngine) scramjetEngine.destroyTabFrame(t.id);
          t.iframe.remove();
          t.iframe = null;
          renderTabs();
        }
      });
    }, 60000);

    // Auto-Cloak on Blur & Anti-Close Guard
    document.addEventListener("visibilitychange", () => {
      if (state.settings.autoCloakBlur) {
        applyCloak(document.hidden);
      }
    });
    window.addEventListener("beforeunload", (ev) => {
      if (state.settings.antiClose) {
        ev.preventDefault();
        ev.returnValue = "";
      }
    });

    // Gate & LootLabs Events
    document
      .getElementById("gateTabPasscode")
      .addEventListener("click", () => switchGateTab("passcode"));
    document
      .getElementById("gateTabAccount")
      .addEventListener("click", () => switchGateTab("account"));

    document
      .getElementById("lootlabsClaimBtn")
      .addEventListener("click", async () => {
        const r = await fetch("/api/keys/lootlabs-start");
        const d = await r.json();
        if (r.ok && d.ok && d.redirectUrl) {
          window.location.href = d.redirectUrl;
        } else {
          setGateAlert(
            (d && d.error) || "LootLabs link is not configured yet."
          );
        }
      });

    document.querySelectorAll("[data-auth-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.authMode = btn.dataset.authMode;
        document.querySelectorAll("[data-auth-mode]").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
        document.getElementById("accountSubmitBtn").textContent =
          state.authMode === "signup"
            ? "Create Account & Sync"
            : "Sign In & Sync";
        setGateAlert("");
      });
    });

    document
      .getElementById("passcodeForm")
      .addEventListener("submit", handlePasscodeSubmit);
    document
      .getElementById("accountForm")
      .addEventListener("submit", handleAccountSubmit);

    document.getElementById("authGate").addEventListener("click", (ev) => {
      if (ev.target.id === "authGate" && state.authenticated) {
        state.gateForceOpen = false;
        refreshGateVisibility();
      }
    });

    document
      .getElementById("dismissBroadcastBtn")
      .addEventListener("click", () => {
        const banner = document.getElementById("broadcastBanner");
        state.dismissedBroadcastTs = Number(banner.dataset.ts || 0);
        banner.classList.add("hidden");
      });

    // Internal Page Jump Pills on New Tab
    document.querySelectorAll("[data-internal-jump]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const url = btn.getAttribute("data-internal-jump");
        const tab = getActiveTab() || createTab("", true);
        navigateTab(tab, url, true);
      });
    });

    // Top Bar & Toolbar Navigation Events
    document
      .getElementById("newTabBtn")
      .addEventListener("click", () => createTab("", true));

    document.getElementById("gamesHubBtn").addEventListener("click", () => {
      const tab = getActiveTab() || createTab("", true);
      navigateTab(tab, "iboss://games", true);
    });

    document.getElementById("adminNavBtn").addEventListener("click", () => {
      const tab = getActiveTab() || createTab("", true);
      navigateTab(tab, "iboss://admin", true);
    });

    document.getElementById("omniboxForm").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const val = document.getElementById("omniboxInput").value;
      const tab = getActiveTab() || createTab("", true);
      navigateTab(tab, val, true);
    });

    document
      .getElementById("heroSearchForm")
      .addEventListener("submit", (ev) => {
        ev.preventDefault();
        const val = document.getElementById("heroSearchInput").value;
        const tab = getActiveTab() || createTab("", true);
        navigateTab(tab, val, true);
        document.getElementById("heroSearchInput").value = "";
      });

    document.getElementById("engineSelect").addEventListener("change", (ev) => {
      state.settings.searchEngine = ev.target.value;
      saveJson(STORAGE_KEYS.SETTINGS, state.settings);
      pushToCloud();
    });

    document.getElementById("backBtn").addEventListener("click", () => {
      const tab = getActiveTab();
      if (!tab) return;
      if (
        !isInternalUrl(tab.url) &&
        state.settings.proxyEngine === "scramjet" &&
        scramjetEngine
      ) {
        const sjFrame = scramjetEngine.getTabFrame(tab.id);
        if (sjFrame) {
          try {
            sjFrame.back();
            return;
          } catch (_e) {}
        }
      }
      if (tab.historyIdx > 0) {
        tab.historyIdx--;
        navigateTab(tab, tab.history[tab.historyIdx], false);
      }
    });

    document.getElementById("forwardBtn").addEventListener("click", () => {
      const tab = getActiveTab();
      if (!tab) return;
      if (
        !isInternalUrl(tab.url) &&
        state.settings.proxyEngine === "scramjet" &&
        scramjetEngine
      ) {
        const sjFrame = scramjetEngine.getTabFrame(tab.id);
        if (sjFrame) {
          try {
            sjFrame.forward();
            return;
          } catch (_e) {}
        }
      }
      if (tab.historyIdx < tab.history.length - 1) {
        tab.historyIdx++;
        navigateTab(tab, tab.history[tab.historyIdx], false);
      }
    });

    document.getElementById("reloadBtn").addEventListener("click", () => {
      const tab = getActiveTab();
      if (!tab || !tab.url) return;
      if (
        !isInternalUrl(tab.url) &&
        state.settings.proxyEngine === "scramjet" &&
        scramjetEngine
      ) {
        const sjFrame = scramjetEngine.getTabFrame(tab.id);
        if (sjFrame) {
          try {
            sjFrame.reload();
            return;
          } catch (_e) {}
        }
      }
      navigateTab(tab, tab.url, false);
    });

    document.getElementById("homeBtn").addEventListener("click", () => {
      const tab = getActiveTab();
      if (tab) navigateTab(tab, "iboss://newtab", true);
    });

    document.getElementById("muteTabBtn").addEventListener("click", () => {
      const tab = getActiveTab();
      if (!tab) return;
      setTabAudioMuted(tab, !tab.muted);
      renderTabs();
      showToast(tab.muted ? "Tab muted" : "Tab unmuted");
    });

    document.getElementById("splitViewBtn").addEventListener("click", () => {
      state.splitMode = !state.splitMode;
      updateViewportForActiveTab();
      showToast(
        state.splitMode
          ? "Split-Screen ON (open 2 site tabs to view side-by-side)"
          : "Split-Screen OFF"
      );
    });

    document.getElementById("fullscreenBtn").addEventListener("click", () => {
      const tab = getActiveTab();
      const el =
        (tab && tab.iframe) ||
        document.getElementById("internalPageView") ||
        document.documentElement;
      if (el && el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      }
    });

    // DevTools Console Drawer
    document.getElementById("devtoolsBtn").addEventListener("click", () => {
      document.getElementById("devtoolsDrawer").classList.toggle("hidden");
    });
    document
      .getElementById("closeDevtoolsBtn")
      .addEventListener("click", () => {
        document.getElementById("devtoolsDrawer").classList.add("hidden");
      });
    document.getElementById("clearConsoleBtn").addEventListener("click", () => {
      document.getElementById("devtoolsOutput").innerHTML = "";
    });
    document
      .getElementById("inspectDomSnapshotBtn")
      .addEventListener("click", () => {
        const tab = getActiveTab();
        try {
          const doc = tab && tab.iframe && tab.iframe.contentDocument;
          if (!doc) {
            appendConsoleLine("Open a proxied tab first to inspect DOM.");
            return;
          }
          appendConsoleLine(
            "DOM Title: " +
              doc.title +
              " | Scripts: " +
              doc.scripts.length +
              " | Links: " +
              doc.links.length
          );
          appendConsoleLine(
            doc.documentElement.outerHTML.slice(0, 600) + "..."
          );
        } catch (e) {
          appendConsoleLine("DOM Error: " + e.message);
        }
      });
    document.getElementById("devtoolsForm").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const input = document.getElementById("devtoolsInput");
      if (!input.value.trim()) return;
      executeJavascriptInActiveTab(input.value);
      input.value = "";
    });

    // Instance Chat Drawer
    document.getElementById("chatToggleBtn").addEventListener("click", () => {
      const dr = document.getElementById("chatDrawer");
      dr.classList.toggle("hidden");
      if (!dr.classList.contains("hidden")) refreshChatMessages();
    });
    document.getElementById("closeChatBtn").addEventListener("click", () => {
      document.getElementById("chatDrawer").classList.add("hidden");
    });
    document
      .getElementById("chatSendForm")
      .addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const input = document.getElementById("chatMsgInput");
        const txt = input.value.trim();
        if (!txt) return;
        input.value = "";
        const r = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: txt }),
        });
        const d = await r.json();
        if (!r.ok || !d.ok) {
          showToast((d && d.error) || "Unable to send message.");
        }
        refreshChatMessages();
      });

    document
      .getElementById("bookmarkToggleBtn")
      .addEventListener("click", toggleBookmarkForActiveTab);
    document
      .getElementById("transportPillBtn")
      .addEventListener("click", openSettingsModal);

    document.getElementById("shieldBtn").addEventListener("click", () => {
      state.settings.shieldEnabled = !(state.settings.shieldEnabled !== false);
      saveJson(STORAGE_KEYS.SETTINGS, state.settings);
      applyWispConfiguration();
      pushToCloud();
      showToast(
        state.settings.shieldEnabled
          ? "Ad & WebRTC Shield enabled"
          : "Ad & WebRTC Shield paused"
      );
    });

    document.getElementById("inspectorBtn").addEventListener("click", () => {
      document.getElementById("inspectorDrawer").classList.toggle("hidden");
    });
    document
      .getElementById("closeInspectorBtn")
      .addEventListener("click", () => {
        document.getElementById("inspectorDrawer").classList.add("hidden");
      });
    document.getElementById("clearLogBtn").addEventListener("click", () => {
      state.requestLogs = [];
      document.getElementById("inspectorList").innerHTML =
        '<div class="empty-bookmarks">Requests routed over WISP will appear here in real time.</div>';
    });

    document.getElementById("openDirectBtn").addEventListener("click", () => {
      const tab = getActiveTab();
      if (tab && tab.url && !isInternalUrl(tab.url)) {
        const directHref =
          state.settings.proxyEngine === "scramjet" && scramjetEngine
            ? scramjetEngine.encodeUrl(tab.url)
            : buildProxiedPath(tab.url);
        window.open(directHref, "_blank");
      } else {
        showToast("Open an external site first to pop it out.");
      }
    });

    document.getElementById("aboutBlankBtn").addEventListener("click", () => {
      openInAboutBlank(window.location.href);
    });
    document
      .getElementById("modalAboutBlankBtn")
      .addEventListener("click", () => {
        openInAboutBlank(window.location.href);
      });
    document.getElementById("modalBlobTabBtn").addEventListener("click", () => {
      openInBlobTab(window.location.href);
    });

    document
      .getElementById("panicBtn")
      .addEventListener("click", handleBossKeyActivation);

    document.getElementById("accountBadgeBtn").addEventListener("click", () => {
      if (state.user && state.user.mode === "supabase") {
        openSettingsModal();
      } else {
        state.gateForceOpen = true;
        switchGateTab("account");
        refreshGateVisibility();
      }
    });

    // Bookmarks form
    document
      .getElementById("showAddBookmarkBtn")
      .addEventListener("click", () => {
        document.getElementById("addBookmarkForm").classList.remove("hidden");
      });
    document
      .getElementById("cancelAddBookmarkBtn")
      .addEventListener("click", () => {
        document.getElementById("addBookmarkForm").classList.add("hidden");
      });
    document
      .getElementById("addBookmarkForm")
      .addEventListener("submit", (ev) => {
        ev.preventDefault();
        const title = document.getElementById("bmTitleInput").value.trim();
        const rawUrl = document.getElementById("bmUrlInput").value.trim();
        const url = resolveInputToUrl(rawUrl);
        if (!url) return;
        state.bookmarks.unshift({ title: title || getDomain(url), url });
        saveJson(STORAGE_KEYS.BOOKMARKS, state.bookmarks);
        renderBookmarks();
        pushToCloud();
        document.getElementById("bmTitleInput").value = "";
        document.getElementById("bmUrlInput").value = "";
        document.getElementById("addBookmarkForm").classList.add("hidden");
        showToast("Bookmark added");
      });

    // Settings Modal
    document
      .getElementById("settingsBtn")
      .addEventListener("click", openSettingsModal);
    document
      .getElementById("wispPresetSelect")
      .addEventListener("change", (ev) => {
        document
          .getElementById("customWispBox")
          .classList.toggle("hidden", ev.target.value !== "custom");
      });
    document
      .getElementById("themePresetSelect")
      .addEventListener("change", (ev) => {
        document
          .getElementById("customThemePickers")
          .classList.toggle("hidden", ev.target.value !== "custom");
      });
    document
      .getElementById("closeSettingsBtn")
      .addEventListener("click", () => {
        state.recordingPanicKey = false;
        document.getElementById("settingsModal").classList.add("hidden");
      });
    document
      .getElementById("saveSettingsBtn")
      .addEventListener("click", saveSettingsFromModal);

    document
      .getElementById("recordPanicKeyBtn")
      .addEventListener("click", () => {
        state.recordingPanicKey = true;
        document.getElementById("currentPanicKeyLabel").textContent =
          "Press any key...";
      });

    // Global Keyboard Shortcuts & Secret Camouflage Unlock
    window.addEventListener("keydown", (ev) => {
      // Secret Camouflage Front Door Unlock: Ctrl+Shift+U
      if (ev.ctrlKey && ev.shiftKey && (ev.key === "U" || ev.key === "u")) {
        ev.preventDefault();
        state.camoRevealed = true;
        refreshGateVisibility();
        return;
      }

      if (state.recordingPanicKey) {
        ev.preventDefault();
        state.recordingPanicKey = false;
        state.settings.panicKey = ev.key;
        document.getElementById("currentPanicKeyLabel").textContent = ev.key;
        return;
      }

      if (ev.altKey && (ev.key === "t" || ev.key === "T")) {
        ev.preventDefault();
        createTab("", true);
        return;
      }

      if (matchesShortcut(ev, state.settings.hkGames)) {
        ev.preventDefault();
        const tab = getActiveTab() || createTab("", true);
        navigateTab(tab, "iboss://games", true);
        return;
      }

      if (matchesShortcut(ev, state.settings.hkSplit)) {
        ev.preventDefault();
        state.splitMode = !state.splitMode;
        updateViewportForActiveTab();
        return;
      }

      const tag =
        ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : "";
      const isTyping =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (ev.target && ev.target.isContentEditable);

      if (
        state.settings.panicKey &&
        ev.key === state.settings.panicKey &&
        (!isTyping || ev.key === "Escape" || state.decoyActive)
      ) {
        ev.preventDefault();
        handleBossKeyActivation();
      }
    });

    // Listen to messages from proxied iframes & .zip Extension popups
    window.addEventListener("message", (ev) => {
      const msg = ev.data;
      if (!msg || typeof msg !== "object") return;

      if (msg.__ibossExtExec && msg.code) {
        executeJavascriptInActiveTab(msg.code);
        return;
      }

      if (msg.__ibossExtOpen && msg.url) {
        createTab(msg.url, true);
        return;
      }

      if (msg.type === "ibossbad:keydown") {
        if (state.settings.panicKey && msg.key === state.settings.panicKey) {
          handleBossKeyActivation();
        }
        return;
      }

      if (msg.type === "ibossbad:navigation") {
        const matchingTab = state.tabs.find(
          (t) => t.iframe && t.iframe.contentWindow === ev.source
        );
        if (matchingTab) {
          if (msg.url) matchingTab.url = msg.url;
          if (msg.title) matchingTab.title = msg.title;
          renderTabs();
          if (matchingTab.id === state.activeTabId) {
            updateOmniboxForTab(matchingTab);
          }
        }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", bootstrap);
})();
