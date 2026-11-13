"use strict";

(function (window) {
  var DEFAULT_PUBLIC_RELAYS = [
    { url: "wss://definitelyscience.com/wisp/", label: "DefinitelyScience" },
    { url: "wss://mages.io/wisp/", label: "Mages" },
    { url: "wss://lichology.com/wisp/", label: "Lichology" },
    { url: "wss://wisp.mercurywork.shop/", label: "MercuryWorkshop" },
    { url: "wss://wisp.terbiumon.top/wisp/", label: "Terbium" },
    { url: "wss://anura.pro/", label: "Anura" },
    { url: "wss://nebulaproxy.io/wisp/", label: "Nebula" },
    { url: "wss://wisp.rhw.one/", label: "RHW" },
  ];

  var AD_BLOCK_SET = new Set([
    "doubleclick.net",
    "googlesyndication.com",
    "googleadservices.com",
    "google-analytics.com",
    "googletagmanager.com",
    "googletagservices.com",
    "adservice.google.com",
    "2mdn.net",
    "adnxs.com",
    "adsrvr.org",
    "criteo.com",
    "criteo.net",
    "taboola.com",
    "outbrain.com",
    "scorecardresearch.com",
    "rubiconproject.com",
    "pubmatic.com",
    "openx.net",
    "casalemedia.com",
    "moatads.com",
    "quantserve.com",
    "adform.net",
    "smartadserver.com",
    "popads.net",
    "popcash.net",
    "propellerads.com",
    "adsterra.com",
    "exoclick.com",
    "amazon-adsystem.com",
    "media.net",
    "yieldmo.com",
    "gumgum.com",
    "kargo.com",
    "spotx.tv",
    "adsafeprotected.com",
    "doubleverify.com",
    "demdex.net",
    "omtrdc.net",
    "krxd.net",
    "bluekai.com",
    "rlcdn.com",
    "tapad.com",
    "mathtag.com",
    "adthrive.com",
    "mediavine.com",
    "ezoic.net",
    "freestar.io",
    "playwire.com",
    "nitropay.com",
    "adinplay.com",
    "poki-analytics.com",
    "gameanalytics.com",
    "unityads.unity3d.com",
    "applovin.com",
    "vungle.com",
    "chartboost.com",
    "ironsrc.com",
    "inmobi.com",
    "adcolony.com",
    "tapjoy.com",
    "adjust.com",
    "appsflyer.com",
    "hotjar.com",
    "mouseflow.com",
    "fullstory.com",
    "clarity.ms",
    "logrocket.io",
    "mixpanel.com",
    "amplitude.com",
    "segment.io",
    "posthog.com",
    "newrelic.com",
    "nr-data.net",
    "bugsnag.com",
    "sentry-cdn.com",
    "ingest.sentry.io",
    "onesignal.com",
    "hubspot.com",
    "hs-analytics.net",
    "connect.facebook.net",
    "analytics.tiktok.com",
    "ads-twitter.com",
    "bat.bing.com",
    "mc.yandex.ru",
    "onetrust.com",
    "cookielaw.org",
    "chartbeat.com",
    "adroll.com",
    "rtbhouse.com",
    "monetag.com",
  ]);

  function getSelfWispUrl() {
    var proto = window.location.protocol === "https:" ? "wss://" : "ws://";
    return proto + window.location.host + "/wisp/";
  }

  function bytesToBase64(bytes) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var bin = "";
    var chunk = 32768;
    for (var i = 0; i < u8.length; i += chunk) {
      bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return window.btoa(bin);
  }

  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    return bytesToBase64(bytes);
  }

  function shouldBlockUrl(urlStr, adblockEnabled) {
    if (!adblockEnabled || !urlStr) return false;
    try {
      var h = new URL(urlStr).hostname.toLowerCase();
      if (!h) return false;
      if (AD_BLOCK_SET.has(h)) return true;
      var dot = h.indexOf(".");
      while (dot !== -1) {
        if (AD_BLOCK_SET.has(h.slice(dot + 1))) return true;
        dot = h.indexOf(".", dot + 1);
      }
    } catch (_e) {
      return false;
    }
    return false;
  }

  // AST-based JS location rewriter (same algorithm as lib/location-rewriter.js & GUST)
  function rewriteLocationRefs(src) {
    if (
      !src ||
      typeof src !== "string" ||
      src.indexOf("location") === -1 ||
      !window.acorn ||
      !window.acorn.walk
    ) {
      return src;
    }

    var ast;
    try {
      ast = window.acorn.parse(src, {
        ecmaVersion: "latest",
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        allowHashBang: true,
        allowImportExportEverywhere: true,
      });
    } catch (_e1) {
      try {
        ast = window.acorn.parse(src, {
          ecmaVersion: "latest",
          sourceType: "module",
          allowReturnOutsideFunction: true,
          allowAwaitOutsideFunction: true,
          allowHashBang: true,
        });
      } catch (_e2) {
        return src;
      }
    }

    var declared = false;
    function mark(id) {
      if (id && id.type === "Identifier" && id.name === "location") {
        declared = true;
      }
    }
    function checkPat(p) {
      if (!p) return;
      if (p.type === "Identifier") mark(p);
      else if (p.type === "ObjectPattern") {
        p.properties.forEach(function (pr) {
          checkPat(pr.value || pr.argument);
        });
      } else if (p.type === "ArrayPattern") p.elements.forEach(checkPat);
      else if (p.type === "AssignmentPattern") checkPat(p.left);
      else if (p.type === "RestElement") checkPat(p.argument);
    }

    window.acorn.walk.full(ast, function (n) {
      if (n.type === "VariableDeclarator") checkPat(n.id);
      else if (
        n.type === "FunctionDeclaration" ||
        n.type === "FunctionExpression" ||
        n.type === "ArrowFunctionExpression"
      ) {
        if (n.id) mark(n.id);
        n.params.forEach(checkPat);
      } else if (
        n.type === "ClassDeclaration" ||
        n.type === "ClassExpression"
      ) {
        if (n.id) mark(n.id);
      } else if (n.type === "CatchClause") checkPat(n.param);
      else if (
        n.type === "ImportDefaultSpecifier" ||
        n.type === "ImportNamespaceSpecifier" ||
        n.type === "ImportSpecifier"
      ) {
        mark(n.local);
      }
    });

    if (declared) return src;

    var edits = [];
    window.acorn.walk.ancestor(ast, {
      MemberExpression: function (n) {
        var dot =
          !n.computed &&
          n.property.type === "Identifier" &&
          n.property.name === "location";
        var br =
          n.computed &&
          n.property.type === "Literal" &&
          n.property.value === "location";
        if ((!dot && !br) || n.object.type === "Super") return;
        var seq = n.object.type === "SequenceExpression";
        edits.push({
          start: n.object.start,
          end: n.object.start,
          text: seq ? "__ibossSafe((" : "__ibossSafe(",
        });
        var optChain = false;
        for (
          var o = n.object;
          o;
          o =
            o.type === "MemberExpression"
              ? o.object
              : o.type === "CallExpression"
              ? o.callee
              : null
        ) {
          if (o.optional) {
            optChain = true;
            break;
          }
        }
        if (optChain) {
          edits.push({
            start: n.object.end,
            end: n.property.end,
            text:
              (seq ? "))" : ")") + (dot ? "?.__ibossLoc$" : '?.["__ibossLoc$"'),
          });
        } else {
          edits.push({
            start: n.object.end,
            end: n.object.end,
            text: seq ? "))" : ")",
          });
          edits.push({
            start: n.property.start,
            end: n.property.end,
            text: dot ? "__ibossLoc$" : '"__ibossLoc$"',
          });
        }
      },
      Identifier: function (n, _st, anc) {
        if (n.name !== "location") return;
        var p = anc[anc.length - 2];
        if (!p) return;
        if (p.type === "MemberExpression" && !p.computed && p.property === n) {
          return;
        }
        if (
          (p.type === "Property" ||
            p.type === "PropertyDefinition" ||
            p.type === "MethodDefinition") &&
          !p.computed &&
          p.key === n
        ) {
          return;
        }
        if (p.type === "Property" && p.shorthand) return;
        edits.push({ start: n.start, end: n.end, text: "__ibossLoc" });
      },
      VariablePattern: function (n, _st, anc) {
        if (n.name !== "location") return;
        var p = anc[anc.length - 2];
        if (p && p.type === "AssignmentExpression" && p.left === n) {
          edits.push({ start: n.start, end: n.end, text: "__ibossLoc" });
        }
      },
    });

    if (!edits.length) return src;
    edits.sort(function (a, b) {
      return b.start - a.start || b.end - b.start - (a.end - a.start);
    });
    var out = src;
    for (var i = 0; i < edits.length; i++) {
      var e = edits[i];
      out = out.slice(0, e.start) + e.text + out.slice(e.end);
    }
    return out;
  }

  // Transform ES module source: collect sub-imports, resolve relative specifiers to real URLs,
  // rewrite import.meta.url, and rewrite location references via AST.
  function transformModuleSource(src, modUrl) {
    var deps = [];
    function resolveSpec(spec) {
      if (!spec || /^(data:|blob:)/i.test(spec)) return null;
      if (!/^(\.\.?\/|\/|https?:\/\/)/i.test(spec)) return null;
      try {
        var abs = new URL(spec, modUrl).href;
        deps.push(abs);
        return abs;
      } catch (_e) {
        return null;
      }
    }

    var out = src.replace(
      /\b((?:import|export)\s+(?:[^'"]*?\s+from\s+)?)(['"])([^'"]+)\2/g,
      function (m, pre, q, spec) {
        var abs = resolveSpec(spec);
        return abs ? pre + q + abs + q : m;
      }
    );
    out = out.replace(
      /(\bimport\s*\(\s*)(['"])([^'"]+)\2(\s*\))/g,
      function (m, pre, q, spec, post) {
        var abs = resolveSpec(spec);
        return abs ? pre + q + abs + q + post : m;
      }
    );
    out = out.replace(/import\.meta\.url\b/g, JSON.stringify(modUrl));
    out = rewriteLocationRefs(out);
    return { code: out, deps: deps };
  }

  // Build the sandboxed Blob iframe runtime injected at the top of <head>
  function makeRuntimeScript(pageUrl, tabId, opts) {
    var cfgJson = JSON.stringify({
      url: pageUrl,
      tabId: tabId,
      blockWebrtc: Boolean(opts && opts.blockWebrtc !== false),
    });

    return (
      "(function(){\n" +
      "  var CFG = " +
      cfgJson +
      ";\n" +
      "  var currentHref = CFG.url;\n" +
      "  function parsedUrl() { try { return new URL(currentHref); } catch(e) { return new URL('https://example.com/'); } }\n" +
      "  var ORIGIN = parsedUrl().origin;\n" +
      "  var HOSTNAME = parsedUrl().hostname;\n" +
      "  var blobMap = new Map();\n" +
      "  var pendingRpc = new Map();\n" +
      "  var wsMap = new Map();\n" +
      "  var rpcSeq = 1;\n" +
      "\n" +
      "  function postParent(msg, transfer) {\n" +
      "    try { window.top.postMessage(Object.assign({ __ibossWisp: true, tabId: CFG.tabId }, msg), '*', transfer || []); } catch(e) {}\n" +
      "  }\n" +
      "\n" +
      "  function rpc(action, payload) {\n" +
      "    return new Promise(function(resolve, reject) {\n" +
      "      var id = rpcSeq++;\n" +
      "      pendingRpc.set(id, { resolve: resolve, reject: reject });\n" +
      "      postParent({ rpcId: id, action: action, payload: payload });\n" +
      "    });\n" +
      "  }\n" +
      "\n" +
      "  window.addEventListener('message', function(ev) {\n" +
      "    var d = ev.data;\n" +
      "    if (!d || !d.__ibossWispReply) return;\n" +
      "    if (d.rpcId && pendingRpc.has(d.rpcId)) {\n" +
      "      var entry = pendingRpc.get(d.rpcId);\n" +
      "      pendingRpc.delete(d.rpcId);\n" +
      "      if (d.error) entry.reject(new TypeError(d.error));\n" +
      "      else entry.resolve(d.result);\n" +
      "      return;\n" +
      "    }\n" +
      "    if (d.wsEvent && wsMap.has(d.wsId)) {\n" +
      "      wsMap.get(d.wsId)._handleEvent(d);\n" +
      "    }\n" +
      "  });\n" +
      "\n" +
      "  var OrigURL = window.URL;\n" +
      "  function PatchedURL(u, base) {\n" +
      "    if (base !== undefined) {\n" +
      "      var bs = String(base);\n" +
      "      if (bs.indexOf('blob:') === 0 || bs === 'null' || bs === 'about:blank') base = currentHref;\n" +
      "    } else if (typeof u === 'string' && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) {\n" +
      "      base = currentHref;\n" +
      "    }\n" +
      "    return base !== undefined ? new OrigURL(u, base) : new OrigURL(u);\n" +
      "  }\n" +
      "  PatchedURL.prototype = OrigURL.prototype;\n" +
      "  PatchedURL.createObjectURL = OrigURL.createObjectURL.bind(OrigURL);\n" +
      "  PatchedURL.revokeObjectURL = OrigURL.revokeObjectURL.bind(OrigURL);\n" +
      "  if (OrigURL.canParse) PatchedURL.canParse = function(u, b) { try { new PatchedURL(u, b); return true; } catch(e) { return false; } };\n" +
      "  window.URL = PatchedURL;\n" +
      "\n" +
      "  function resolveReal(raw) {\n" +
      "    if (raw == null) return '';\n" +
      "    var s = String(raw).trim();\n" +
      "    if (!s || /^(data:|blob:|javascript:|mailto:|tel:|about:)/i.test(s)) return s;\n" +
      "    try { return new OrigURL(s, currentHref).href; } catch(e) { return s; }\n" +
      "  }\n" +
      "\n" +
      "  function navigateTo(dest, newTab) {\n" +
      "    if (dest == null) return;\n" +
      "    var s = String(dest).trim();\n" +
      "    if (!s || /^javascript:/i.test(s)) return;\n" +
      "    if (s.charAt(0) === '#') {\n" +
      "      try { window.location.hash = s; } catch(e) {}\n" +
      "      var u = parsedUrl(); u.hash = s; currentHref = u.href;\n" +
      "      postParent({ action: 'urlchange', url: currentHref, title: document.title || '' });\n" +
      "      return;\n" +
      "    }\n" +
      "    var abs = resolveReal(s);\n" +
      "    if (/^https?:\\/\\//i.test(abs)) {\n" +
      "      postParent({ action: newTab ? 'newtab' : 'navigate', url: abs });\n" +
      "    }\n" +
      "  }\n" +
      "\n" +
      "  var ancestorOrigins = { length: 0, item: function(){ return null; }, contains: function(){ return false; } };\n" +
      "  var locTarget = {\n" +
      "    assign: function(u) { navigateTo(u, false); },\n" +
      "    replace: function(u) { navigateTo(u, false); },\n" +
      "    reload: function() { postParent({ action: 'reload' }); },\n" +
      "    toString: function() { return currentHref; },\n" +
      "    valueOf: function() { return currentHref; },\n" +
      "    ancestorOrigins: ancestorOrigins\n" +
      "  };\n" +
      "  var locProxy = new Proxy(locTarget, {\n" +
      "    get: function(t, p) {\n" +
      "      if (Object.prototype.hasOwnProperty.call(t, p)) return t[p];\n" +
      "      var u = parsedUrl();\n" +
      "      if (p in u) { var v = u[p]; return typeof v === 'function' ? v.bind(u) : v; }\n" +
      "      return undefined;\n" +
      "    },\n" +
      "    set: function(_t, p, val) {\n" +
      "      if (p === 'hash') { navigateTo('#' + String(val).replace(/^#/, ''), false); return true; }\n" +
      "      if (p === 'href') { navigateTo(val, false); return true; }\n" +
      "      var u = parsedUrl();\n" +
      "      try { if (p in u) { u[p] = val; navigateTo(u.href, false); } } catch(e) {}\n" +
      "      return true;\n" +
      "    }\n" +
      "  });\n" +
      "\n" +
      "  Object.defineProperty(window, '__ibossLoc', {\n" +
      "    configurable: true,\n" +
      "    get: function() { return locProxy; },\n" +
      "    set: function(v) { navigateTo(v, false); }\n" +
      "  });\n" +
      "  Object.defineProperty(Object.prototype, '__ibossLoc$', {\n" +
      "    configurable: true, enumerable: false,\n" +
      "    get: function() { return (this === window || this === document) ? locProxy : this.location; },\n" +
      "    set: function(v) { if (this === window || this === document) navigateTo(v, false); else this.location = v; }\n" +
      "  });\n" +
      "  window.__ibossSafe = function(o) {\n" +
      "    if (o == null) return o;\n" +
      "    if (o === window || o === document) return window;\n" +
      "    try { void o.__ibossLoc$; return o; } catch(e) { return { __ibossLoc$: locProxy }; }\n" +
      "  };\n" +
      "\n" +
      "  try { Object.defineProperty(window, 'origin', { configurable: true, get: function(){ return parsedUrl().origin; } }); } catch(e){}\n" +
      "  ['URL', 'documentURI'].forEach(function(k){\n" +
      "    try { Object.defineProperty(document, k, { configurable: true, get: function(){ return currentHref; } }); } catch(e){}\n" +
      "  });\n" +
      "  try { Object.defineProperty(document, 'domain', { configurable: true, get: function(){ return HOSTNAME; }, set: function(){} }); } catch(e){}\n" +
      "  try { Object.defineProperty(document, 'referrer', { configurable: true, get: function(){ return ORIGIN + '/'; } }); } catch(e){}\n" +
      "\n" +
      "  // History pushState / replaceState spoofing (critical for React Router, Next.js, neal.fun)\n" +
      "  function wrapHistory(fnName) {\n" +
      "    var orig = history[fnName];\n" +
      "    history[fnName] = function(state, title, urlArg) {\n" +
      "      if (urlArg !== undefined && urlArg !== null) {\n" +
      "        try {\n" +
      "          var resolved = new OrigURL(String(urlArg), currentHref);\n" +
      "          if (resolved.origin === ORIGIN) {\n" +
      "            currentHref = resolved.href;\n" +
      "            postParent({ action: 'urlchange', url: currentHref, title: document.title || '' });\n" +
      "          } else {\n" +
      "            navigateTo(resolved.href, false);\n" +
      "            return;\n" +
      "          }\n" +
      "        } catch(e) {}\n" +
      "      }\n" +
      "      try { return orig.call(this, state, title || ''); } catch(e2) {}\n" +
      "    };\n" +
      "  }\n" +
      "  wrapHistory('pushState');\n" +
      "  wrapHistory('replaceState');\n" +
      "\n" +
      "  // Per-origin storage + cookie jar (works even inside blob: origins)\n" +
      "  var memStore = Object.create(null);\n" +
      "  var sessStore = Object.create(null);\n" +
      "  var cookieJar = Object.create(null);\n" +
      "  function makeStorage(backing, prefix) {\n" +
      "    return new Proxy({}, {\n" +
      "      get: function(_t, prop) {\n" +
      "        if (prop === 'getItem') return function(k) { try { var v = window.top.localStorage.getItem(prefix + k); if (v !== null) return v; } catch(e){} return Object.prototype.hasOwnProperty.call(backing, k) ? backing[k] : null; };\n" +
      "        if (prop === 'setItem') return function(k, v) { backing[k] = String(v); try { window.top.localStorage.setItem(prefix + k, String(v)); } catch(e){} };\n" +
      "        if (prop === 'removeItem') return function(k) { delete backing[k]; try { window.top.localStorage.removeItem(prefix + k); } catch(e){} };\n" +
      "        if (prop === 'clear') return function() { Object.keys(backing).forEach(function(k){ delete backing[k]; }); };\n" +
      "        if (prop === 'key') return function(i) { return Object.keys(backing)[i] || null; };\n" +
      "        if (prop === 'length') return Object.keys(backing).length;\n" +
      "        return Object.prototype.hasOwnProperty.call(backing, prop) ? backing[prop] : undefined;\n" +
      "      },\n" +
      "      set: function(_t, prop, val) {\n" +
      "        backing[prop] = String(val);\n" +
      "        try { window.top.localStorage.setItem(prefix + String(prop), String(val)); } catch(e){}\n" +
      "        return true;\n" +
      "      }\n" +
      "    });\n" +
      "  }\n" +
      "  try { Object.defineProperty(window, 'localStorage', { configurable: true, value: makeStorage(memStore, '_iboss_ls_' + ORIGIN + '_') }); } catch(e){}\n" +
      "  try { Object.defineProperty(window, 'sessionStorage', { configurable: true, value: makeStorage(sessStore, '_iboss_ss_' + ORIGIN + '_') }); } catch(e){}\n" +
      "  try {\n" +
      "    Object.defineProperty(document, 'cookie', {\n" +
      "      configurable: true,\n" +
      "      get: function() { return Object.keys(cookieJar).map(function(k){ return k + '=' + cookieJar[k]; }).join('; '); },\n" +
      "      set: function(v) { var first = String(v).split(';')[0]; var eq = first.indexOf('='); if (eq > 0) cookieJar[first.slice(0, eq).trim()] = first.slice(eq + 1).trim(); }\n" +
      "    });\n" +
      "  } catch(e){}\n" +
      "\n" +
      "  // ServiceWorker & WebRTC guards\n" +
      "  if (navigator.serviceWorker) {\n" +
      "    try {\n" +
      "      navigator.serviceWorker.register = function() { return Promise.resolve({ scope: ORIGIN + '/', update: function(){}, unregister: function(){ return Promise.resolve(true); } }); };\n" +
      "      navigator.serviceWorker.getRegistrations = function() { return Promise.resolve([]); };\n" +
      "    } catch(e){}\n" +
      "  }\n" +
      "  if (CFG.blockWebrtc) {\n" +
      "    ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection'].forEach(function(k){\n" +
      "      try { if (k in window) window[k] = function(){ throw new DOMException('WebRTC disabled by Ibossbad privacy shield', 'NotSupportedError'); }; } catch(e){}\n" +
      "    });\n" +
      "  }\n" +
      "\n" +
      "  // Proxied fetch() over WISP bridge\n" +
      "  var nativeFetch = window.fetch.bind(window);\n" +
      "  window.fetch = async function(input, init) {\n" +
      "    var rawUrl = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));\n" +
      "    if (/^(blob:|data:)/i.test(rawUrl)) return nativeFetch(input, init);\n" +
      "    var absUrl = resolveReal(rawUrl);\n" +
      "    var opts = init || {};\n" +
      "    var method = (opts.method || (input && input.method) || 'GET').toUpperCase();\n" +
      "    var hdrs = {};\n" +
      "    var srcHdrs = opts.headers || (input && input.headers);\n" +
      "    if (srcHdrs) {\n" +
      "      if (typeof srcHdrs.forEach === 'function') srcHdrs.forEach(function(v, k){ hdrs[k] = v; });\n" +
      "      else if (Array.isArray(srcHdrs)) srcHdrs.forEach(function(p){ if (p && p.length >= 2) hdrs[p[0]] = p[1]; });\n" +
      "      else Object.keys(srcHdrs).forEach(function(k){ hdrs[k] = srcHdrs[k]; });\n" +
      "    }\n" +
      "    var bodyB64 = null;\n" +
      "    var rawBody = opts.body !== undefined ? opts.body : null;\n" +
      "    if (rawBody != null && method !== 'GET' && method !== 'HEAD') {\n" +
      "      if (typeof rawBody === 'string') {\n" +
      "        var enc = new TextEncoder().encode(rawBody);\n" +
      "        var bin = ''; for (var i = 0; i < enc.length; i += 32768) bin += String.fromCharCode.apply(null, enc.subarray(i, i + 32768));\n" +
      "        bodyB64 = btoa(bin);\n" +
      "      } else if (rawBody instanceof URLSearchParams) {\n" +
      "        bodyB64 = btoa(unescape(encodeURIComponent(rawBody.toString())));\n" +
      "        if (!hdrs['content-type'] && !hdrs['Content-Type']) hdrs['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';\n" +
      "      } else if (rawBody instanceof ArrayBuffer || ArrayBuffer.isView(rawBody)) {\n" +
      "        var u8 = rawBody instanceof ArrayBuffer ? new Uint8Array(rawBody) : new Uint8Array(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength);\n" +
      "        var bin2 = ''; for (var j = 0; j < u8.length; j += 32768) bin2 += String.fromCharCode.apply(null, u8.subarray(j, j + 32768));\n" +
      "        bodyB64 = btoa(bin2);\n" +
      "      }\n" +
      "    }\n" +
      "    var res = await rpc('fetch', { url: absUrl, method: method, headers: hdrs, bodyB64: bodyB64, referer: currentHref });\n" +
      "    var status = res.status || 200;\n" +
      "    var nullBody = status === 204 || status === 205 || status === 304 || method === 'HEAD';\n" +
      "    var responseObj = new Response(nullBody ? null : res.buf, {\n" +
      "      status: status,\n" +
      "      statusText: res.statusText || 'OK',\n" +
      "      headers: res.headers || {}\n" +
      "    });\n" +
      "    try { Object.defineProperty(responseObj, 'url', { value: res.finalUrl || absUrl }); } catch(e){}\n" +
      "    return responseObj;\n" +
      "  };\n" +
      "\n" +
      "  // Proxied XMLHttpRequest built on top of proxied fetch\n" +
      "  function ProxiedXHR() {\n" +
      "    var self = this;\n" +
      "    this.readyState = 0;\n" +
      "    this.status = 0;\n" +
      "    this.statusText = '';\n" +
      "    this.response = '';\n" +
      "    this.responseText = '';\n" +
      "    this.responseType = '';\n" +
      "    this.responseURL = '';\n" +
      "    this.timeout = 0;\n" +
      "    this.withCredentials = false;\n" +
      "    this._headers = {};\n" +
      "    this._resHeaders = {};\n" +
      "    this._listeners = {};\n" +
      "    this.upload = { addEventListener: function(){}, removeEventListener: function(){} };\n" +
      "    ['readystatechange','load','error','abort','progress','loadstart','loadend','timeout'].forEach(function(ev){\n" +
      "      self['on' + ev] = null;\n" +
      "    });\n" +
      "  }\n" +
      "  ProxiedXHR.UNSENT = 0; ProxiedXHR.OPENED = 1; ProxiedXHR.HEADERS_RECEIVED = 2; ProxiedXHR.LOADING = 3; ProxiedXHR.DONE = 4;\n" +
      "  ProxiedXHR.prototype.UNSENT = 0; ProxiedXHR.prototype.OPENED = 1; ProxiedXHR.prototype.HEADERS_RECEIVED = 2; ProxiedXHR.prototype.LOADING = 3; ProxiedXHR.prototype.DONE = 4;\n" +
      "  ProxiedXHR.prototype.addEventListener = function(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); };\n" +
      "  ProxiedXHR.prototype.removeEventListener = function(t, fn) { if (this._listeners[t]) this._listeners[t] = this._listeners[t].filter(function(f){ return f !== fn; }); };\n" +
      "  ProxiedXHR.prototype._emit = function(t) {\n" +
      "    var ev = new Event(t);\n" +
      "    if (typeof this['on' + t] === 'function') { try { this['on' + t](ev); } catch(e){} }\n" +
      "    (this._listeners[t] || []).slice().forEach(function(fn){ try { fn(ev); } catch(e){} });\n" +
      "  };\n" +
      "  ProxiedXHR.prototype.open = function(method, url) {\n" +
      "    this._method = (method || 'GET').toUpperCase();\n" +
      "    this._url = resolveReal(url);\n" +
      "    this.readyState = 1;\n" +
      "    this._emit('readystatechange');\n" +
      "  };\n" +
      "  ProxiedXHR.prototype.setRequestHeader = function(k, v) { this._headers[k] = v; };\n" +
      "  ProxiedXHR.prototype.getResponseHeader = function(k) { return this._resHeaders[String(k).toLowerCase()] || null; };\n" +
      "  ProxiedXHR.prototype.getAllResponseHeaders = function() {\n" +
      "    var h = this._resHeaders;\n" +
      "    return Object.keys(h).map(function(k){ return k + ': ' + h[k]; }).join('\\r\\n');\n" +
      "  };\n" +
      "  ProxiedXHR.prototype.overrideMimeType = function() {};\n" +
      "  ProxiedXHR.prototype.abort = function() { this.readyState = 0; this._emit('abort'); };\n" +
      "  ProxiedXHR.prototype.send = function(body) {\n" +
      "    var self = this;\n" +
      "    self._emit('loadstart');\n" +
      "    window.fetch(self._url, { method: self._method, headers: self._headers, body: body }).then(async function(res) {\n" +
      "      self.status = res.status;\n" +
      "      self.statusText = res.statusText || 'OK';\n" +
      "      self.responseURL = res.url || self._url;\n" +
      "      res.headers.forEach(function(v, k){ self._resHeaders[k.toLowerCase()] = v; });\n" +
      "      self.readyState = 2; self._emit('readystatechange');\n" +
      "      var buf = await res.arrayBuffer();\n" +
      "      self.readyState = 3; self._emit('readystatechange');\n" +
      "      if (self.responseType === 'arraybuffer') {\n" +
      "        self.response = buf;\n" +
      "      } else if (self.responseType === 'blob') {\n" +
      "        self.response = new Blob([buf], { type: self._resHeaders['content-type'] || 'application/octet-stream' });\n" +
      "      } else if (self.responseType === 'json') {\n" +
      "        var txt = new TextDecoder().decode(buf);\n" +
      "        try { self.response = JSON.parse(txt); } catch(e) { self.response = null; }\n" +
      "      } else {\n" +
      "        var text = new TextDecoder().decode(buf);\n" +
      "        self.responseText = text;\n" +
      "        self.response = text;\n" +
      "      }\n" +
      "      self.readyState = 4;\n" +
      "      self._emit('readystatechange');\n" +
      "      self._emit('load');\n" +
      "      self._emit('loadend');\n" +
      "    }).catch(function() {\n" +
      "      self.status = 0;\n" +
      "      self.readyState = 4;\n" +
      "      self._emit('readystatechange');\n" +
      "      self._emit('error');\n" +
      "      self._emit('loadend');\n" +
      "    });\n" +
      "  };\n" +
      "  window.XMLHttpRequest = ProxiedXHR;\n" +
      "\n" +
      "  // Proxied WebSocket over WISP libcurl.WebSocket\n" +
      "  function ProxiedWS(url, protocols) {\n" +
      "    var wsUrl = String(url || '');\n" +
      "    if (/^\\/(?!\\/)/.test(wsUrl)) {\n" +
      "      var pu = parsedUrl();\n" +
      "      wsUrl = (pu.protocol === 'https:' ? 'wss://' : 'ws://') + pu.host + wsUrl;\n" +
      "    }\n" +
      "    this.url = wsUrl;\n" +
      "    this.readyState = 0;\n" +
      "    this.binaryType = 'blob';\n" +
      "    this.protocol = '';\n" +
      "    this.extensions = '';\n" +
      "    this.bufferedAmount = 0;\n" +
      "    this.onopen = null; this.onmessage = null; this.onerror = null; this.onclose = null;\n" +
      "    this._listeners = {};\n" +
      "    this._id = 'ws_' + (rpcSeq++);\n" +
      "    wsMap.set(this._id, this);\n" +
      "    postParent({ action: 'ws:open', wsId: this._id, url: wsUrl, protocols: protocols ? (Array.isArray(protocols) ? protocols : [protocols]) : [] });\n" +
      "  }\n" +
      "  ProxiedWS.CONNECTING = 0; ProxiedWS.OPEN = 1; ProxiedWS.CLOSING = 2; ProxiedWS.CLOSED = 3;\n" +
      "  ProxiedWS.prototype.CONNECTING = 0; ProxiedWS.prototype.OPEN = 1; ProxiedWS.prototype.CLOSING = 2; ProxiedWS.prototype.CLOSED = 3;\n" +
      "  ProxiedWS.prototype.addEventListener = function(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); };\n" +
      "  ProxiedWS.prototype.removeEventListener = function(t, fn) { if (this._listeners[t]) this._listeners[t] = this._listeners[t].filter(function(f){ return f !== fn; }); };\n" +
      "  ProxiedWS.prototype._emit = function(t, ev) {\n" +
      "    if (typeof this['on' + t] === 'function') { try { this['on' + t](ev); } catch(e){} }\n" +
      "    (this._listeners[t] || []).slice().forEach(function(fn){ try { fn(ev); } catch(e){} });\n" +
      "  };\n" +
      "  ProxiedWS.prototype._handleEvent = function(d) {\n" +
      "    if (d.wsEvent === 'open') { this.readyState = 1; this._emit('open', new Event('open')); }\n" +
      "    else if (d.wsEvent === 'message') {\n" +
      "      var payload = d.data;\n" +
      "      if (d.isBinary && payload instanceof ArrayBuffer && this.binaryType === 'blob') payload = new Blob([payload]);\n" +
      "      this._emit('message', new MessageEvent('message', { data: payload }));\n" +
      "    } else if (d.wsEvent === 'error') { this._emit('error', new Event('error')); }\n" +
      "    else if (d.wsEvent === 'close') { this.readyState = 3; wsMap.delete(this._id); this._emit('close', new CloseEvent('close', { code: d.code || 1000, reason: d.reason || '' })); }\n" +
      "  };\n" +
      "  ProxiedWS.prototype.send = function(data) {\n" +
      "    if (typeof data === 'string') postParent({ action: 'ws:send', wsId: this._id, data: data, isBinary: false });\n" +
      "    else if (data instanceof ArrayBuffer) postParent({ action: 'ws:send', wsId: this._id, data: data, isBinary: true });\n" +
      "    else if (ArrayBuffer.isView(data)) postParent({ action: 'ws:send', wsId: this._id, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), isBinary: true });\n" +
      "  };\n" +
      "  ProxiedWS.prototype.close = function(code, reason) { this.readyState = 2; postParent({ action: 'ws:close', wsId: this._id, code: code || 1000, reason: reason || '' }); };\n" +
      "  window.WebSocket = ProxiedWS;\n" +
      "\n" +
      "  if (navigator.sendBeacon) {\n" +
      "    navigator.sendBeacon = function(u, data) { try { window.fetch(u, { method: 'POST', body: data }); } catch(e){} return true; };\n" +
      "  }\n" +
      "  window.open = function(u) { if (u) navigateTo(u, true); return null; };\n" +
      "\n" +
      "  // Asset & dynamic script/stylesheet hydration via WISP\n" +
      "  async function fetchAssetBlobUrl(absUrl, fallbackMime) {\n" +
      "    if (blobMap.has(absUrl)) return blobMap.get(absUrl);\n" +
      "    var res = await rpc('fetch', { url: absUrl, method: 'GET', headers: {}, referer: currentHref });\n" +
      "    if (!res || !res.buf || !res.buf.byteLength) throw new Error('empty asset');\n" +
      "    var mime = (res.headers && res.headers['content-type']) || fallbackMime || 'application/octet-stream';\n" +
      "    var bUrl = OrigURL.createObjectURL(new Blob([res.buf], { type: mime.split(';')[0] }));\n" +
      "    blobMap.set(absUrl, bUrl);\n" +
      "    return bUrl;\n" +
      "  }\n" +
      "\n" +
      "  function hydrateElement(el) {\n" +
      "    if (!el || el.nodeType !== 1) return;\n" +
      "    var tag = el.tagName;\n" +
      "    if (el.hasAttribute('data-iboss-src')) {\n" +
      "      var raw = el.getAttribute('data-iboss-src');\n" +
      "      el.removeAttribute('data-iboss-src');\n" +
      "      var abs = resolveReal(raw);\n" +
      "      if (/^https?:\\/\\//i.test(abs)) {\n" +
      "        fetchAssetBlobUrl(abs).then(function(b){ el.setAttribute('src', b); }).catch(function(){});\n" +
      "      }\n" +
      "    }\n" +
      "    if (el.hasAttribute('data-iboss-poster')) {\n" +
      "      var rp = el.getAttribute('data-iboss-poster');\n" +
      "      el.removeAttribute('data-iboss-poster');\n" +
      "      var ap = resolveReal(rp);\n" +
      "      if (/^https?:\\/\\//i.test(ap)) {\n" +
      "        fetchAssetBlobUrl(ap, 'image/png').then(function(b){ el.setAttribute('poster', b); }).catch(function(){});\n" +
      "      }\n" +
      "    }\n" +
      "    if (tag === 'IMG' || tag === 'SOURCE' || tag === 'VIDEO' || tag === 'AUDIO') {\n" +
      "      var s = el.getAttribute('src');\n" +
      "      if (s && !/^(blob:|data:)/i.test(s) && !el.__ibossLoading) {\n" +
      "        var absMedia = resolveReal(s);\n" +
      "        if (/^https?:\\/\\//i.test(absMedia)) {\n" +
      "          el.__ibossLoading = true;\n" +
      "          el.removeAttribute('src');\n" +
      "          fetchAssetBlobUrl(absMedia).then(function(b){ el.setAttribute('src', b); }).catch(function(){});\n" +
      "        }\n" +
      "      }\n" +
      "    }\n" +
      "    if (tag === 'SCRIPT' && el.src && !/^(blob:|data:)/i.test(el.src) && !el.__ibossScriptProxied) {\n" +
      "      el.__ibossScriptProxied = true;\n" +
      "      var scriptUrl = resolveReal(el.getAttribute('src') || el.src);\n" +
      "      var isMod = el.type === 'module';\n" +
      "      el.removeAttribute('src');\n" +
      "      el.removeAttribute('integrity');\n" +
      "      rpc('script', { url: scriptUrl, isModule: isMod, referer: currentHref }).then(function(r) {\n" +
      "        if (!r || !r.dataUrl) { el.dispatchEvent(new Event('error')); return; }\n" +
      "        var rep = document.createElement('script');\n" +
      "        rep.__ibossScriptProxied = true;\n" +
      "        if (isMod) rep.type = 'module';\n" +
      "        rep.src = r.dataUrl;\n" +
      "        rep.onload = function(){ el.dispatchEvent(new Event('load')); };\n" +
      "        rep.onerror = function(){ el.dispatchEvent(new Event('error')); };\n" +
      "        if (el.parentNode) el.parentNode.replaceChild(rep, el);\n" +
      "        else (document.head || document.documentElement).appendChild(rep);\n" +
      "      }).catch(function(){ el.dispatchEvent(new Event('error')); });\n" +
      "    }\n" +
      "    if (tag === 'LINK' && (el.rel || '').toLowerCase() === 'stylesheet' && el.getAttribute('href') && !/^(blob:|data:)/i.test(el.getAttribute('href')) && !el.__ibossCssProxied) {\n" +
      "      el.__ibossCssProxied = true;\n" +
      "      var cssHref = resolveReal(el.getAttribute('href'));\n" +
      "      el.removeAttribute('href');\n" +
      "      rpc('css', { url: cssHref, referer: currentHref }).then(function(r) {\n" +
      "        var st = document.createElement('style');\n" +
      "        st.textContent = (r && r.css) || '';\n" +
      "        if (el.parentNode) el.parentNode.replaceChild(st, el);\n" +
      "        el.dispatchEvent(new Event('load'));\n" +
      "      }).catch(function(){ el.dispatchEvent(new Event('error')); });\n" +
      "    }\n" +
      "  }\n" +
      "\n" +
      "  function scanTree(root) {\n" +
      "    if (!root || root.nodeType !== 1) return;\n" +
      "    hydrateElement(root);\n" +
      "    if (root.querySelectorAll) {\n" +
      "      root.querySelectorAll('[data-iboss-src],[data-iboss-poster],img[src],source[src],video[src],audio[src],script[src],link[rel=\"stylesheet\"][href]').forEach(hydrateElement);\n" +
      "    }\n" +
      "  }\n" +
      "\n" +
      "  var mo = new MutationObserver(function(muts) {\n" +
      "    for (var i = 0; i < muts.length; i++) {\n" +
      "      var m = muts[i];\n" +
      "      if (m.type === 'childList') {\n" +
      "        for (var j = 0; j < m.addedNodes.length; j++) scanTree(m.addedNodes[j]);\n" +
      "      } else if (m.type === 'attributes') {\n" +
      "        hydrateElement(m.target);\n" +
      "      }\n" +
      "    }\n" +
      "  });\n" +
      "  mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href', 'data-iboss-src'] });\n" +
      "\n" +
      "  document.addEventListener('DOMContentLoaded', function() {\n" +
      "    scanTree(document.documentElement);\n" +
      "    postParent({ action: 'pageready', url: currentHref, title: document.title || '' });\n" +
      "  });\n" +
      "  window.addEventListener('load', function() {\n" +
      "    postParent({ action: 'pageready', url: currentHref, title: document.title || '' });\n" +
      "  });\n" +
      "\n" +
      "  // Intercept anchor clicks & form submissions so navigation stays inside WISP\n" +
      "  document.addEventListener('click', function(ev) {\n" +
      "    var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;\n" +
      "    if (!a) return;\n" +
      "    var rawHref = a.getAttribute('data-iboss-href') || a.getAttribute('href');\n" +
      "    if (!rawHref || /^javascript:/i.test(rawHref)) return;\n" +
      "    ev.preventDefault();\n" +
      "    var openNew = ev.ctrlKey || ev.metaKey || ev.button === 1 || a.getAttribute('target') === '_blank';\n" +
      "    navigateTo(rawHref, openNew);\n" +
      "  }, true);\n" +
      "\n" +
      "  document.addEventListener('submit', function(ev) {\n" +
      "    var form = ev.target;\n" +
      "    if (!form || form.tagName !== 'FORM') return;\n" +
      "    var method = (form.getAttribute('method') || 'GET').toUpperCase();\n" +
      "    var actionAttr = form.getAttribute('data-iboss-action') || form.getAttribute('action') || currentHref;\n" +
      "    if (method === 'GET') {\n" +
      "      ev.preventDefault();\n" +
      "      var dest = new OrigURL(resolveReal(actionAttr));\n" +
      "      var fd = new FormData(form);\n" +
      "      fd.forEach(function(v, k){ if (typeof v === 'string') dest.searchParams.set(k, v); });\n" +
      "      navigateTo(dest.href, form.getAttribute('target') === '_blank');\n" +
      "    }\n" +
      "  }, true);\n" +
      "\n" +
      "  // Forward Boss/Panic key to parent shell\n" +
      "  window.addEventListener('keydown', function(ev) {\n" +
      "    var tag = ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : '';\n" +
      "    var editable = tag === 'input' || tag === 'textarea' || (ev.target && ev.target.isContentEditable);\n" +
      "    if (editable && ev.key !== 'Escape') return;\n" +
      "    try { window.top.postMessage({ type: 'ibossbad:keydown', key: ev.key, code: ev.code }, '*'); } catch(e){}\n" +
      "  });\n" +
      "})();\n"
    );
  }

  function createWispEngine(callbacks) {
    var cb = callbacks || {};
    var wasmReadyPromise = null;
    var session = null;
    var activeWispUrl = null;
    var activeWispLabel = "Initializing";
    var activeWispLatency = null;
    var customWispUrl = "";
    var allowPoolFailover = true;
    var adblockEnabled = true;
    var blockWebrtc = true;
    var blockedCount = 0;
    var assetCache = new Map();
    var MAX_CACHE_ITEMS = 180;
    var openWebSockets = new Map();
    var selfRelayFailed = false;

    function emitStatus() {
      if (typeof cb.onStatus === "function") {
        cb.onStatus({
          wispUrl: activeWispUrl,
          label: activeWispLabel,
          latency: activeWispLatency,
          blockedCount: blockedCount,
        });
      }
    }

    function emitLog(entry) {
      if (typeof cb.onRequestLog === "function") {
        cb.onRequestLog(entry);
      }
    }

    function cachePut(key, val) {
      if (assetCache.size >= MAX_CACHE_ITEMS) {
        var oldest = assetCache.keys().next().value;
        assetCache.delete(oldest);
      }
      assetCache.set(key, val);
    }

    function probeWsLatency(wsUrl, timeoutMs) {
      return new Promise(function (resolve) {
        var t0 = performance.now();
        var done = false;
        var ws;
        var timer = setTimeout(function () {
          if (done) return;
          done = true;
          try {
            if (ws) ws.close();
          } catch (_e) {}
          resolve(null);
        }, timeoutMs || 3200);

        try {
          ws = new window.WebSocket(wsUrl);
          ws.binaryType = "arraybuffer";
          ws.onopen = function () {
            if (done) return;
            done = true;
            clearTimeout(timer);
            var ms = Math.max(1, Math.round(performance.now() - t0));
            try {
              ws.close();
            } catch (_e) {}
            resolve(ms);
          };
          ws.onerror = function () {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(null);
          };
        } catch (_e2) {
          clearTimeout(timer);
          resolve(null);
        }
      });
    }

    function getLibcurl() {
      /* global libcurl */
      if (typeof libcurl !== "undefined" && libcurl) return libcurl;
      if (window.libcurl) return window.libcurl;
      return null;
    }

    function ensureWasmLoaded() {
      if (wasmReadyPromise) return wasmReadyPromise;
      wasmReadyPromise = new Promise(function (resolve, reject) {
        var attempts = 0;
        function waitForGlobal() {
          var lc = getLibcurl();
          if (lc && typeof lc.load_wasm === "function") {
            lc.load_wasm("/vendor/libcurl/libcurl.wasm")
              .then(function () {
                resolve(lc);
              })
              .catch(reject);
            return;
          }
          attempts++;
          if (attempts > 100) {
            reject(
              new Error("libcurl.js failed to load from /vendor/libcurl/")
            );
            return;
          }
          setTimeout(waitForGlobal, 60);
        }
        waitForGlobal();
      });
      return wasmReadyPromise;
    }

    function applyWispEndpoint(url, label, latency) {
      var lc = getLibcurl();
      activeWispUrl = url;
      activeWispLabel = label || url;
      activeWispLatency = latency || null;
      lc.set_websocket(url);
      if (session) {
        try {
          session.close();
        } catch (_e) {}
      }
      session = new lc.HTTPSession({ enable_cookies: true });
      if (session.set_connections) {
        session.set_connections(60, 50, 12);
      }
      emitStatus();
    }

    async function selectBestPoolRelay(excludeUrl) {
      var candidates = DEFAULT_PUBLIC_RELAYS.filter(function (r) {
        return r.url !== excludeUrl;
      });
      return new Promise(function (resolve) {
        var settled = false;
        var remaining = candidates.length;
        if (!remaining) {
          resolve(null);
          return;
        }
        candidates.forEach(function (cand) {
          probeWsLatency(cand.url, 3500).then(function (ms) {
            remaining--;
            if (!settled && ms !== null) {
              settled = true;
              resolve({ url: cand.url, label: cand.label, latency: ms });
            } else if (!settled && remaining === 0) {
              resolve(null);
            }
          });
        });
      });
    }

    async function ensureConnected() {
      await ensureWasmLoaded();
      if (activeWispUrl && session) return;

      if (customWispUrl) {
        var customMs = await probeWsLatency(customWispUrl, 3500);
        applyWispEndpoint(customWispUrl, "Custom WISP", customMs);
        return;
      }

      if (!selfRelayFailed) {
        var selfUrl = getSelfWispUrl();
        var selfMs = await probeWsLatency(selfUrl, 2000);
        if (selfMs !== null) {
          applyWispEndpoint(selfUrl, "Self-Hosted (/wisp/)", selfMs);
          return;
        }
        selfRelayFailed = true;
      }

      if (allowPoolFailover) {
        var best = await selectBestPoolRelay(null);
        if (best) {
          applyWispEndpoint(best.url, "Pool · " + best.label, best.latency);
          return;
        }
      }

      // Fallback even if probe timed out
      applyWispEndpoint(getSelfWispUrl(), "Self-Hosted (/wisp/)", null);
    }

    async function rawFetchViaWisp(url, opts) {
      if (shouldBlockUrl(url, adblockEnabled)) {
        blockedCount++;
        emitStatus();
        return {
          status: 204,
          statusText: "Blocked",
          headers: {},
          mime: "text/plain",
          buf: new ArrayBuffer(0),
          finalUrl: url,
        };
      }

      var method = ((opts && opts.method) || "GET").toUpperCase();
      var useCache = method === "GET" && opts && opts.cacheable;
      if (useCache && assetCache.has(url)) {
        return assetCache.get(url);
      }

      await ensureConnected();

      var reqHeaders = Object.assign(
        {
          "User-Agent": navigator.userAgent,
          Accept:
            (opts && opts.accept) ||
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": navigator.language || "en-US,en;q=0.9",
        },
        (opts && opts.headers) || {}
      );
      if (opts && opts.referer && !reqHeaders.Referer && !reqHeaders.referer) {
        reqHeaders.Referer = opts.referer;
      }

      var fetchInit = {
        method: method,
        headers: reqHeaders,
        redirect: "follow",
      };
      if (
        opts &&
        opts.body !== undefined &&
        opts.body !== null &&
        method !== "GET" &&
        method !== "HEAD"
      ) {
        fetchInit.body = opts.body;
      }

      var t0 = performance.now();
      var resp;
      try {
        resp = await session.fetch(url, fetchInit);
      } catch (err) {
        // Automatic failover if current WISP relay cannot reach target (e.g. sandboxed server or dead relay)
        if (!customWispUrl && allowPoolFailover) {
          if (activeWispUrl === getSelfWispUrl()) {
            selfRelayFailed = true;
          }
          var nextRelay = await selectBestPoolRelay(activeWispUrl);
          if (nextRelay) {
            applyWispEndpoint(
              nextRelay.url,
              "Pool · " + nextRelay.label,
              nextRelay.latency
            );
            t0 = performance.now();
            resp = await session.fetch(url, fetchInit);
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      var buf = await resp.arrayBuffer();
      var elapsed = Math.round(performance.now() - t0);
      var headersObj = {};
      if (resp.headers && typeof resp.headers.forEach === "function") {
        resp.headers.forEach(function (v, k) {
          headersObj[k.toLowerCase()] = v;
        });
      }
      var mime = (headersObj["content-type"] || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      var finalUrl = resp.url || url;

      emitLog({
        method: method,
        url: finalUrl,
        status: resp.status || 200,
        mime: mime || "unknown",
        bytes: buf.byteLength,
        ms: elapsed,
        relay: activeWispLabel,
      });

      var out = {
        status: resp.status || 200,
        statusText: resp.statusText || "OK",
        headers: headersObj,
        mime: mime,
        buf: buf,
        finalUrl: finalUrl,
      };

      if (
        useCache &&
        out.status >= 200 &&
        out.status < 300 &&
        buf.byteLength < 3 * 1024 * 1024
      ) {
        cachePut(url, out);
      }
      return out;
    }

    async function rewriteCssText(cssText, cssBaseUrl, depth) {
      if (!cssText) return "";
      var curDepth = depth || 0;
      var out = cssText;

      if (curDepth < 2 && out.indexOf("@import") !== -1) {
        var importRe = /@import\s+(?:url\(\s*(['"]?)([^'")\s]+)\1\s*\)|(['"])([^'"]+)\3)[^;]*;/gi;
        var imports = [];
        var im;
        while ((im = importRe.exec(out)) !== null) {
          imports.push({ full: im[0], spec: im[2] || im[4] });
        }
        await Promise.all(
          imports.map(async function (item) {
            try {
              var impUrl = new URL(item.spec, cssBaseUrl).href;
              var r = await rawFetchViaWisp(impUrl, {
                accept: "text/css,*/*;q=0.1",
                referer: cssBaseUrl,
                cacheable: true,
              });
              if (r.buf && r.buf.byteLength) {
                var subCss = new TextDecoder().decode(r.buf);
                subCss = await rewriteCssText(
                  subCss,
                  r.finalUrl || impUrl,
                  curDepth + 1
                );
                out = out.split(item.full).join(subCss);
              }
            } catch (_e) {}
          })
        );
      }

      if (out.indexOf("url(") === -1) return out;
      var urlRe = /url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi;
      var matches = [];
      var seen = new Set();
      var m;
      while ((m = urlRe.exec(out)) !== null) {
        var raw = m[2];
        if (/^(data:|blob:|#)/i.test(raw) || seen.has(m[0])) continue;
        seen.add(m[0]);
        matches.push({ full: m[0], raw: raw });
      }

      await Promise.all(
        matches.slice(0, 60).map(async function (entry) {
          try {
            var abs = new URL(entry.raw, cssBaseUrl).href;
            var r = await rawFetchViaWisp(abs, {
              referer: cssBaseUrl,
              cacheable: true,
            });
            if (r.buf && r.buf.byteLength && r.buf.byteLength < 1500000) {
              var ext = abs.split("?")[0].split(".").pop().toLowerCase();
              var fallbackMime =
                ext === "woff2"
                  ? "font/woff2"
                  : ext === "woff"
                  ? "font/woff"
                  : ext === "ttf"
                  ? "font/ttf"
                  : ext === "svg"
                  ? "image/svg+xml"
                  : r.mime || "application/octet-stream";
              var dUri =
                "data:" +
                (r.mime || fallbackMime) +
                ";base64," +
                bytesToBase64(r.buf);
              out = out.split(entry.full).join('url("' + dUri + '")');
            }
          } catch (_e) {}
        })
      );

      return out;
    }

    async function proxyEsmModule(modUrl, esmMap, inflight, referer) {
      if (esmMap.has(modUrl)) return esmMap.get(modUrl);
      if (inflight.has(modUrl)) return inflight.get(modUrl);
      if (esmMap.size > 350) return modUrl;

      var job = (async function () {
        esmMap.set(modUrl, null); // break circular import cycles cleanly
        try {
          var r = await rawFetchViaWisp(modUrl, {
            accept: "*/*",
            referer: referer,
            cacheable: true,
          });
          if (!r.buf || !r.buf.byteLength) return modUrl;
          var code = new TextDecoder("utf-8").decode(r.buf);
          var transformed = transformModuleSource(code, r.finalUrl || modUrl);
          await Promise.all(
            transformed.deps.map(function (dep) {
              return proxyEsmModule(
                dep,
                esmMap,
                inflight,
                r.finalUrl || modUrl
              );
            })
          );
          var dataUrl =
            "data:text/javascript;charset=utf-8;base64," +
            utf8ToBase64(transformed.code);
          esmMap.set(modUrl, dataUrl);
          return dataUrl;
        } catch (_e) {
          esmMap.delete(modUrl);
          return modUrl;
        } finally {
          inflight.delete(modUrl);
        }
      })();

      inflight.set(modUrl, job);
      return job;
    }

    async function buildProxiedDocumentBlob(targetUrl, tabId, onStage) {
      if (onStage) onStage("Connecting via WISP...");
      var mainRes = await rawFetchViaWisp(targetUrl, {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      });

      var finalUrl = mainRes.finalUrl || targetUrl;
      var mime = mainRes.mime || "text/html";

      // Direct image / media / JSON / plain-text viewer
      if (/^image\//.test(mime)) {
        var imgBlob = URL.createObjectURL(
          new Blob([mainRes.buf], { type: mime })
        );
        var imgHtml =
          '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
          finalUrl +
          '</title><style>body{margin:0;background:#0d0f12;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:95vw;max-height:95vh;object-fit:contain;border-radius:8px}</style></head><body><img src="' +
          imgBlob +
          '"></body></html>';
        return {
          blobUrl: URL.createObjectURL(
            new Blob([imgHtml], { type: "text/html" })
          ),
          finalUrl: finalUrl,
          title: finalUrl.split("/").pop() || finalUrl,
        };
      }

      if (/^(video|audio)\//.test(mime) || mime === "application/pdf") {
        return {
          blobUrl: URL.createObjectURL(new Blob([mainRes.buf], { type: mime })),
          finalUrl: finalUrl,
          title: finalUrl.split("/").pop() || finalUrl,
        };
      }

      var rawHtml = new TextDecoder("utf-8").decode(mainRes.buf);
      if (mime === "application/json" || mime === "text/plain") {
        var escaped = rawHtml
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        var preHtml =
          '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
          finalUrl +
          "</title><style>body{margin:0;padding:20px;background:#0d0f12;color:#e4e8ef;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}pre{white-space:pre-wrap;word-break:break-word}</style></head><body><pre>" +
          escaped +
          "</pre></body></html>";
        return {
          blobUrl: URL.createObjectURL(
            new Blob([preHtml], { type: "text/html" })
          ),
          finalUrl: finalUrl,
          title: finalUrl,
        };
      }

      if (onStage) onStage("Rewriting stylesheets & scripts...");
      var doc = new DOMParser().parseFromString(rawHtml, "text/html");
      if (!doc.head) {
        doc.documentElement.insertBefore(
          doc.createElement("head"),
          doc.documentElement.firstChild
        );
      }

      var pageTitle = (doc.title && doc.title.trim()) || "";

      // Strip CSP, XFO, resource hints, and base tags that could break blob execution
      doc
        .querySelectorAll(
          'meta[http-equiv="Content-Security-Policy"], meta[http-equiv="X-Frame-Options"], meta[name="referrer"], base, link[rel="preload"], link[rel="prefetch"], link[rel="modulepreload"], link[rel="dns-prefetch"], link[rel="preconnect"]'
        )
        .forEach(function (el) {
          el.remove();
        });

      // Defuse anchors & forms so browser status bar / default clicks never leak outside WISP
      doc.querySelectorAll("a[href]").forEach(function (a) {
        var h = a.getAttribute("href");
        if (h && !/^(#|javascript:)/i.test(h)) {
          a.setAttribute("data-iboss-href", h);
          a.setAttribute("href", "javascript:void(0)");
        }
      });
      doc.querySelectorAll("form[action]").forEach(function (f) {
        f.setAttribute("data-iboss-action", f.getAttribute("action"));
        f.removeAttribute("action");
      });

      // Defuse native media src attributes so the browser doesn't fetch them directly before runtime boots
      doc
        .querySelectorAll("img[src], source[src], video[src], audio[src]")
        .forEach(function (el) {
          var s = el.getAttribute("src");
          if (s && !/^(data:|blob:)/i.test(s)) {
            el.setAttribute("data-iboss-src", s);
            el.removeAttribute("src");
          }
          el.removeAttribute("srcset");
        });
      doc.querySelectorAll("[srcset]").forEach(function (el) {
        var ss = el.getAttribute("srcset");
        if (ss && !el.getAttribute("data-iboss-src")) {
          var firstUrl = ss.trim().split(",")[0].trim().split(/\s+/)[0];
          if (firstUrl && !/^(data:|blob:)/i.test(firstUrl)) {
            el.setAttribute("data-iboss-src", firstUrl);
          }
        }
        el.removeAttribute("srcset");
      });
      doc.querySelectorAll("video[poster]").forEach(function (v) {
        var p = v.getAttribute("poster");
        if (p && !/^(data:|blob:)/i.test(p)) {
          v.setAttribute("data-iboss-poster", p);
          v.removeAttribute("poster");
        }
      });

      // Rewrite external <link rel="stylesheet"> in parallel
      var cssLinks = Array.from(
        doc.querySelectorAll('link[rel~="stylesheet"][href]')
      );
      await Promise.all(
        cssLinks.map(async function (link) {
          var href = link.getAttribute("href");
          if (!href || /^(data:|blob:)/i.test(href)) return;
          try {
            var cssUrl = new URL(href, finalUrl).href;
            var cssRes = await rawFetchViaWisp(cssUrl, {
              accept: "text/css,*/*;q=0.1",
              referer: finalUrl,
              cacheable: true,
            });
            var cssStr = new TextDecoder("utf-8").decode(cssRes.buf);
            cssStr = await rewriteCssText(cssStr, cssRes.finalUrl || cssUrl, 0);
            var styleEl = doc.createElement("style");
            if (link.media) styleEl.media = link.media;
            styleEl.textContent = cssStr;
            link.replaceWith(styleEl);
          } catch (_e) {
            link.remove();
          }
        })
      );

      // Rewrite inline <style> blocks
      var inlineStyles = Array.from(doc.querySelectorAll("style"));
      await Promise.all(
        inlineStyles.map(async function (st) {
          if (st.textContent && st.textContent.indexOf("url(") !== -1) {
            st.textContent = await rewriteCssText(st.textContent, finalUrl, 0);
          }
        })
      );

      // Rewrite scripts (inline AST location rewrite + ES module graph + classic script data: URLs)
      var esmMap = new Map();
      var esmInflight = new Map();
      var classicScripts = [];
      var moduleExternalScripts = [];

      Array.from(doc.querySelectorAll("script")).forEach(function (scr) {
        var typeAttr = (scr.getAttribute("type") || "").trim().toLowerCase();
        var isJsonOrTemplate =
          typeAttr === "application/json" ||
          typeAttr === "application/ld+json" ||
          typeAttr === "importmap" ||
          typeAttr === "speculationrules" ||
          (typeAttr &&
            typeAttr !== "module" &&
            typeAttr.indexOf("javascript") === -1 &&
            typeAttr.indexOf("ecmascript") === -1);

        if (typeAttr === "speculationrules") {
          scr.remove();
          return;
        }
        if (isJsonOrTemplate) return;

        var srcAttr = scr.getAttribute("src");
        if (srcAttr) {
          if (/^(data:|blob:)/i.test(srcAttr)) return;
          try {
            var absJs = new URL(srcAttr, finalUrl).href;
            if (shouldBlockUrl(absJs, adblockEnabled)) {
              blockedCount++;
              scr.remove();
              return;
            }
            if (typeAttr === "module") {
              moduleExternalScripts.push({ scr: scr, url: absJs });
            } else {
              classicScripts.push({ scr: scr, url: absJs });
            }
          } catch (_e) {
            scr.remove();
          }
        } else if (scr.textContent) {
          if (typeAttr === "module") {
            var inlineMod = transformModuleSource(scr.textContent, finalUrl);
            scr.textContent = inlineMod.code;
            moduleExternalScripts.push({
              scr: null,
              deps: inlineMod.deps,
            });
          } else {
            scr.textContent = rewriteLocationRefs(scr.textContent);
          }
        }
      });

      // Crawl ES module graph & inject importmap
      await Promise.all(
        moduleExternalScripts.map(async function (entry) {
          if (entry.url) {
            var modDataUrl = await proxyEsmModule(
              entry.url,
              esmMap,
              esmInflight,
              finalUrl
            );
            entry.scr.removeAttribute("integrity");
            entry.scr.setAttribute("src", modDataUrl);
          } else if (entry.deps && entry.deps.length) {
            await Promise.all(
              entry.deps.map(function (d) {
                return proxyEsmModule(d, esmMap, esmInflight, finalUrl);
              })
            );
          }
        })
      );

      if (esmMap.size > 0) {
        var importsObj = {};
        esmMap.forEach(function (dataVal, realKey) {
          if (dataVal && dataVal.indexOf("data:") === 0) {
            importsObj[realKey] = dataVal;
          }
        });
        if (Object.keys(importsObj).length > 0) {
          var existingMap = doc.querySelector('script[type="importmap"]');
          if (existingMap) {
            var parsedMap = { imports: {} };
            try {
              parsedMap = JSON.parse(existingMap.textContent || "{}");
            } catch (_e) {}
            parsedMap.imports = Object.assign(
              {},
              importsObj,
              parsedMap.imports || {}
            );
            existingMap.textContent = JSON.stringify(parsedMap);
          } else {
            var imEl = doc.createElement("script");
            imEl.type = "importmap";
            imEl.textContent = JSON.stringify({ imports: importsObj });
            doc.head.insertBefore(imEl, doc.head.firstChild);
          }
        }
      }

      // Fetch classic <script src> in parallel & AST-rewrite location refs
      await Promise.all(
        classicScripts.map(async function (item) {
          try {
            var jsRes = await rawFetchViaWisp(item.url, {
              accept: "*/*",
              referer: finalUrl,
              cacheable: true,
            });
            if (jsRes.buf && jsRes.buf.byteLength) {
              var jsText = rewriteLocationRefs(
                new TextDecoder("utf-8").decode(jsRes.buf)
              );
              item.scr.removeAttribute("integrity");
              item.scr.setAttribute(
                "src",
                "data:text/javascript;charset=utf-8;base64," +
                  utf8ToBase64(jsText)
              );
            } else {
              item.scr.remove();
            }
          } catch (_e) {
            item.scr.remove();
          }
        })
      );

      // Defuse nested external iframes so they don't bypass WISP
      doc.querySelectorAll("iframe[src]").forEach(function (ifr) {
        var s = ifr.getAttribute("src");
        if (s && !/^(about:|blob:|data:)/i.test(s)) {
          ifr.removeAttribute("src");
        }
      });

      // Inject our runtime script at the very top of <head>
      var runtimeScr = doc.createElement("script");
      runtimeScr.textContent = makeRuntimeScript(finalUrl, tabId, {
        blockWebrtc: blockWebrtc,
      });
      doc.head.insertBefore(runtimeScr, doc.head.firstChild);

      var serialized = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
      var blobUrl = URL.createObjectURL(
        new Blob([serialized], { type: "text/html;charset=utf-8" })
      );

      emitStatus();
      return {
        blobUrl: blobUrl,
        finalUrl: finalUrl,
        title: pageTitle,
      };
    }

    // Handle postMessage RPC requests from inside Blob iframes
    window.addEventListener("message", function (ev) {
      var d = ev.data;
      if (!d || !d.__ibossWisp) return;
      var srcWin = ev.source;

      if (d.action === "navigate" && typeof cb.onNavigate === "function") {
        cb.onNavigate(d.tabId, d.url, false);
        return;
      }
      if (d.action === "newtab" && typeof cb.onNavigate === "function") {
        cb.onNavigate(d.tabId, d.url, true);
        return;
      }
      if (d.action === "reload" && typeof cb.onReload === "function") {
        cb.onReload(d.tabId);
        return;
      }
      if (
        (d.action === "urlchange" || d.action === "pageready") &&
        typeof cb.onPageUpdate === "function"
      ) {
        cb.onPageUpdate(d.tabId, d.url, d.title);
        return;
      }

      // Proxied WebSocket bridge
      if (d.action === "ws:open") {
        ensureConnected()
          .then(function () {
            var lc = getLibcurl();
            var rws = new lc.WebSocket(d.url, d.protocols || []);
            rws.binaryType = "arraybuffer";
            openWebSockets.set(d.wsId, rws);
            rws.addEventListener("open", function () {
              if (srcWin) {
                srcWin.postMessage(
                  { __ibossWispReply: true, wsId: d.wsId, wsEvent: "open" },
                  "*"
                );
              }
            });
            rws.addEventListener("message", function (mev) {
              if (!srcWin) return;
              var isBin =
                mev.data instanceof ArrayBuffer || ArrayBuffer.isView(mev.data);
              var payload = mev.data;
              var transfer = [];
              if (ArrayBuffer.isView(payload)) {
                payload = payload.buffer.slice(
                  payload.byteOffset,
                  payload.byteOffset + payload.byteLength
                );
              }
              if (payload instanceof ArrayBuffer) {
                transfer.push(payload);
              }
              srcWin.postMessage(
                {
                  __ibossWispReply: true,
                  wsId: d.wsId,
                  wsEvent: "message",
                  data: payload,
                  isBinary: isBin,
                },
                "*",
                transfer
              );
            });
            rws.addEventListener("error", function () {
              if (srcWin) {
                srcWin.postMessage(
                  { __ibossWispReply: true, wsId: d.wsId, wsEvent: "error" },
                  "*"
                );
              }
            });
            rws.addEventListener("close", function (cev) {
              openWebSockets.delete(d.wsId);
              if (srcWin) {
                srcWin.postMessage(
                  {
                    __ibossWispReply: true,
                    wsId: d.wsId,
                    wsEvent: "close",
                    code: cev.code || 1000,
                    reason: cev.reason || "",
                  },
                  "*"
                );
              }
            });
          })
          .catch(function () {
            if (srcWin) {
              srcWin.postMessage(
                { __ibossWispReply: true, wsId: d.wsId, wsEvent: "error" },
                "*"
              );
            }
          });
        return;
      }

      if (d.action === "ws:send") {
        var sock = openWebSockets.get(d.wsId);
        if (sock) {
          try {
            sock.send(d.isBinary ? new Uint8Array(d.data) : d.data);
          } catch (_e) {}
        }
        return;
      }

      if (d.action === "ws:close") {
        var sockClose = openWebSockets.get(d.wsId);
        if (sockClose) {
          openWebSockets.delete(d.wsId);
          try {
            sockClose.close(d.code || 1000, d.reason || "");
          } catch (_e) {}
        }
        return;
      }

      if (!d.rpcId || !srcWin) return;

      if (d.action === "fetch") {
        var p = d.payload || {};
        var bodyBytes = null;
        if (p.bodyB64) {
          var rawBin = window.atob(p.bodyB64);
          bodyBytes = new Uint8Array(rawBin.length);
          for (var i = 0; i < rawBin.length; i++) {
            bodyBytes[i] = rawBin.charCodeAt(i);
          }
        }
        rawFetchViaWisp(p.url, {
          method: p.method || "GET",
          headers: p.headers || {},
          body: bodyBytes,
          referer: p.referer,
        })
          .then(function (r) {
            srcWin.postMessage(
              {
                __ibossWispReply: true,
                rpcId: d.rpcId,
                result: {
                  status: r.status,
                  statusText: r.statusText,
                  headers: r.headers,
                  finalUrl: r.finalUrl,
                  buf: r.buf,
                },
              },
              "*",
              r.buf ? [r.buf] : []
            );
          })
          .catch(function (err) {
            srcWin.postMessage(
              {
                __ibossWispReply: true,
                rpcId: d.rpcId,
                error: (err && err.message) || "WISP fetch failed",
              },
              "*"
            );
          });
        return;
      }

      if (d.action === "script") {
        var sp = d.payload || {};
        (async function () {
          var r = await rawFetchViaWisp(sp.url, {
            accept: "*/*",
            referer: sp.referer,
            cacheable: true,
          });
          var srcText = new TextDecoder("utf-8").decode(r.buf);
          var rewritten = sp.isModule
            ? transformModuleSource(srcText, r.finalUrl || sp.url).code
            : rewriteLocationRefs(srcText);
          return {
            dataUrl:
              "data:text/javascript;charset=utf-8;base64," +
              utf8ToBase64(rewritten),
          };
        })()
          .then(function (resObj) {
            srcWin.postMessage(
              { __ibossWispReply: true, rpcId: d.rpcId, result: resObj },
              "*"
            );
          })
          .catch(function (err) {
            srcWin.postMessage(
              {
                __ibossWispReply: true,
                rpcId: d.rpcId,
                error: (err && err.message) || "script proxy error",
              },
              "*"
            );
          });
        return;
      }

      if (d.action === "css") {
        var cp = d.payload || {};
        (async function () {
          var r = await rawFetchViaWisp(cp.url, {
            accept: "text/css,*/*;q=0.1",
            referer: cp.referer,
            cacheable: true,
          });
          var cssText = new TextDecoder("utf-8").decode(r.buf);
          var rewrittenCss = await rewriteCssText(
            cssText,
            r.finalUrl || cp.url,
            0
          );
          return { css: rewrittenCss };
        })()
          .then(function (resObj) {
            srcWin.postMessage(
              { __ibossWispReply: true, rpcId: d.rpcId, result: resObj },
              "*"
            );
          })
          .catch(function (err) {
            srcWin.postMessage(
              {
                __ibossWispReply: true,
                rpcId: d.rpcId,
                error: (err && err.message) || "css proxy error",
              },
              "*"
            );
          });
      }
    });

    return {
      loadPage: buildProxiedDocumentBlob,
      ensureConnected: ensureConnected,
      getRelays: function () {
        return [
          { url: getSelfWispUrl(), label: "Self-Hosted (/wisp/)" },
        ].concat(DEFAULT_PUBLIC_RELAYS);
      },
      configure: function (cfg) {
        if (!cfg) return;
        var wispChanged = false;
        if (
          cfg.customWispUrl !== undefined &&
          cfg.customWispUrl !== customWispUrl
        ) {
          customWispUrl = (cfg.customWispUrl || "").trim();
          wispChanged = true;
        }
        if (cfg.allowPoolFailover !== undefined) {
          allowPoolFailover = Boolean(cfg.allowPoolFailover);
        }
        if (cfg.adblockEnabled !== undefined) {
          adblockEnabled = Boolean(cfg.adblockEnabled);
        }
        if (cfg.blockWebrtc !== undefined) {
          blockWebrtc = Boolean(cfg.blockWebrtc);
        }
        if (wispChanged) {
          activeWispUrl = null;
          selfRelayFailed = false;
          ensureConnected().catch(function () {});
        } else {
          emitStatus();
        }
      },
      reconnect: async function () {
        activeWispUrl = null;
        selfRelayFailed = false;
        await ensureConnected();
      },
      clearCache: function () {
        assetCache.clear();
      },
    };
  }

  window.IbossWispEngine = {
    create: createWispEngine,
    rewriteLocationRefs: rewriteLocationRefs,
  };
})(window);
