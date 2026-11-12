"use strict";

(function () {
  const STORAGE_KEYS = {
    BOOKMARKS: "ibossbad_bookmarks_v1",
    SETTINGS: "ibossbad_settings_v1",
    SUPABASE_SESSION: "ibossbad_supabase_session_v1",
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
    { title: "Neal.fun", url: "https://neal.fun/", badge: "NF" },
    {
      title: "Infinite Craft",
      url: "https://neal.fun/infinite-craft/",
      badge: "IC",
    },
    { title: "YouTube", url: "https://www.youtube.com/", badge: "YT" },
    { title: "Discord", url: "https://discord.com/app", badge: "DC" },
    { title: "DuckDuckGo", url: "https://duckduckgo.com/", badge: "DD" },
    { title: "Poki Games", url: "https://poki.com/", badge: "PK" },
    { title: "Wikipedia", url: "https://en.wikipedia.org/", badge: "W" },
    { title: "2048", url: "https://play2048.co/", badge: "20" },
  ];

  const DEFAULT_SETTINGS = {
    cloak: "none",
    customTitle: "",
    customIcon: "",
    panicKey: "`",
    panicUrl: "https://classroom.google.com",
    searchEngine: "ddg",
    proxyEngine: "scramjet", // "scramjet" (SW + WISP), "wisp" (GUST Blob WISP), or "stream" (/proxy/)
    bareTransport: "libcurl", // "libcurl" or "epoxy"
    wispPreset: "auto", // "auto", "self", "wss://...", or "custom"
    customWispUrl: "",
    shieldEnabled: true,
  };

  const state = {
    prefix: "/proxy/",
    authenticated: false,
    authRequired: true,
    passcodeEnabled: true,
    user: null,
    supabase: { enabled: false, url: "", anonKey: "" },
    authMode: "login",
    gateForceOpen: false,
    recordingPanicKey: false,
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

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // ignore storage quota errors
    }
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
    }, 2800);
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
    try {
      return new URL(urlStr).hostname.replace(/^www\./, "");
    } catch (e) {
      return urlStr;
    }
  }

  function resolveInputToUrl(rawInput) {
    const input = (rawInput || "").trim();
    if (!input) return null;

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

  // --- Stealth: Cloak, about:blank, blob: & Panic ---
  function getEffectiveCloak() {
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

  function applyCloak() {
    const c = getEffectiveCloak();
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
        " · Panic: [" +
        (state.settings.panicKey || "`") +
        "]";
    }
  }

  function triggerPanic() {
    const dest =
      (state.settings.panicUrl || "").trim() || "https://classroom.google.com";
    try {
      window.top.location.replace(dest);
    } catch (e) {
      window.location.replace(dest);
    }
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

  // --- Supabase Cloud Sync (Server Proxy + Automatic Browser Fallback) ---
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

  async function syncFromCloud() {
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
            "&select=bookmarks,settings,updated_at&limit=1",
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
        applyCloak();
        applyWispConfiguration();
        syncToolbarSettings();
        renderBookmarks();
      }
    } catch (e) {
      // keep local state on transient network failure
    }
  }

  async function pushToCloud() {
    const tokens = getStoredSupabaseTokens();
    if (!tokens || !tokens.access_token || !state.supabase.url) return;

    try {
      const res = await fetch("/api/user-data", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Supabase-Token": tokens.access_token,
        },
        body: JSON.stringify({
          bookmarks: state.bookmarks,
          settings: state.settings,
        }),
      });
      const payload = await res.json();

      if (payload.fallbackDirect && tokens.user && tokens.user.id) {
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
            body: JSON.stringify({
              user_id: tokens.user.id,
              bookmarks: state.bookmarks,
              settings: state.settings,
              updated_at: new Date().toISOString(),
            }),
          }
        );
      }
    } catch (e) {
      // ignore transient sync errors
    }
  }

  // --- Tabs Management ---
  function getActiveTab() {
    return state.tabs.find((t) => t.id === state.activeTabId) || null;
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
    iframe.className = "proxy-iframe";
    iframe.dataset.tabId = tab.id;
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
      } catch (e) {
        // cross-origin or blob fallback
      }
      renderTabs();
      if (tab.id === state.activeTabId) {
        updateOmniboxForTab(tab);
      }
    });
    stage.appendChild(iframe);
    tab.iframe = iframe;
    return iframe;
  }

  function buildErrorBlobUrl(targetUrl, errMsg) {
    const safeUrl = String(targetUrl)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
    const safeErr = String(errMsg || "Unable to connect")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;");
    const html =
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Connection Error</title>' +
      "<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0b0f19;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}" +
      ".card{max-width:490px;width:100%;background:#131a2b;border:1px solid #1e293b;border-radius:16px;padding:28px;box-shadow:0 20px 40px rgba(0,0,0,.45)}" +
      "h1{margin:0 0 10px;font-size:20px;color:#f8fafc}p{margin:0 0 14px;color:#94a3b8;line-height:1.5;font-size:14px}" +
      "code{display:block;background:#090d16;border:1px solid #1e293b;padding:10px 12px;border-radius:8px;color:#f87171;font-size:12px;word-break:break-all;margin-bottom:18px}" +
      ".btns{display:flex;gap:10px;flex-wrap:wrap}button{background:#0ea5e9;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:600;cursor:pointer;font-size:13px}button.alt{background:#1e293b;color:#cbd5e1}</style></head>" +
      '<body><div class="card"><h1>Couldn\'t load that site</h1>' +
      "<p>WISP could not reach <strong>" +
      safeUrl +
      "</strong>. Check the domain spelling or switch relays in Settings.</p>" +
      "<code>" +
      safeErr +
      "</code>" +
      '<div class="btns">' +
      "<button onclick=\"window.top.postMessage({__ibossWisp:true,tabId:'" +
      "__TAB__" +
      "',action:'reload'},'*')\">Retry</button>" +
      "</div></div></body></html>";
    return URL.createObjectURL(new Blob([html], { type: "text/html" }));
  }

  async function navigateTab(tab, rawOrResolvedUrl, pushToHistory) {
    const resolved = resolveInputToUrl(rawOrResolvedUrl);
    if (!resolved) return;

    const myToken = ++tab.navToken;
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

    // 1) Classic Server Stream (/proxy/) engine
    if (state.settings.proxyEngine === "stream") {
      if (tab.blobUrl) {
        URL.revokeObjectURL(tab.blobUrl);
        tab.blobUrl = null;
      }
      iframe.src = buildProxiedPath(resolved);
      return;
    }

    // 2) Flagship Scramjet Service Worker + BareMux WISP engine (with automatic GUST fallback)
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

    // 3) SW-Free GUST Blob WISP + WASM libcurl engine
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
  }

  function switchTab(tabId) {
    state.activeTabId = tabId;
    setLoadingProgress(false, "");
    renderTabs();
    updateViewportForActiveTab();
  }

  function updateOmniboxForTab(tab) {
    const input = document.getElementById("omniboxInput");
    const bmBtn = document.getElementById("bookmarkToggleBtn");
    const starIcon = document.getElementById("bookmarkStarIcon");
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
    const iframesStage = document.getElementById("iframesContainer");

    state.tabs.forEach((t) => {
      if (t.iframe) {
        t.iframe.classList.toggle(
          "active",
          Boolean(activeTab && t.id === activeTab.id && t.url)
        );
      }
    });

    if (!activeTab || !activeTab.url) {
      newTabView.classList.remove("hidden");
      iframesStage.classList.add("hidden");
    } else {
      newTabView.classList.add("hidden");
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
      badge.textContent = tab.url
        ? getDomain(tab.url).charAt(0).toUpperCase()
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

  // --- Quick Links, Bookmarks Bar & Bookmarks Grid ---
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

  // --- Auth Gate & Account Logic ---
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
      label.textContent = state.user.email
        ? state.user.email.split("@")[0]
        : "Cloud Synced";
    } else {
      dot.classList.remove("synced");
      label.textContent = "Sign In / Sync";
    }
  }

  function refreshGateVisibility() {
    const gate = document.getElementById("authGate");
    const passTab = document.getElementById("gateTabPasscode");
    if (!state.passcodeEnabled) {
      passTab.classList.add("hidden");
      switchGateTab("account");
    } else {
      passTab.classList.remove("hidden");
    }

    if (!state.authenticated || state.gateForceOpen) {
      gate.classList.remove("hidden");
    } else {
      gate.classList.add("hidden");
    }
    updateAccountBadge();
  }

  function handlePostUnlockRedirect() {
    const params = new URLSearchParams(window.location.search);
    const pendingUrl = params.get("url");
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
        setGateAlert(data.error || "Incorrect passcode.");
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
    } catch (err) {
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
    if (!email || !password) {
      setGateAlert("Please enter your email and password.");
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
        body: JSON.stringify({ email, password }),
      });
      const payload = await res.json();

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

        if (!directRes.ok || !directUser) {
          setGateAlert(
            (directData &&
              (directData.error_description ||
                directData.msg ||
                directData.message)) ||
              "Authentication failed."
          );
          return;
        }

        if (directData.access_token) {
          const tokenRes = await fetch("/api/auth/token-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: directData.access_token }),
          });
          const tokenPayload = await tokenRes.json();
          if (!tokenRes.ok || !tokenPayload.ok) {
            setGateAlert(tokenPayload.error || "Unable to establish session.");
            return;
          }
        }

        sessionObj = {
          access_token: directData.access_token || null,
          refresh_token: directData.refresh_token || null,
          user: {
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
      refreshGateVisibility();
      if (scramjetEngine) scramjetEngine.reconnect().catch(() => {});
      if (wispEngine) wispEngine.reconnect().catch(() => {});
      await syncFromCloud();
      await pushToCloud();
      handlePostUnlockRedirect();
      showToast(isSignup ? "Account created & synced!" : "Signed in & synced!");
    } catch (err) {
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
    document.getElementById("settingsModal").classList.add("hidden");
    refreshGateVisibility();
    showToast("Signed out");
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

    const customFields = document.getElementById("customCloakFields");
    customFields.classList.toggle("hidden", state.settings.cloak !== "custom");
    document.getElementById("customCloakTitle").value =
      state.settings.customTitle || "";
    document.getElementById("customCloakIcon").value =
      state.settings.customIcon || "";

    document.getElementById("currentPanicKeyLabel").textContent =
      state.settings.panicKey || "`";
    document.getElementById("panicUrlInput").value =
      state.settings.panicUrl || "https://classroom.google.com";

    const sessionBox = document.getElementById("sessionInfoBox");
    sessionBox.innerHTML = "";
    const infoText = document.createElement("div");
    if (state.user && state.user.mode === "supabase") {
      infoText.textContent =
        "Signed in as " +
        (state.user.email || "Cloud User") +
        " (Cloud Sync active)";
    } else if (state.user && state.user.mode === "passcode") {
      infoText.textContent = "Unlocked with Passcode (Local storage only)";
    } else {
      infoText.textContent = "Local session (Sign in to sync across devices)";
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

    state.settings.customTitle = document
      .getElementById("customCloakTitle")
      .value.trim();
    state.settings.customIcon = document
      .getElementById("customCloakIcon")
      .value.trim();
    state.settings.panicUrl =
      document.getElementById("panicUrlInput").value.trim() ||
      "https://classroom.google.com";

    saveJson(STORAGE_KEYS.SETTINGS, state.settings);
    applyCloak();
    applyWispConfiguration();
    syncToolbarSettings();
    pushToCloud();
    document.getElementById("settingsModal").classList.add("hidden");
    showToast("Settings saved & applied");
  }

  // --- Initialization & Event Listeners ---
  async function bootstrap() {
    updateClock();
    setInterval(updateClock, 10000);

    if (window.IbossScramjetEngine) {
      scramjetEngine = window.IbossScramjetEngine.create({
        onStatus: (st) => {
          if (state.settings.proxyEngine === "scramjet") {
            state.wispStatus = st;
            updateTransportPill();
          }
        },
        onRequestLog: (entry) => {
          appendInspectorLog(entry);
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
            triggerPanic();
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
        onRequestLog: (entry) => {
          appendInspectorLog(entry);
        },
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
    createTab("", true);

    // Fetch backend status
    try {
      const res = await fetch("/api/status");
      const status = await res.json();
      state.authenticated = Boolean(status.authenticated);
      state.authRequired = Boolean(status.authRequired);
      state.passcodeEnabled = Boolean(status.passcodeEnabled);
      state.prefix = status.prefix || "/proxy/";
      state.user = status.user || null;
      state.supabase = status.supabase || { enabled: false };

      const savedSupa = getStoredSupabaseTokens();
      if (!state.authenticated && savedSupa && savedSupa.access_token) {
        const restoreRes = await fetch("/api/auth/token-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: savedSupa.access_token }),
        });
        const restoreData = await restoreRes.json();
        if (restoreRes.ok && restoreData.ok) {
          state.authenticated = true;
          state.user = restoreData.user;
        } else {
          setStoredSupabaseTokens(null);
        }
      }

      refreshGateVisibility();
      if (state.authenticated) {
        if (scramjetEngine && state.settings.proxyEngine === "scramjet") {
          scramjetEngine.ensureReady().catch(() => {});
        } else if (wispEngine && state.settings.proxyEngine === "wisp") {
          wispEngine.ensureConnected().catch(() => {});
        }
        if (state.user && state.user.mode === "supabase") {
          syncFromCloud();
        }
        handlePostUnlockRedirect();
      }
    } catch (e) {
      // Allow UI interaction if offline
    }

    // Gate Events
    document
      .getElementById("gateTabPasscode")
      .addEventListener("click", () => switchGateTab("passcode"));
    document
      .getElementById("gateTabAccount")
      .addEventListener("click", () => switchGateTab("account"));

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

    // Toolbar & Navigation Events
    document
      .getElementById("newTabBtn")
      .addEventListener("click", () => createTab("", true));

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
      if (state.settings.proxyEngine === "scramjet" && scramjetEngine) {
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
      } else if (
        state.settings.proxyEngine === "stream" &&
        tab.iframe &&
        tab.iframe.contentWindow
      ) {
        try {
          tab.iframe.contentWindow.history.back();
        } catch (e) {}
      }
    });

    document.getElementById("forwardBtn").addEventListener("click", () => {
      const tab = getActiveTab();
      if (!tab) return;
      if (state.settings.proxyEngine === "scramjet" && scramjetEngine) {
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
      } else if (
        state.settings.proxyEngine === "stream" &&
        tab.iframe &&
        tab.iframe.contentWindow
      ) {
        try {
          tab.iframe.contentWindow.history.forward();
        } catch (e) {}
      }
    });

    document.getElementById("reloadBtn").addEventListener("click", () => {
      const tab = getActiveTab();
      if (!tab || !tab.url) return;
      if (state.settings.proxyEngine === "scramjet" && scramjetEngine) {
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
      if (!tab) return;
      tab.navToken++;
      tab.url = "";
      tab.title = "New Tab";
      if (scramjetEngine) {
        scramjetEngine.destroyTabFrame(tab.id);
      }
      if (tab.blobUrl) {
        URL.revokeObjectURL(tab.blobUrl);
        tab.blobUrl = null;
      }
      if (tab.iframe) {
        tab.iframe.remove();
        tab.iframe = null;
      }
      setLoadingProgress(false, "");
      renderTabs();
      updateViewportForActiveTab();
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
      if (tab && tab.url) {
        const directHref =
          state.settings.proxyEngine === "scramjet" && scramjetEngine
            ? scramjetEngine.encodeUrl(tab.url)
            : buildProxiedPath(tab.url);
        window.open(directHref, "_blank");
      } else {
        showToast("Open a site first to pop it out.");
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

    document.getElementById("panicBtn").addEventListener("click", triggerPanic);

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

    // Global Keyboard Listeners (Panic Key + Shortcuts)
    window.addEventListener("keydown", (ev) => {
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
        (!isTyping || ev.key === "Escape")
      ) {
        ev.preventDefault();
        triggerPanic();
      }
    });

    // Listen to navigation & panic messages from proxied /proxy/ iframes
    window.addEventListener("message", (ev) => {
      const msg = ev.data;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "ibossbad:keydown") {
        if (state.settings.panicKey && msg.key === state.settings.panicKey) {
          triggerPanic();
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
