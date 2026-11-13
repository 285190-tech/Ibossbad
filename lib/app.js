"use strict";

var fs = require("fs");
var path = require("path");
var dns = require("dns");
var net = require("net");
var zlib = require("zlib");
var tls = require("tls");
var https = require("https");
var http = require("http");
var crypto = require("crypto");
var express = require("express");
var mime = require("mime");
var libCookie = require("cookie");
// eslint-disable-next-line node/no-missing-require
var wispPkg = require("@mercuryworkshop/wisp-js/server");
// eslint-disable-next-line node/no-missing-require
var scramjetPath = require("@mercuryworkshop/scramjet/path").scramjetPath;
// eslint-disable-next-line node/no-missing-require
var baremuxPath = require("@mercuryworkshop/bare-mux/node").baremuxPath;
var libcurlPath = require("@mercuryworkshop/libcurl-transport").libcurlPath;
var epoxyPath = require("@mercuryworkshop/epoxy-transport").epoxyPath;
var Unblocker = require("./unblocker.js");
var createAdminManager = require("./admin-manager.js");
var createDnsCache = require("./dns-cache.js");

wispPkg.logging.set_level(wispPkg.logging.NONE);
wispPkg.server.options.dns_ttl = 300;
wispPkg.server.options.dns_cache_size = 8192;
wispPkg.server.options.dns_result_order = "ipv4first";
wispPkg.server.options.send_buffer_size = 512;

var sharedDnsCache = createDnsCache({
  maxEntries: 8192,
  ttlMs: 5 * 60 * 1000,
});

// Patch @mercuryworkshop/libcurl-transport@1.5.2 and @mercuryworkshop/epoxy-transport
// so WASM readiness is awaited before constructing HTTPSession and concurrent init()
// calls share a single promise.
var LIBCURL_INIT_PATCH =
  "\n;(function () {\n" +
  "  let wasmInitPromise = null;\n" +
  "  LibcurlClient.prototype.init = async function init() {\n" +
  "    if (this.ready && this.session) return;\n" +
  "    if (this._initPromise) return this._initPromise;\n" +
  "    this._initPromise = (async () => {\n" +
  "      if (!libcurl.ready) {\n" +
  "        if (!wasmInitPromise) {\n" +
  "          wasmInitPromise = libcurl.load_wasm();\n" +
  "        }\n" +
  "        await wasmInitPromise;\n" +
  "      }\n" +
  "      if (this.transport) {\n" +
  "        libcurl.transport = this.transport;\n" +
  "      }\n" +
  "      libcurl.set_websocket(this.wisp);\n" +
  "      if (!this.session) {\n" +
  "        this.session = new libcurl.HTTPSession({ proxy: this.proxy });\n" +
  "        if (this.connections) {\n" +
  "          this.session.set_connections(...this.connections);\n" +
  "        }\n" +
  "      }\n" +
  "      this.ready = true;\n" +
  "    })().catch((err) => {\n" +
  "      this._initPromise = null;\n" +
  "      throw err;\n" +
  "    });\n" +
  "    return this._initPromise;\n" +
  "  };\n" +
  "})();\n";

var EPOXY_INIT_PATCH =
  "\n;(function () {\n" +
  "  const origInit = EpoxyTransport.prototype.init;\n" +
  "  EpoxyTransport.prototype.init = async function init() {\n" +
  "    if (this.ready && this.client) return;\n" +
  "    if (this._initPromise) return this._initPromise;\n" +
  "    this._initPromise = origInit.call(this).catch((err) => {\n" +
  "      this._initPromise = null;\n" +
  "      throw err;\n" +
  "    });\n" +
  "    return this._initPromise;\n" +
  "  };\n" +
  "})();\n";

var patchedLibcurlMjsBuffer = Buffer.from(
  fs.readFileSync(path.join(libcurlPath, "index.mjs"), "utf8") +
    LIBCURL_INIT_PATCH,
  "utf8"
);

var patchedEpoxyMjsBuffer = Buffer.from(
  fs.readFileSync(path.join(epoxyPath, "index.mjs"), "utf8") + EPOXY_INIT_PATCH,
  "utf8"
);

var libcurlVersionHash = crypto
  .createHash("sha1")
  .update(patchedLibcurlMjsBuffer)
  .digest("hex")
  .slice(0, 10);

var epoxyVersionHash = crypto
  .createHash("sha1")
  .update(patchedEpoxyMjsBuffer)
  .digest("hex")
  .slice(0, 10);

var libcurlMemoryEntry = {
  raw: patchedLibcurlMjsBuffer,
  etag: '"' + libcurlVersionHash + '"',
  br: null,
  gzip: null,
};

var epoxyMemoryEntry = {
  raw: patchedEpoxyMjsBuffer,
  etag: '"' + epoxyVersionHash + '"',
  br: null,
  gzip: null,
};

var COMPRESSIBLE_EXT_RE = /\.(js|mjs|cjs|css|html|json|svg|wasm|webmanifest|map|txt)$/i;
var staticFileCompressCache = new Map();
var MAX_STATIC_CACHE_FILES = 192;
var MAX_STATIC_COMPRESS_BYTES = 8 * 1024 * 1024;

function pickAcceptedEncoding(req) {
  var ae = String((req.headers && req.headers["accept-encoding"]) || "");
  if (!ae) return null;
  if (/\bbr\b/i.test(ae) && typeof zlib.brotliCompress === "function") {
    return "br";
  }
  if (/\bgzip\b/i.test(ae)) {
    return "gzip";
  }
  return null;
}

function sendMemoryEntry(req, res, entry, contentType, cacheControl) {
  res.setHeader("Vary", "Accept-Encoding");
  if (cacheControl) {
    res.setHeader("Cache-Control", cacheControl);
  }
  if (entry.etag) {
    res.setHeader("ETag", entry.etag);
    if (req.headers && req.headers["if-none-match"] === entry.etag) {
      return res.status(304).end();
    }
  }
  res.setHeader("Content-Type", contentType);

  var enc = pickAcceptedEncoding(req);
  if (!enc || entry.raw.length < 512) {
    res.setHeader("Content-Length", entry.raw.length);
    return res.end(req.method === "HEAD" ? undefined : entry.raw);
  }

  if (enc === "br") {
    if (entry.br) {
      res.setHeader("Content-Encoding", "br");
      res.setHeader("Content-Length", entry.br.length);
      return res.end(req.method === "HEAD" ? undefined : entry.br);
    }
    var brParams = {};
    if (zlib.constants && zlib.constants.BROTLI_PARAM_QUALITY !== undefined) {
      brParams[zlib.constants.BROTLI_PARAM_QUALITY] = 5;
    }
    return zlib.brotliCompress(
      entry.raw,
      { params: brParams },
      function (err, out) {
        var payload = !err && out ? out : entry.raw;
        if (!err && out) {
          entry.br = out;
          res.setHeader("Content-Encoding", "br");
        }
        res.setHeader("Content-Length", payload.length);
        res.end(req.method === "HEAD" ? undefined : payload);
      }
    );
  }

  if (entry.gzip) {
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Content-Length", entry.gzip.length);
    return res.end(req.method === "HEAD" ? undefined : entry.gzip);
  }
  return zlib.gzip(entry.raw, { level: 6 }, function (err, out) {
    var payload = !err && out ? out : entry.raw;
    if (!err && out) {
      entry.gzip = out;
      res.setHeader("Content-Encoding", "gzip");
    }
    res.setHeader("Content-Length", payload.length);
    res.end(req.method === "HEAD" ? undefined : payload);
  });
}

function getContentTypeForFile(filePath) {
  if (/\.wasm$/i.test(filePath)) {
    return "application/wasm";
  }
  if (/\.mjs$/i.test(filePath)) {
    return "application/javascript; charset=utf-8";
  }
  if (/\.webmanifest$/i.test(filePath)) {
    return "application/manifest+json; charset=utf-8";
  }
  var detected =
    (typeof mime.getType === "function"
      ? mime.getType(filePath)
      : mime.lookup && mime.lookup(filePath)) || "application/octet-stream";
  if (/^(text\/|application\/(javascript|json|xml))/i.test(detected)) {
    return detected + "; charset=utf-8";
  }
  return detected;
}

function createCompressedStaticMiddleware(rootDir, cacheControl) {
  var resolvedRoot = path.resolve(rootDir);
  return function compressedStaticMiddleware(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    var enc = pickAcceptedEncoding(req);
    if (!enc) return next();

    var relPath = (req.path || "/").replace(/^\/+/, "");
    if (!relPath || !COMPRESSIBLE_EXT_RE.test(relPath)) return next();

    var fullPath = path.resolve(resolvedRoot, relPath);
    if (
      fullPath !== resolvedRoot &&
      fullPath.indexOf(resolvedRoot + path.sep) !== 0
    ) {
      return next();
    }

    fs.stat(fullPath, function (statErr, st) {
      if (
        statErr ||
        !st ||
        !st.isFile() ||
        st.size > MAX_STATIC_COMPRESS_BYTES
      ) {
        return next();
      }
      var cacheKey = fullPath;
      var cached = staticFileCompressCache.get(cacheKey);
      if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
        return sendMemoryEntry(
          req,
          res,
          cached,
          cached.contentType,
          cacheControl
        );
      }
      fs.readFile(fullPath, function (readErr, buf) {
        if (readErr || !buf) return next();
        while (staticFileCompressCache.size >= MAX_STATIC_CACHE_FILES) {
          var oldest = staticFileCompressCache.keys().next().value;
          if (oldest === undefined) break;
          staticFileCompressCache.delete(oldest);
        }
        var entry = {
          raw: buf,
          mtimeMs: st.mtimeMs,
          size: st.size,
          etag:
            'W/"' +
            st.size.toString(16) +
            "-" +
            Math.floor(st.mtimeMs).toString(16) +
            '"',
          contentType: getContentTypeForFile(fullPath),
          br: null,
          gzip: null,
        };
        staticFileCompressCache.set(cacheKey, entry);
        return sendMemoryEntry(
          req,
          res,
          entry,
          entry.contentType,
          cacheControl
        );
      });
    });
  };
}

var serverInternetState = {
  checked: false,
  checking: false,
  ready: null,
  checkedAt: 0,
};

function probeServerInternetOnce() {
  var now = Date.now();
  if (
    serverInternetState.checking ||
    (serverInternetState.checked && now - serverInternetState.checkedAt < 60000)
  ) {
    return;
  }
  serverInternetState.checking = true;
  var sock = new net.Socket();
  var settled = false;
  function finish(ok) {
    if (settled) return;
    settled = true;
    serverInternetState.checking = false;
    serverInternetState.checked = true;
    serverInternetState.ready = Boolean(ok);
    serverInternetState.checkedAt = Date.now();
    try {
      sock.destroy();
    } catch (_e) {
      // ignore socket teardown error
    }
  }
  var timer = setTimeout(function () {
    finish(false);
  }, 1200);
  if (timer.unref) timer.unref();
  sock.on("connect", function () {
    clearTimeout(timer);
    finish(true);
  });
  sock.on("error", function () {
    clearTimeout(timer);
    finish(false);
  });
  try {
    sock.connect(443, "1.1.1.1");
    if (sock.unref) sock.unref();
  } catch (_err) {
    clearTimeout(timer);
    finish(false);
  }
}

var SESSION_COOKIE = "__ibossbad_session";
var ADMIN_COOKIE = "__ibossbad_admin";
var SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isPrivateOrReservedIp(ipStr) {
  if (!ipStr) return true;
  var clean = String(ipStr).trim().toLowerCase();
  if (clean.indexOf("::ffff:") === 0) clean = clean.slice(7);
  if (clean === "::1" || clean === "::" || clean === "0.0.0.0") return true;
  if (net.isIPv6(clean)) {
    return (
      clean.indexOf("fc") === 0 ||
      clean.indexOf("fd") === 0 ||
      clean.indexOf("fe8") === 0 ||
      clean.indexOf("fe9") === 0 ||
      clean.indexOf("fea") === 0 ||
      clean.indexOf("feb") === 0
    );
  }
  if (net.isIPv4(clean)) {
    var p = clean.split(".").map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    if (p[0] >= 224) return true;
    return false;
  }
  return true;
}

var DEFAULT_SUPABASE_URL = "https://xemrsowtnlderqjzluww.supabase.co";
var DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlbXJzb3d0bmxkZXJxanpsdXd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzODc2OTEsImV4cCI6MjEwNjk2MzY5MX0.JC1mA6-5glc2nN_xLhKSKpfL7LOrxbrD5UOU9pMUWWw";

function base64UrlEncode(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(b64) {
  var normalized = String(b64).replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4 !== 0) {
    normalized += "=";
  }
  return Buffer.from(normalized, "base64").toString("utf8");
}

function signSession(payload, secret) {
  var body = base64UrlEncode(JSON.stringify(payload));
  var sig = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return body + "." + sig;
}

function verifySession(token, secret) {
  if (!token || typeof token !== "string") return null;
  var dot = token.indexOf(".");
  if (dot === -1) return null;
  var body = token.substr(0, dot);
  var sig = token.substr(dot + 1);
  var expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  var sigBuf = Buffer.from(sig, "utf8");
  var expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    var payload = JSON.parse(base64UrlDecode(body));
    if (!payload || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch (_err) {
    return null;
  }
}

function verifySupabaseJwtClaims(accessToken, supabaseUrl) {
  if (!accessToken || typeof accessToken !== "string") return null;
  var parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  try {
    var payload = JSON.parse(base64UrlDecode(parts[1]));
    if (!payload || !payload.sub) return null;
    if (typeof payload.exp === "number" && Date.now() / 1000 > payload.exp) {
      return null;
    }
    var cleanBase = supabaseUrl.replace(/\/+$/, "");
    if (payload.iss && payload.iss.indexOf(cleanBase) !== 0) {
      return null;
    }
    if (!/^[0-9a-f-]{36}$/i.test(payload.sub)) {
      return null;
    }
    return payload;
  } catch (_err) {
    return null;
  }
}

function jsonRequest(targetUrl, options, callback) {
  var parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (err) {
    return callback(err);
  }
  var proto = parsed.protocol === "https:" ? https : http;
  var bodyStr = options.body ? JSON.stringify(options.body) : null;

  var headers = Object.assign(
    {
      Accept: "application/json",
    },
    options.headers || {}
  );
  if (bodyStr) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(bodyStr);
  }

  var done = false;
  var hardTimer = setTimeout(function () {
    if (req) req.destroy(new Error("Upstream request timed out"));
    finish(new Error("Upstream request timed out"));
  }, options.timeout || 3500);
  if (hardTimer.unref) hardTimer.unref();

  function finish(err, resData) {
    if (done) return;
    done = true;
    clearTimeout(hardTimer);
    callback(err, resData);
  }

  var req = proto.request(
    {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: headers,
      timeout: options.timeout || 6000,
    },
    function (res) {
      var chunks = [];
      res.on("data", function (c) {
        chunks.push(c);
      });
      res.on("end", function () {
        var raw = Buffer.concat(chunks).toString("utf8");
        var json = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch (_e) {
          json = null;
        }
        finish(null, {
          status: res.statusCode,
          data: json,
          raw: raw,
        });
      });
    }
  );

  req.on("error", function (err) {
    finish(err);
  });
  req.on("timeout", function () {
    req.destroy(new Error("Upstream request timed out"));
  });

  if (bodyStr) {
    req.write(bodyStr);
  }
  req.end();
}

function createApp(options) {
  options = options || {};

  var prefix = options.prefix || process.env.PROXY_PREFIX || "/proxy/";
  if (prefix.substr(-1) !== "/") {
    prefix += "/";
  }

  var authRequired =
    options.authRequired !== undefined
      ? Boolean(options.authRequired)
      : process.env.REQUIRE_AUTH !== "false";

  var passcodeDisabled =
    options.disablePasscode !== undefined
      ? Boolean(options.disablePasscode)
      : process.env.DISABLE_PASSCODE === "true";

  var initialPasscode = passcodeDisabled
    ? ""
    : options.passcode !== undefined
    ? String(options.passcode)
    : process.env.PROXY_PASSCODE !== undefined
    ? String(process.env.PROXY_PASSCODE)
    : "ibossbad";

  var sessionSecret =
    options.sessionSecret ||
    process.env.SESSION_SECRET ||
    "ibossbad-session-key-v1-" + (initialPasscode || "supabase-only");

  var supabaseUrl = (
    options.supabaseUrl ||
    process.env.SUPABASE_URL ||
    DEFAULT_SUPABASE_URL
  ).replace(/\/+$/, "");

  var supabaseAnonKey =
    options.supabaseAnonKey ||
    process.env.SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_ANON_KEY;

  var adminMgr = createAdminManager({
    adminPassword: options.adminPassword,
    adminEmails: options.adminEmails,
    supabaseUrl: supabaseUrl,
    supabaseAnonKey: supabaseAnonKey,
    jsonRequest: jsonRequest,
  });

  // Hydrate saved bans, keys, roles & config from Supabase in background
  if (options.autoLoadSupabase !== false) {
    adminMgr.loadFromSupabase();
  }

  var app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);

  function isHttpsReq(req) {
    return (
      req.protocol === "https" ||
      (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https"
    );
  }

  function getSessionFromReq(req) {
    var cookies = libCookie.parse((req.headers && req.headers.cookie) || "");
    var parsed = verifySession(cookies[SESSION_COOKIE], sessionSecret);
    if (!parsed) return null;
    if (adminMgr.isSessionRevoked(parsed)) return null;
    return parsed;
  }

  function getAdminFromReq(req) {
    var cookies = libCookie.parse((req.headers && req.headers.cookie) || "");
    var parsed = verifySession(cookies[ADMIN_COOKIE], sessionSecret);
    if (parsed && parsed.admin === true) {
      return parsed;
    }
    var hdrSecret = req.headers && req.headers["x-admin-password"];
    if (hdrSecret && adminMgr.verifyAdminPassword(hdrSecret)) {
      return { admin: true, viaHeader: true };
    }
    var userSess = getSessionFromReq(req);
    if (
      userSess &&
      userSess.mode === "supabase" &&
      adminMgr.getRoleForUser(userSess) === "ADMIN"
    ) {
      return {
        admin: true,
        viaAccount: true,
        email: userSess.email,
        exp: userSess.exp,
      };
    }
    return null;
  }

  function isAuthenticated(req) {
    if (!authRequired) return true;
    return Boolean(getSessionFromReq(req)) || Boolean(getAdminFromReq(req));
  }

  function appendSetCookieHeader(res, cookieStr) {
    var existing = res.getHeader("Set-Cookie");
    if (!existing) {
      res.setHeader("Set-Cookie", cookieStr);
    } else if (Array.isArray(existing)) {
      res.setHeader("Set-Cookie", existing.concat(cookieStr));
    } else {
      res.setHeader("Set-Cookie", [existing, cookieStr]);
    }
  }

  function setSessionCookie(req, res, sessionData) {
    var ttlMs = sessionData.expiresAt
      ? Math.max(60000, sessionData.expiresAt - Date.now())
      : SESSION_TTL_MS;
    var payload = {
      sid: sessionData.sid || "s-" + crypto.randomBytes(8).toString("hex"),
      uid: sessionData.uid,
      email: sessionData.email || null,
      mode: sessionData.mode,
      exp: sessionData.expiresAt || Date.now() + SESSION_TTL_MS,
    };
    var signed = signSession(payload, sessionSecret);
    var serialized = libCookie.serialize(SESSION_COOKIE, signed, {
      httpOnly: true,
      path: "/",
      maxAge: Math.floor(ttlMs / 1000),
      sameSite: "lax",
      secure: isHttpsReq(req),
    });
    appendSetCookieHeader(res, serialized);
    return payload;
  }

  function setAdminCookie(req, res) {
    var payload = {
      admin: true,
      sid: "adm-" + crypto.randomBytes(6).toString("hex"),
      exp: Date.now() + SESSION_TTL_MS,
    };
    var signed = signSession(payload, sessionSecret);
    var serialized = libCookie.serialize(ADMIN_COOKIE, signed, {
      httpOnly: true,
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      sameSite: "lax",
      secure: isHttpsReq(req),
    });
    appendSetCookieHeader(res, serialized);
    return payload;
  }

  function clearSessionCookies(res, includeAdmin) {
    var list = [
      libCookie.serialize(SESSION_COOKIE, "", {
        httpOnly: true,
        path: "/",
        maxAge: 0,
        sameSite: "lax",
      }),
      libCookie.serialize("__unblocker_origin", "", {
        path: "/",
        maxAge: 0,
        sameSite: "lax",
      }),
    ];
    if (includeAdmin) {
      list.push(
        libCookie.serialize(ADMIN_COOKIE, "", {
          httpOnly: true,
          path: "/",
          maxAge: 0,
          sameSite: "lax",
        })
      );
    }
    res.setHeader("Set-Cookie", list);
  }

  // Global IP Ban + Rate-Limit + Lockdown Enforcement Middleware
  app.use(function (req, res, next) {
    var clientIp = adminMgr.getClientIp(req);
    var isAdmin = Boolean(getAdminFromReq(req));
    var isAdminAuthEndpoint =
      req.url.indexOf("/api/admin/login") === 0 ||
      req.url.indexOf("/api/health") === 0;

    if (!isAdmin && !isAdminAuthEndpoint) {
      var activeBan = adminMgr.findActiveBan(clientIp);
      if (activeBan) {
        if (req.url.indexOf("/api/") === 0) {
          return res.status(403).json({
            ok: false,
            banned: true,
            error: activeBan.reason + " — " + adminMgr.state.banPageMessage,
          });
        }
        return res
          .status(403)
          .type("html")
          .send(
            adminMgr.renderBlockedHtml(
              "Connection Restricted",
              activeBan.reason + " — " + adminMgr.state.banPageMessage,
              clientIp
            )
          );
      }

      var sess = getSessionFromReq(req);
      var rl = adminMgr.checkRateLimit(clientIp, sess);
      if (!rl.allowed) {
        res.setHeader("Retry-After", String(rl.retryAfterSec || 30));
        if (req.url.indexOf("/api/") === 0) {
          return res.status(429).json({
            ok: false,
            error: "Rate limit exceeded. Slow down for a moment.",
          });
        }
        return res
          .status(429)
          .type("html")
          .send(
            adminMgr.renderBlockedHtml(
              "Too Many Requests",
              "Your connection exceeded the per-minute request limit. Please wait 30 seconds.",
              clientIp
            )
          );
      }
    }

    next();
  });

  // Static UI assets & local WASM/AST/JSZip vendor modules (mounted BEFORE unblocker)
  var publicDir = path.join(__dirname, "..", "public");
  var staticCacheAge = process.env.NODE_ENV === "production" ? "1h" : 0;
  var uiCacheHeader =
    process.env.NODE_ENV === "production"
      ? "public, max-age=3600"
      : "public, max-age=0";
  var IMMUTABLE_CACHE_HEADER = "public, max-age=604800, immutable";

  function setImmutableWasmHeaders(res, filePath) {
    res.setHeader("Cache-Control", IMMUTABLE_CACHE_HEADER);
    if (/\.wasm$/i.test(filePath)) {
      res.setHeader("Content-Type", "application/wasm");
    }
  }

  var libcurlVendorDir = path.dirname(require.resolve("libcurl.js"));
  var acornVendorDir = path.dirname(require.resolve("acorn"));
  var acornWalkVendorDir = path.dirname(require.resolve("acorn-walk"));
  var jszipVendorDir = path.dirname(require.resolve("jszip/dist/jszip.min.js"));

  app.get("/manifest.webmanifest", function (req, res) {
    res.type("application/manifest+json; charset=utf-8");
    res.sendFile(path.join(publicDir, "manifest.webmanifest"));
  });
  app.use("/ui", createCompressedStaticMiddleware(publicDir, uiCacheHeader));
  app.use(
    "/ui",
    express.static(publicDir, {
      index: false,
      maxAge: staticCacheAge,
    })
  );
  app.use(
    "/vendor/libcurl",
    createCompressedStaticMiddleware(libcurlVendorDir, IMMUTABLE_CACHE_HEADER),
    express.static(libcurlVendorDir, {
      index: false,
      maxAge: "7d",
      immutable: true,
      setHeaders: setImmutableWasmHeaders,
    })
  );
  app.use(
    "/vendor/acorn",
    createCompressedStaticMiddleware(acornVendorDir, IMMUTABLE_CACHE_HEADER),
    express.static(acornVendorDir, {
      index: false,
      maxAge: "7d",
      immutable: true,
      setHeaders: setImmutableWasmHeaders,
    })
  );
  app.use(
    "/vendor/acorn-walk",
    createCompressedStaticMiddleware(
      acornWalkVendorDir,
      IMMUTABLE_CACHE_HEADER
    ),
    express.static(acornWalkVendorDir, {
      index: false,
      maxAge: "7d",
      immutable: true,
      setHeaders: setImmutableWasmHeaders,
    })
  );
  app.use(
    "/vendor/jszip",
    createCompressedStaticMiddleware(jszipVendorDir, IMMUTABLE_CACHE_HEADER),
    express.static(jszipVendorDir, {
      index: false,
      maxAge: "7d",
      immutable: true,
      setHeaders: setImmutableWasmHeaders,
    })
  );
  app.use(
    "/scram",
    createCompressedStaticMiddleware(scramjetPath, IMMUTABLE_CACHE_HEADER),
    express.static(scramjetPath, {
      index: false,
      maxAge: "7d",
      immutable: true,
      setHeaders: setImmutableWasmHeaders,
    })
  );
  app.use(
    "/baremux",
    createCompressedStaticMiddleware(baremuxPath, IMMUTABLE_CACHE_HEADER),
    express.static(baremuxPath, {
      index: false,
      maxAge: "7d",
      immutable: true,
      setHeaders: setImmutableWasmHeaders,
    })
  );
  app.get("/libcurl/index.mjs", function (req, res) {
    sendMemoryEntry(
      req,
      res,
      libcurlMemoryEntry,
      "application/javascript; charset=utf-8",
      IMMUTABLE_CACHE_HEADER
    );
  });
  app.use(
    "/libcurl",
    createCompressedStaticMiddleware(libcurlPath, IMMUTABLE_CACHE_HEADER),
    express.static(libcurlPath, {
      index: false,
      maxAge: "7d",
      immutable: true,
      setHeaders: setImmutableWasmHeaders,
    })
  );
  app.get("/epoxy/index.mjs", function (req, res) {
    sendMemoryEntry(
      req,
      res,
      epoxyMemoryEntry,
      "application/javascript; charset=utf-8",
      IMMUTABLE_CACHE_HEADER
    );
  });
  app.use(
    "/epoxy",
    createCompressedStaticMiddleware(epoxyPath, IMMUTABLE_CACHE_HEADER),
    express.static(epoxyPath, {
      index: false,
      maxAge: "7d",
      immutable: true,
      setHeaders: setImmutableWasmHeaders,
    })
  );

  // Scoped COOP/COEP sandbox exclusively for EmulatorJS / multi-threaded WASM
  // (keeps main shell free of COOP so about:blank stealth popups remain intact)
  app.get("/emulator-sandbox", function (req, res) {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Cache-Control", "no-cache");
    res
      .type("html")
      .send(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Emulator Sandbox</title>' +
          "<style>html,body,#game{margin:0;padding:0;width:100%;height:100%;background:#050811;overflow:hidden;color:#94a3b8;font:13px system-ui,sans-serif}#wait{display:flex;align-items:center;justify-content:center;height:100%}</style></head>" +
          '<body><div id="game"><div id="wait">Waiting for ROM payload...</div></div><script>' +
          "var booted=false;function bootRom(d){if(booted||!d||d.type!=='iboss-emu-boot')return;booted=true;" +
          "var w=document.getElementById('wait');if(w)w.remove();" +
          "var blob=new Blob([d.romBuffer],{type:'application/octet-stream'});" +
          "window.EJS_player='#game';window.EJS_core=d.core||'gba';window.EJS_gameName=d.title||'ROM';" +
          "window.EJS_gameUrl=URL.createObjectURL(blob);window.EJS_pathtodata='https://cdn.emulatorjs.org/stable/data/';" +
          "window.EJS_threads=Boolean(window.crossOriginIsolated&&typeof SharedArrayBuffer!=='undefined');" +
          "window.EJS_startOnLoaded=true;var s=document.createElement('script');s.src='https://cdn.emulatorjs.org/stable/data/loader.js';document.body.appendChild(s);}" +
          "window.addEventListener('message',function(ev){bootRom(ev.data);});" +
          "if(typeof BroadcastChannel!=='undefined'){var bc=new BroadcastChannel('ibossbad-emu-channel');bc.onmessage=function(ev){bootRom(ev.data);};bc.postMessage({type:'iboss-emu-ready',isolated:Boolean(window.crossOriginIsolated)});}" +
          "if(window.parent&&window.parent!==window){try{window.parent.postMessage({type:'iboss-emu-ready',isolated:Boolean(window.crossOriginIsolated)},'*');}catch(_e2){}}" +
          "</script></body></html>"
      );
  });

  // Serve Scramjet Service Worker at root scope /sw.js
  app.get("/sw.js", function (req, res, next) {
    res.setHeader("Service-Worker-Allowed", "/");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    var swMiddleware = createCompressedStaticMiddleware(
      publicDir,
      "no-cache, no-store, must-revalidate"
    );
    var origPath = req.path;
    req.url = "/sw.js";
    swMiddleware(req, res, function () {
      req.url = origPath;
      res.type("application/javascript");
      res.sendFile(path.join(publicDir, "sw.js"), function (err) {
        if (err) next(err);
      });
    });
  });

  // Helper: verify that an unauthenticated account signup/login/token-session
  // ALSO supplies a valid proxy passcode or 12h key when passcode protection is enabled.
  function verifyAccountGateAccess(req) {
    var existingSession = getSessionFromReq(req);
    if (existingSession || getAdminFromReq(req) || !authRequired) {
      return { ok: true, existingSession: existingSession, keyResult: null };
    }
    var activePass = adminMgr.getEffectivePasscode(initialPasscode);
    if (!activePass) {
      return { ok: true, existingSession: null, keyResult: null };
    }
    var submitted = (req.body && req.body.passcode) || "";
    var check = adminMgr.validateAccessCodeOrKey(submitted, initialPasscode);
    if (!check.ok) {
      var clientIp = adminMgr.getClientIp(req);
      var bf = adminMgr.recordFailedAuth(clientIp, "account-passcode");
      return {
        ok: false,
        status: bf.autoBanned ? 403 : 401,
        error: bf.autoBanned
          ? "Too many failed attempts. Your IP has been temporarily restricted."
          : "Access passcode (or active 12h key) is required to sign in or create an account.",
      };
    }
    adminMgr.clearFailedAuth(adminMgr.getClientIp(req));
    return { ok: true, existingSession: null, keyResult: check };
  }

  var apiRouter = express.Router();
  apiRouter.use(express.json({ limit: "512kb" }));

  apiRouter.get("/health", function (req, res) {
    res.json({
      ok: true,
      uptime: Math.floor(process.uptime()),
    });
  });

  if (options.autoLoadSupabase !== false && !options.skipInternetProbe) {
    probeServerInternetOnce();
  }

  apiRouter.get("/status", function (req, res) {
    if (options.autoLoadSupabase !== false && !options.skipInternetProbe) {
      probeServerInternetOnce();
    }
    var session = getSessionFromReq(req);
    var adminSess = getAdminFromReq(req);
    var activePass = adminMgr.getEffectivePasscode(initialPasscode);
    var role = adminSess ? "ADMIN" : adminMgr.getRoleForUser(session);
    res.json({
      authenticated: !authRequired || Boolean(session) || Boolean(adminSess),
      isAdmin: Boolean(adminSess),
      onlineCount: adminSess ? adminMgr.getOnlineCount() : undefined,
      authRequired: authRequired,
      passcodeEnabled: Boolean(activePass),
      camouflage: adminMgr.isCamouflageActive(),
      camouflageEnabled: adminMgr.isCamouflageActive(),
      lockdownEnabled: adminMgr.isLockdownActive(),
      lockdownMessage: adminMgr.state.lockdownMessage,
      chatEnabled: adminMgr.state.chatEnabled,
      motd:
        adminMgr.state.motd && adminMgr.state.motd.enabled
          ? adminMgr.state.motd
          : null,
      lootlabs: {
        enabled: Boolean(
          adminMgr.state.lootlabs &&
            adminMgr.state.lootlabs.enabled &&
            adminMgr.state.lootlabs.linkUrl
        ),
        durationHours:
          (adminMgr.state.lootlabs && adminMgr.state.lootlabs.durationHours) ||
          12,
      },
      prefix: prefix,
      scramjetPrefix: "/scramjet/",
      wispPath: "/wisp/",
      clientIp: adminMgr.getClientIp(req),
      speed: {
        wispInternetReady: serverInternetState.ready,
        libcurlHash: libcurlVersionHash,
        epoxyHash: epoxyVersionHash,
        dnsCache: sharedDnsCache.getStats(),
      },
      user: session
        ? {
            id: session.uid,
            email: session.email,
            mode: session.mode,
            role: role,
            expiresAt: session.exp || null,
            keyExpiresAt:
              session.mode === "temp_key" ||
              session.mode === "key" ||
              session.mode === "invite"
                ? session.exp
                : null,
          }
        : adminSess
        ? {
            id: "admin",
            email: null,
            mode: "admin",
            role: "ADMIN",
            expiresAt: adminSess.exp,
          }
        : null,
      supabase: {
        enabled: Boolean(supabaseUrl && supabaseAnonKey),
        url: supabaseUrl,
        anonKey: supabaseAnonKey,
      },
    });
  });

  apiRouter.post("/auth/passcode", function (req, res) {
    if (adminMgr.isLockdownActive() && !getAdminFromReq(req)) {
      return res.status(503).json({
        ok: false,
        error: adminMgr.state.lockdownMessage,
      });
    }
    var activePass = adminMgr.getEffectivePasscode(initialPasscode);
    if (!activePass && adminMgr.state.accessKeys.length === 0) {
      return res
        .status(403)
        .json({ ok: false, error: "Passcode login is disabled." });
    }
    var clientIp = adminMgr.getClientIp(req);
    var submitted = (req.body && req.body.passcode) || "";
    var check = adminMgr.validateAccessCodeOrKey(submitted, initialPasscode);
    if (!check.ok) {
      var bf = adminMgr.recordFailedAuth(clientIp, "passcode");
      return res.status(bf.autoBanned ? 403 : 401).json({
        ok: false,
        error: bf.autoBanned
          ? "Too many failed attempts. Temporarily banned for " +
            bf.minutes +
            " minutes."
          : "Incorrect passcode or expired key. Please try again.",
      });
    }

    adminMgr.clearFailedAuth(clientIp);
    var session = setSessionCookie(req, res, {
      uid: check.mode === "temp_key" ? "key-" + check.keyCode : "passcode-user",
      mode: check.mode,
      expiresAt: check.expiresAt,
    });
    adminMgr.touchPresence(
      session,
      clientIp,
      req.headers["user-agent"] || "",
      {}
    );
    return res.json({
      ok: true,
      user: {
        id: session.uid,
        email: null,
        mode: session.mode === "temp_key" ? "key" : session.mode,
        role: adminMgr.getRoleForUser(session),
        expiresAt: session.exp,
        keyExpiresAt:
          check.mode === "temp_key" ? check.expiresAt || session.exp : null,
      },
    });
  });

  apiRouter.post("/auth/invite", function (req, res) {
    if (adminMgr.isLockdownActive() && !getAdminFromReq(req)) {
      return res.status(503).json({
        ok: false,
        error: adminMgr.state.lockdownMessage,
      });
    }
    var clientIp = adminMgr.getClientIp(req);
    var inviteCode = String(
      (req.body && (req.body.code || req.body.invite)) || ""
    ).trim();
    var redeemed = adminMgr.redeemInviteLink(inviteCode);
    if (!redeemed.ok) {
      adminMgr.recordFailedAuth(clientIp, "invite");
      return res.status(401).json(redeemed);
    }
    adminMgr.clearFailedAuth(clientIp);
    var session = setSessionCookie(req, res, {
      uid: "inv-" + redeemed.code,
      mode: "invite",
      expiresAt: redeemed.expiresAt,
    });
    adminMgr.touchPresence(
      session,
      clientIp,
      req.headers["user-agent"] || "",
      {}
    );
    return res.json({
      ok: true,
      user: {
        id: session.uid,
        email: null,
        mode: "invite",
        role: "USER",
        expiresAt: session.exp,
        keyExpiresAt: redeemed.expiresAt,
      },
    });
  });

  apiRouter.post("/auth/login", function (req, res) {
    if (adminMgr.isLockdownActive() && !getAdminFromReq(req)) {
      return res.status(503).json({
        ok: false,
        error: adminMgr.state.lockdownMessage,
      });
    }
    var email = ((req.body && req.body.email) || "").trim();
    var password = (req.body && req.body.password) || "";
    if (!email || !password) {
      return res
        .status(400)
        .json({ ok: false, error: "Email and password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        error: "Password must be at least 6 characters.",
      });
    }

    var gateCheck = verifyAccountGateAccess(req);
    if (!gateCheck.ok) {
      return res
        .status(gateCheck.status)
        .json({ ok: false, error: gateCheck.error });
    }

    var keyExp =
      gateCheck.keyResult && gateCheck.keyResult.expiresAt
        ? gateCheck.keyResult.expiresAt
        : null;

    jsonRequest(
      supabaseUrl + "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: "Bearer " + supabaseAnonKey,
        },
        body: { email: email, password: password },
      },
      function (err, response) {
        if (err) {
          return res.json({
            ok: false,
            fallbackDirect: true,
          });
        }
        if (
          response.status >= 400 ||
          !response.data ||
          !response.data.user ||
          !response.data.access_token
        ) {
          var errMsg =
            (response.data &&
              (response.data.error_description ||
                response.data.msg ||
                response.data.message)) ||
            "Invalid email or password.";
          return res.status(401).json({ ok: false, error: errMsg });
        }

        var supaUser = response.data.user;
        var role = adminMgr.getRoleForUser({
          uid: supaUser.id,
          email: supaUser.email,
        });
        var sessCookie = setSessionCookie(req, res, {
          uid: supaUser.id,
          email: supaUser.email,
          mode: "supabase",
          expiresAt: role === "VIP" || role === "ADMIN" ? null : keyExp,
        });

        return res.json({
          ok: true,
          session: {
            access_token: response.data.access_token,
            refresh_token: response.data.refresh_token,
            user: {
              id: supaUser.id,
              email: supaUser.email,
              mode: "supabase",
              role: role,
              expiresAt: sessCookie.exp,
            },
          },
        });
      }
    );
  });

  apiRouter.post("/auth/signup", function (req, res) {
    if (adminMgr.isLockdownActive() && !getAdminFromReq(req)) {
      return res.status(503).json({
        ok: false,
        error: adminMgr.state.lockdownMessage,
      });
    }
    var email = ((req.body && req.body.email) || "").trim();
    var password = (req.body && req.body.password) || "";
    if (!email || !password) {
      return res
        .status(400)
        .json({ ok: false, error: "Email and password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        error: "Password must be at least 6 characters.",
      });
    }

    var gateCheck = verifyAccountGateAccess(req);
    if (!gateCheck.ok) {
      return res
        .status(gateCheck.status)
        .json({ ok: false, error: gateCheck.error });
    }

    var keyExp =
      gateCheck.keyResult && gateCheck.keyResult.expiresAt
        ? gateCheck.keyResult.expiresAt
        : null;

    jsonRequest(
      supabaseUrl + "/auth/v1/signup",
      {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: "Bearer " + supabaseAnonKey,
        },
        body: { email: email, password: password },
      },
      function (err, response) {
        if (err) {
          return res.json({
            ok: false,
            fallbackDirect: true,
          });
        }
        var userObj =
          response.data &&
          (response.data.user || (response.data.id ? response.data : null));
        if (response.status >= 400 || !userObj) {
          var errMsg =
            (response.data &&
              (response.data.error_description ||
                response.data.msg ||
                response.data.message)) ||
            "Unable to create account.";
          return res.status(400).json({ ok: false, error: errMsg });
        }

        if (!response.data.access_token) {
          return res.status(400).json({
            ok: false,
            error:
              "Please confirm your email address first, then sign in with your password.",
          });
        }

        var role = adminMgr.getRoleForUser({
          uid: userObj.id,
          email: userObj.email,
        });
        var sessCookie = setSessionCookie(req, res, {
          uid: userObj.id,
          email: userObj.email,
          mode: "supabase",
          expiresAt: role === "VIP" || role === "ADMIN" ? null : keyExp,
        });

        adminMgr.sendDiscordAlert(
          "New Cloud Account Registered",
          "Email: `" +
            userObj.email +
            "`\nIP: `" +
            adminMgr.getClientIp(req) +
            "`",
          3066993
        );

        return res.json({
          ok: true,
          session: {
            access_token: response.data.access_token,
            refresh_token: response.data.refresh_token || null,
            user: {
              id: userObj.id,
              email: userObj.email,
              mode: "supabase",
              role: role,
              expiresAt: sessCookie.exp,
            },
          },
        });
      }
    );
  });

  apiRouter.post("/auth/token-session", function (req, res) {
    if (adminMgr.isLockdownActive() && !getAdminFromReq(req)) {
      return res.status(503).json({
        ok: false,
        error: adminMgr.state.lockdownMessage,
      });
    }
    var accessToken = (req.body && req.body.access_token) || "";
    var claims = verifySupabaseJwtClaims(accessToken, supabaseUrl);
    if (!claims) {
      return res
        .status(401)
        .json({ ok: false, error: "Invalid or expired Supabase token." });
    }

    // VIP accounts or already-unlocked sessions pass directly; otherwise require passcode/key
    var claimRole = adminMgr.getRoleForUser({
      uid: claims.sub,
      email: claims.email,
    });
    var gateCheck =
      claimRole === "VIP" || claimRole === "MOD" || claimRole === "ADMIN"
        ? { ok: true, keyResult: null }
        : verifyAccountGateAccess(req);

    if (!gateCheck.ok) {
      return res
        .status(gateCheck.status)
        .json({ ok: false, error: gateCheck.error });
    }

    var keyExp =
      gateCheck.keyResult && gateCheck.keyResult.expiresAt
        ? gateCheck.keyResult.expiresAt
        : null;

    var sessCookie = setSessionCookie(req, res, {
      uid: claims.sub,
      email: claims.email || null,
      mode: "supabase",
      expiresAt: claimRole === "VIP" || claimRole === "ADMIN" ? null : keyExp,
    });

    return res.json({
      ok: true,
      user: {
        id: claims.sub,
        email: claims.email || null,
        mode: "supabase",
        role: claimRole,
        expiresAt: sessCookie.exp,
      },
    });
  });

  apiRouter.post("/auth/logout", function (req, res) {
    clearSessionCookies(res, true);
    res.json({ ok: true });
  });

  // --- LootLabs 12h Key Redirect & Signed Claim Callback ---
  apiRouter.post("/keys/lootlabs-start", function (req, res) {
    var ll = adminMgr.state.lootlabs;
    if (!ll || !ll.enabled || !ll.linkUrl) {
      return res.status(400).json({
        ok: false,
        error: "Free 12h key link is not enabled right now.",
      });
    }
    var claimToken = signSession(
      {
        lootlabsClaim: true,
        ip: adminMgr.getClientIp(req),
        hours: Number(ll.durationHours) || 12,
        nonce: crypto.randomBytes(6).toString("hex"),
        exp: Date.now() + 30 * 60 * 1000,
      },
      sessionSecret
    );
    var callbackUrl =
      (isHttpsReq(req) ? "https://" : "http://") +
      req.headers.host +
      "/api/keys/lootlabs-claim?token=" +
      encodeURIComponent(claimToken);

    return res.json({
      ok: true,
      lootlabsUrl: ll.linkUrl,
      callbackUrl: callbackUrl,
    });
  });

  apiRouter.get("/keys/lootlabs-claim", function (req, res) {
    var token = String(req.query.token || "");
    var verified = verifySession(token, sessionSecret);
    if (!verified || !verified.lootlabsClaim) {
      return res.redirect(302, "/?key_error=invalid_or_expired");
    }
    var hours = Math.max(1, Number(verified.hours) || 12);
    var minted = adminMgr.generateAccessKey({
      label: "LootLabs " + hours + "h Claim",
      durationHours: hours,
      maxUses: 1,
    });
    minted.uses = 1;
    setSessionCookie(req, res, {
      uid: "key-" + minted.code,
      mode: "temp_key",
      expiresAt: minted.expiresAt,
    });
    return res.redirect(
      302,
      "/?key_claimed=" + encodeURIComponent(minted.code)
    );
  });

  // --- Live Presence Heartbeat, Domain Policy Check & Visit Logging ---
  apiRouter.post("/presence/heartbeat", function (req, res) {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ ok: false, locked: true });
    }
    var sess = getSessionFromReq(req) || {
      sid: "admin-local",
      uid: "admin",
      email: null,
      mode: "admin",
      isAdmin: true,
      exp: Date.now() + SESSION_TTL_MS,
    };
    var clientIp = adminMgr.getClientIp(req);
    var body = req.body || {};

    if (body.logUrl) {
      adminMgr.logVisit({
        ip: clientIp,
        session: sess,
        engine: body.engine || "scramjet",
        url: body.logUrl,
      });
    }

    var presence = adminMgr.touchPresence(
      sess,
      clientIp,
      req.headers["user-agent"] || "",
      body
    );
    var isAdminCaller = Boolean(getAdminFromReq(req));
    return res.json(
      Object.assign(
        {
          ok: true,
          presence: presence,
          isAdmin: isAdminCaller,
          onlineCount: isAdminCaller ? adminMgr.getOnlineCount() : undefined,
        },
        presence || {}
      )
    );
  });

  function handleCheckUrl(req, res) {
    if (!isAuthenticated(req)) {
      return res
        .status(401)
        .json({ ok: false, allowed: false, error: "Authentication required." });
    }
    var targetUrl = String(
      (req.body && req.body.url) || (req.query && req.query.url) || ""
    );
    var engine = String(
      (req.body && req.body.engine) ||
        (req.query && req.query.engine) ||
        "scramjet"
    );
    var clientIp = adminMgr.getClientIp(req);
    var sess = getSessionFromReq(req);
    var check = adminMgr.checkDomainAllowed(targetUrl, clientIp, sess);
    if (!check.allowed) {
      return res.status(403).json({
        ok: false,
        allowed: false,
        reason: check.reason,
      });
    }
    adminMgr.logVisit({
      ip: clientIp,
      session: sess,
      engine: engine,
      url: targetUrl,
    });
    return res.json({ ok: true, allowed: true });
  }

  apiRouter.get("/check-url", handleCheckUrl);
  apiRouter.post("/check-url", handleCheckUrl);

  // --- Safe-Filename Proxy File Downloader (with Private-IP SSRF Protection) ---
  apiRouter.get("/safe-download", function (req, res) {
    if (!isAuthenticated(req)) {
      return res
        .status(401)
        .json({ ok: false, error: "Unlock required to download files." });
    }
    var rawUrl = String((req.query && req.query.url) || "").trim();
    var customName = String((req.query && req.query.filename) || "").trim();
    var parsed;
    try {
      parsed = new URL(rawUrl);
    } catch (_e) {
      return res.status(400).json({ ok: false, error: "Invalid file URL." });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return res
        .status(400)
        .json({ ok: false, error: "Only http/https URLs are supported." });
    }

    var clientIp = adminMgr.getClientIp(req);
    var sess = getSessionFromReq(req);
    var domCheck = adminMgr.checkDomainAllowed(rawUrl, clientIp, sess);
    if (!domCheck.allowed) {
      return res.status(403).json({ ok: false, error: domCheck.reason });
    }

    var cleanFilename = (
      customName ||
      path.basename(parsed.pathname) ||
      "study-document.bin"
    )
      .replace(/[^a-zA-Z0-9._ -]/g, "_")
      .slice(0, 120);
    if (!cleanFilename) cleanFilename = "study-document.bin";

    dns.lookup(parsed.hostname, function (dnsErr, resolvedIp) {
      if (dnsErr || isPrivateOrReservedIp(resolvedIp)) {
        return res.status(403).json({
          ok: false,
          error: "Blocked private, loopback, or unresolvable download target.",
        });
      }

      adminMgr.logVisit({
        ip: clientIp,
        session: sess,
        engine: "downloader",
        url: rawUrl,
      });

      var proto = parsed.protocol === "https:" ? https : http;
      var dlReq = proto.get(
        rawUrl,
        {
          timeout: 15000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
          },
        },
        function (upRes) {
          if (upRes.statusCode >= 400) {
            upRes.resume();
            return res.status(502).json({
              ok: false,
              error: "Remote server returned HTTP " + upRes.statusCode,
            });
          }
          res.setHeader(
            "Content-Type",
            upRes.headers["content-type"] || "application/octet-stream"
          );
          res.setHeader(
            "Content-Disposition",
            'attachment; filename="' + cleanFilename + '"'
          );
          var maxBytes = 100 * 1024 * 1024; // 100 MB cap
          var seen = 0;
          upRes.on("data", function (chunk) {
            seen += chunk.length;
            if (seen > maxBytes) {
              dlReq.destroy();
              res.end();
              return;
            }
            res.write(chunk);
          });
          upRes.on("end", function () {
            res.end();
          });
        }
      );
      dlReq.on("error", function () {
        if (!res.headersSent) {
          res
            .status(502)
            .json({ ok: false, error: "Failed to fetch remote file." });
        } else {
          res.end();
        }
      });
      dlReq.on("timeout", function () {
        dlReq.destroy(new Error("Timeout"));
      });
    });
  });

  // --- Custom Games Catalog Additions, Chat, Polls & Game Requests ---
  apiRouter.get("/games", function (req, res) {
    res.json({
      ok: true,
      customGames: adminMgr.state.customGames || [],
    });
  });

  apiRouter.get("/chat", function (req, res) {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ ok: false, error: "Unlock required." });
    }
    var sess = getSessionFromReq(req);
    var voterKey =
      (sess && sess.sid) ||
      (sess && sess.uid && sess.uid !== "passcode-user"
        ? sess.uid
        : adminMgr.getClientIp(req));
    res.json({
      ok: true,
      enabled: adminMgr.state.chatEnabled,
      messages: adminMgr.state.chatMessages.slice(-80),
      poll: adminMgr.getPublicPoll(voterKey),
    });
  });

  apiRouter.post("/chat/vote", function (req, res) {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ ok: false, error: "Unlock required." });
    }
    var sess = getSessionFromReq(req);
    var voterKey =
      (sess && sess.sid) ||
      (sess && sess.uid && sess.uid !== "passcode-user"
        ? sess.uid
        : adminMgr.getClientIp(req));
    var out = adminMgr.votePoll(req.body && req.body.optionId, voterKey);
    if (!out.ok) return res.status(400).json(out);
    return res.json(out);
  });

  apiRouter.post("/chat", function (req, res) {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ ok: false, error: "Unlock required." });
    }
    var isAdmin = Boolean(getAdminFromReq(req));
    var sess = getSessionFromReq(req);
    var out = adminMgr.postChatMessage(
      sess,
      adminMgr.getClientIp(req),
      req.body && req.body.text,
      isAdmin
    );
    if (!out.ok) {
      return res.status(400).json(out);
    }
    return res.json(out);
  });

  apiRouter.post("/requests", function (req, res) {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ ok: false, error: "Unlock required." });
    }
    var out = adminMgr.submitGameRequest(
      getSessionFromReq(req),
      adminMgr.getClientIp(req),
      req.body
    );
    if (!out.ok) {
      return res.status(400).json(out);
    }
    return res.json(out);
  });

  // --- Cloud User Data + Game Saves Sync ---
  apiRouter.get("/user-data", function (req, res) {
    var token = req.headers["x-supabase-token"];
    var claims = verifySupabaseJwtClaims(token, supabaseUrl);
    if (!claims) {
      return res
        .status(401)
        .json({ ok: false, error: "Valid Supabase token required." });
    }

    jsonRequest(
      supabaseUrl +
        "/rest/v1/ibossbad_user_data?user_id=eq." +
        encodeURIComponent(claims.sub) +
        "&select=bookmarks,settings,game_saves,updated_at&limit=1",
      {
        method: "GET",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: "Bearer " + token,
        },
      },
      function (err, response) {
        if (err) {
          return res.json({ ok: false, fallbackDirect: true });
        }
        if (response.status >= 400) {
          return res.status(response.status).json({
            ok: false,
            error: "Failed to load cloud data.",
          });
        }
        var row = Array.isArray(response.data) ? response.data[0] : null;
        return res.json({
          ok: true,
          data: row || { bookmarks: [], settings: {}, game_saves: {} },
        });
      }
    );
  });

  apiRouter.put("/user-data", function (req, res) {
    var token = req.headers["x-supabase-token"];
    var claims = verifySupabaseJwtClaims(token, supabaseUrl);
    if (!claims) {
      return res
        .status(401)
        .json({ ok: false, error: "Valid Supabase token required." });
    }

    var payloadBody = {
      user_id: claims.sub,
      updated_at: new Date().toISOString(),
    };
    if (Array.isArray(req.body && req.body.bookmarks)) {
      payloadBody.bookmarks = req.body.bookmarks.slice(0, 150);
    }
    if (
      req.body &&
      req.body.settings &&
      typeof req.body.settings === "object"
    ) {
      payloadBody.settings = req.body.settings;
    }
    if (
      req.body &&
      req.body.game_saves &&
      typeof req.body.game_saves === "object"
    ) {
      payloadBody.game_saves = req.body.game_saves;
    }

    jsonRequest(
      supabaseUrl + "/rest/v1/ibossbad_user_data?on_conflict=user_id",
      {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: "Bearer " + token,
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: payloadBody,
      },
      function (err, response) {
        if (err) {
          return res.json({ ok: false, fallbackDirect: true });
        }
        if (response.status >= 400) {
          return res.status(response.status).json({
            ok: false,
            error: "Failed to save cloud data.",
          });
        }
        var row = Array.isArray(response.data)
          ? response.data[0]
          : response.data;
        return res.json({
          ok: true,
          data: row,
        });
      }
    );
  });

  // --- Admin Command Center Router (/api/admin/*) ---
  var adminRouter = express.Router();

  adminRouter.post("/login", function (req, res) {
    var clientIp = adminMgr.getClientIp(req);
    var pwd = (req.body && req.body.password) || "";
    if (!adminMgr.verifyAdminPassword(pwd)) {
      var bf = adminMgr.recordFailedAuth(clientIp, "admin");
      return res.status(bf.autoBanned ? 403 : 401).json({
        ok: false,
        error: bf.autoBanned
          ? "Too many failed admin attempts. IP restricted."
          : "Incorrect Admin password.",
      });
    }
    adminMgr.clearFailedAuth(clientIp);
    setAdminCookie(req, res);
    if (!getSessionFromReq(req)) {
      setSessionCookie(req, res, {
        uid: "admin",
        mode: "admin",
      });
    }
    return res.json({
      ok: true,
      clientIp: clientIp,
      snapshot: adminMgr.getAnalyticsSnapshot(initialPasscode),
    });
  });

  adminRouter.post("/logout", function (req, res) {
    appendSetCookieHeader(
      res,
      libCookie.serialize(ADMIN_COOKIE, "", {
        httpOnly: true,
        path: "/",
        maxAge: 0,
        sameSite: "lax",
      })
    );
    res.json({ ok: true });
  });

  // Require Admin auth on all remaining /api/admin/* routes
  adminRouter.use(function (req, res, next) {
    if (!getAdminFromReq(req)) {
      return res
        .status(401)
        .json({ ok: false, error: "Admin authentication required." });
    }
    next();
  });

  adminRouter.get("/dashboard", function (req, res) {
    res.json({
      ok: true,
      clientIp: adminMgr.getClientIp(req),
      snapshot: adminMgr.getAnalyticsSnapshot(initialPasscode),
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.post("/rotate-password", function (req, res) {
    var currentPwd = (req.body && req.body.currentPassword) || "";
    var newPwd = (req.body && req.body.newPassword) || "";
    adminMgr.rotateAdminPassword(currentPwd, newPwd, function (err) {
      if (err) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      return res.json({ ok: true });
    });
  });

  adminRouter.post("/ban-ip", function (req, res) {
    var targetIp = String((req.body && req.body.ip) || "").trim();
    var reason = (req.body && req.body.reason) || "Banned by administrator";
    var durationMinutes = Number((req.body && req.body.durationMinutes) || 0);
    var callerIp = adminMgr.getClientIp(req);
    var forceSelf = Boolean(req.body && req.body.allowSelf);

    if (!targetIp) {
      return res
        .status(400)
        .json({ ok: false, error: "IP address is required." });
    }
    if (!forceSelf && targetIp === callerIp) {
      return res.status(400).json({
        ok: false,
        error:
          "Self-ban safeguard: that matches your own IP (" + callerIp + ").",
      });
    }
    var entry = adminMgr.banIp(targetIp, reason, durationMinutes, false);
    adminMgr.recordAudit("Ban IP", targetIp + " (" + reason + ")");
    return res.json({
      ok: true,
      ban: entry,
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.post("/unban-ip", function (req, res) {
    var targetIp = String((req.body && req.body.ip) || "").trim();
    adminMgr.unbanIp(targetIp);
    adminMgr.recordAudit("Unban IP", targetIp);
    return res.json({
      ok: true,
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.post("/session-action", function (req, res) {
    var sid = String((req.body && req.body.sid) || "");
    var action = String((req.body && req.body.action) || "");
    var data = (req.body && req.body.data) || {};
    var applied = adminMgr.performSessionAction(sid, action, data);
    adminMgr.recordAudit("Session Action", action + " -> " + sid);
    return res.json({ ok: applied });
  });

  adminRouter.post("/mass-cloak", function (req, res) {
    var epoch = adminMgr.triggerMassCloak();
    adminMgr.recordAudit("Global Mass-Cloak", "All active sessions");
    return res.json({ ok: true, massCloakEpoch: epoch });
  });

  adminRouter.post("/broadcast", function (req, res) {
    var text = req.body ? req.body.text : "";
    var level = (req.body && req.body.level) || "info";
    var mins = Number((req.body && req.body.durationMinutes) || 30);
    var bc = adminMgr.setBroadcast(text, level, mins);
    return res.json({
      ok: true,
      broadcast: bc,
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.put("/config", function (req, res) {
    var b = req.body || {};
    if (b.passcode !== undefined) {
      adminMgr.state.passcodeOverride = String(b.passcode);
    }
    if (b.camouflageEnabled !== undefined) {
      adminMgr.state.camouflageEnabled = Boolean(b.camouflageEnabled);
    }
    if (b.lockdownEnabled !== undefined) {
      adminMgr.state.lockdownEnabled = Boolean(b.lockdownEnabled);
    }
    if (b.lockdownMessage !== undefined) {
      adminMgr.state.lockdownMessage = String(b.lockdownMessage).slice(0, 300);
    }
    if (b.banPageMessage !== undefined) {
      adminMgr.state.banPageMessage = String(b.banPageMessage).slice(0, 300);
    }
    if (b.chatEnabled !== undefined) {
      adminMgr.state.chatEnabled = Boolean(b.chatEnabled);
    }
    if (b.rateLimitPerMin !== undefined) {
      adminMgr.state.rateLimitPerMin = Math.max(
        0,
        Number(b.rateLimitPerMin) || 0
      );
    }
    if (b.bruteForceMaxAttempts !== undefined) {
      adminMgr.state.bruteForceMaxAttempts = Math.max(
        0,
        Number(b.bruteForceMaxAttempts) || 0
      );
    }
    if (b.bruteForceBanMinutes !== undefined) {
      adminMgr.state.bruteForceBanMinutes = Math.max(
        1,
        Number(b.bruteForceBanMinutes) || 15
      );
    }
    if (b.whitelistMode !== undefined) {
      adminMgr.state.whitelistMode = Boolean(b.whitelistMode);
    }
    if (Array.isArray(b.domainWhitelist)) {
      adminMgr.state.domainWhitelist = b.domainWhitelist
        .map(function (d) {
          return String(d).trim().toLowerCase();
        })
        .filter(Boolean);
    }
    if (Array.isArray(b.domainBlacklist)) {
      adminMgr.state.domainBlacklist = b.domainBlacklist
        .map(function (d) {
          return String(d).trim().toLowerCase();
        })
        .filter(Boolean);
    }
    if (b.perTargetRules && typeof b.perTargetRules === "object") {
      adminMgr.state.perTargetRules = b.perTargetRules;
    }
    if (b.schedule && typeof b.schedule === "object") {
      adminMgr.state.schedule = {
        enabled: Boolean(b.schedule.enabled),
        startHour: Math.min(23, Math.max(0, Number(b.schedule.startHour) || 8)),
        endHour: Math.min(23, Math.max(0, Number(b.schedule.endHour) || 15)),
        action: b.schedule.action === "lockdown" ? "lockdown" : "camouflage",
      };
    }
    if (b.lootlabs && typeof b.lootlabs === "object") {
      adminMgr.state.lootlabs = {
        enabled: Boolean(b.lootlabs.enabled),
        linkUrl: String(b.lootlabs.linkUrl || "").trim(),
        durationHours: Math.max(1, Number(b.lootlabs.durationHours) || 12),
      };
    }
    if (b.discordWebhookUrl !== undefined) {
      adminMgr.state.discordWebhookUrl = String(
        b.discordWebhookUrl || ""
      ).trim();
    }
    if (b.chatSlowModeSec !== undefined) {
      adminMgr.state.chatSlowModeSec = Math.max(
        0,
        Math.min(300, Number(b.chatSlowModeSec) || 0)
      );
    }
    if (Array.isArray(b.chatBlockedWords)) {
      adminMgr.state.chatBlockedWords = b.chatBlockedWords
        .map(function (w) {
          return String(w || "")
            .trim()
            .toLowerCase();
        })
        .filter(Boolean)
        .slice(0, 200);
    }
    adminMgr.recordAudit("Update Policies", "Admin config saved");

    adminMgr.persistToSupabase(function (_e, syncInfo) {
      res.json({
        ok: true,
        syncInfo: syncInfo,
        exportableState: adminMgr.exportableState(),
        snapshot: adminMgr.getAnalyticsSnapshot(initialPasscode),
      });
    });
  });

  adminRouter.post("/keys", function (req, res) {
    var keyObj = adminMgr.generateAccessKey(req.body || {});
    res.json({
      ok: true,
      key: keyObj,
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.delete("/keys/:code", function (req, res) {
    adminMgr.revokeAccessKey(req.params.code);
    res.json({
      ok: true,
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.post("/invites", function (req, res) {
    var inv = adminMgr.createInviteLink(req.body || {});
    res.json({
      ok: true,
      invite: inv,
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.delete("/invites/:code", function (req, res) {
    adminMgr.revokeInviteLink(req.params.code);
    res.json({
      ok: true,
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.post("/motd", function (req, res) {
    var motd = adminMgr.setMotd(req.body || {});
    res.json({
      ok: true,
      motd: motd,
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.post("/poll", function (req, res) {
    if (req.body && req.body.action === "close") {
      adminMgr.closePoll();
      return res.json({
        ok: true,
        poll: null,
        exportableState: adminMgr.exportableState(),
      });
    }
    var out = adminMgr.createPoll(
      req.body && req.body.question,
      req.body && req.body.options
    );
    if (!out.ok) return res.status(400).json(out);
    return res.json({
      ok: true,
      poll: out.poll,
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.put("/roles", function (req, res) {
    var identifier = String((req.body && req.body.identifier) || "")
      .trim()
      .toLowerCase();
    var role = String((req.body && req.body.role) || "USER").toUpperCase();
    if (!identifier) {
      return res
        .status(400)
        .json({ ok: false, error: "Email or User ID is required." });
    }
    if (role === "USER" || role === "NONE") {
      delete adminMgr.state.roles[identifier];
    } else if (role === "VIP" || role === "MOD" || role === "ADMIN") {
      adminMgr.state.roles[identifier] = role;
    }
    adminMgr.recordAudit("Assign Role", identifier + " -> " + role);
    adminMgr.persistToSupabase();
    return res.json({
      ok: true,
      roles: adminMgr.state.roles,
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.post("/games", function (req, res) {
    var title = String((req.body && req.body.title) || "").trim();
    var url = String((req.body && req.body.url) || "").trim();
    var category = String((req.body && req.body.category) || "featured").trim();
    var aliases = Array.isArray(req.body && req.body.aliases)
      ? req.body.aliases
      : [];
    if (!title || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({
        ok: false,
        error: "Valid game title and http(s) URL are required.",
      });
    }
    adminMgr.state.customGames.unshift({
      title: title.slice(0, 80),
      url: url.slice(0, 500),
      category: category.slice(0, 32),
      aliases: aliases.slice(0, 10),
      addedBy: "admin",
      createdAt: Date.now(),
    });
    adminMgr.persistToSupabase();
    return res.json({
      ok: true,
      customGames: adminMgr.state.customGames,
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.delete("/games", function (req, res) {
    var url = String((req.body && req.body.url) || "");
    adminMgr.state.customGames = adminMgr.state.customGames.filter(function (
      g
    ) {
      return g.url !== url;
    });
    adminMgr.persistToSupabase();
    return res.json({
      ok: true,
      customGames: adminMgr.state.customGames,
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.post("/requests/:id", function (req, res) {
    var out = adminMgr.resolveGameRequest(
      req.params.id,
      req.body && req.body.action,
      req.body && req.body.category
    );
    if (!out.ok) return res.status(404).json(out);
    return res.json({
      ok: true,
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.delete("/chat/:id", function (req, res) {
    adminMgr.deleteChatMessage(req.params.id);
    return res.json({
      ok: true,
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.post("/chat/clear", function (req, res) {
    adminMgr.clearChat();
    return res.json({
      ok: true,
      exportableState: adminMgr.exportableState(),
    });
  });

  adminRouter.post("/logs/clear", function (req, res) {
    adminMgr.clearLogs(function () {
      res.json({ ok: true });
    });
  });

  adminRouter.get("/export", function (req, res) {
    var fmt = String(req.query.format || "json").toLowerCase();
    if (fmt === "csv") {
      var rows = ["timestamp,ip,user,mode,engine,domain,url"];
      adminMgr.getLogs().forEach(function (l) {
        rows.push(
          [
            new Date(l.ts).toISOString(),
            l.ip,
            '"' + String(l.userLabel || "").replace(/"/g, '""') + '"',
            l.userMode,
            l.engine,
            l.domain,
            '"' + String(l.url || "").replace(/"/g, '""') + '"',
          ].join(",")
        );
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="ibossbad-access-logs.csv"'
      );
      return res.send(rows.join("\n"));
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="ibossbad-admin-backup.json"'
    );
    return res.send(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          state: adminMgr.exportableState(),
          logs: adminMgr.getLogs(),
        },
        null,
        2
      )
    );
  });

  adminRouter.post("/import-state", function (req, res) {
    if (req.body && req.body.state) {
      adminMgr.importPersistedState(req.body.state);
      adminMgr.persistToSupabase();
    }
    res.json({
      ok: true,
      snapshot: adminMgr.getAnalyticsSnapshot(initialPasscode),
    });
  });

  apiRouter.use("/admin", adminRouter);
  app.use("/api", apiRouter);

  // Enforce access gate, lockdown & domain policy before forwarding proxy requests
  app.use(function (req, res, next) {
    var isProxyRoute =
      req.url === prefix.substr(0, prefix.length - 1) ||
      req.url.indexOf(prefix) === 0 ||
      req.url.indexOf("/scramjet/") === 0 ||
      req.url.indexOf("/mgg-games") === 0;

    var hasProxyReferer =
      req.headers.referer && req.headers.referer.indexOf(prefix) !== -1;

    if (isProxyRoute || hasProxyReferer) {
      if (!isAuthenticated(req)) {
        var acceptsHtml =
          req.headers.accept && req.headers.accept.indexOf("text/html") !== -1;
        if (acceptsHtml && req.method === "GET") {
          var target =
            req.url.indexOf(prefix) === 0 ? req.url.substr(prefix.length) : "";
          var redirectUrl = target
            ? "/?locked=1&url=" + encodeURIComponent(target)
            : "/?locked=1";
          return res.redirect(302, redirectUrl);
        }
        return res.status(401).json({
          ok: false,
          error: "Authentication required to use proxy.",
        });
      }

      if (adminMgr.isLockdownActive() && !getAdminFromReq(req)) {
        return res
          .status(503)
          .type("html")
          .send(
            adminMgr.renderBlockedHtml(
              "Maintenance Lockdown",
              adminMgr.state.lockdownMessage,
              adminMgr.getClientIp(req)
            )
          );
      }

      if (req.url.indexOf(prefix) === 0) {
        var rawTarget = req.url.substr(prefix.length);
        var clientIp = adminMgr.getClientIp(req);
        var sess = getSessionFromReq(req);
        var domCheck = adminMgr.checkDomainAllowed(rawTarget, clientIp, sess);
        if (!domCheck.allowed) {
          return res
            .status(403)
            .type("html")
            .send(
              adminMgr.renderBlockedHtml(
                "Site Restricted",
                domCheck.reason,
                clientIp
              )
            );
        }
        if (
          req.headers.accept &&
          req.headers.accept.indexOf("text/html") !== -1
        ) {
          adminMgr.logVisit({
            ip: clientIp,
            session: sess,
            engine: "stream",
            url: rawTarget,
          });
        }
      }
    }
    next();
  });

  var strictSsl = process.env.PROXY_STRICT_SSL === "true";
  var defaultHttpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 128,
    maxFreeSockets: 32,
    lookup: sharedDnsCache.lookup,
  });
  var defaultHttpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 128,
    maxFreeSockets: 32,
    rejectUnauthorized: strictSsl,
    lookup: sharedDnsCache.lookup,
  });

  var unblocker = new Unblocker({
    prefix: prefix,
    host: options.host || process.env.PROXY_HOST || null,
    httpAgent: options.httpAgent || defaultHttpAgent,
    httpsAgent: options.httpsAgent || defaultHttpsAgent,
    rewriteLocation:
      options.rewriteLocation !== undefined ? options.rewriteLocation : true,
    isolateStorage:
      options.isolateStorage !== undefined ? options.isolateStorage : true,
    enableOriginCookie:
      options.enableOriginCookie !== undefined
        ? options.enableOriginCookie
        : true,
    ignorePaths: [
      "/api/",
      "/ui/",
      "/vendor/",
      "/scram/",
      "/scramjet/",
      "/baremux/",
      "/libcurl/",
      "/epoxy/",
      "/sw.js",
      "/wisp/",
      "/mgg-games/",
      "/emulator-sandbox",
      "/manifest.webmanifest",
      "/favicon.ico",
    ],
    requestMiddleware: options.requestMiddleware || [],
    responseMiddleware: options.responseMiddleware || [],
  });

  // Direct GitHub-backed mirror for MonkeyGG2 HTML5, Unity WebGL & Ruffle Flash games.
  // Bypasses broken upstream GitHub Pages custom CNAMEs (e.g. pijgalk.desarrollos-lowcost.com)
  // and serves all 190+ games with proper MIME types and HTTP keep-alive caching.
  var mggTlsCa = Array.isArray(tls.rootCertificates)
    ? tls.rootCertificates.slice()
    : undefined;
  if (mggTlsCa && fs.existsSync("/etc/ssl/certs/ca-certificates.crt")) {
    try {
      mggTlsCa.push(
        fs.readFileSync("/etc/ssl/certs/ca-certificates.crt", "utf8")
      );
    } catch (_caErr) {
      // Ignore unreadable system CA file
    }
  }
  var mggHttpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 64,
    lookup: sharedDnsCache.lookup,
    ca: mggTlsCa,
  });
  var mggHttpAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 32,
  });
  var mggTiers = options.mggUpstreamBaseUrl
    ? [
        {
          base: options.mggUpstreamBaseUrl,
          accept: "*/*",
        },
        {
          base: options.mggFallbackBaseUrl || options.mggUpstreamBaseUrl,
          accept: "*/*",
        },
      ]
    : [
        {
          base:
            "https://raw.githubusercontent.com/MonkeyGG2/monkeygg2.github.io/main/games/",
          accept: "*/*",
        },
        {
          base:
            "https://cdn.jsdelivr.net/gh/MonkeyGG2/monkeygg2.github.io@main/games/",
          accept: "*/*",
        },
        {
          base:
            "https://api.github.com/repos/MonkeyGG2/monkeygg2.github.io/contents/games/",
          accept: "application/vnd.github.v3.raw",
        },
      ];
  var preferredMggTierIdx = 0;
  var preferredMggTierStickyUntil = 0;

  function resolveMggMimeAndEncoding(filePath) {
    var contentEncoding = null;
    var effectivePath = filePath;
    if (/\.br$/i.test(filePath)) {
      contentEncoding = "br";
      effectivePath = filePath.slice(0, -3);
    } else if (/\.gz$/i.test(filePath)) {
      contentEncoding = "gzip";
      effectivePath = filePath.slice(0, -3);
    }

    var contentType;
    if (/\.wasm$/i.test(effectivePath)) {
      contentType = "application/wasm";
    } else if (/\.swf$/i.test(effectivePath)) {
      contentType = "application/x-shockwave-flash";
    } else if (/\.(unityweb|data|mem|bin|pck)$/i.test(effectivePath)) {
      contentType = "application/octet-stream";
    } else {
      contentType = getContentTypeForFile(effectivePath);
    }
    return { contentType: contentType, contentEncoding: contentEncoding };
  }

  function fetchMggUpstream(fullUrl, acceptHeader, rangeHeader, cb) {
    var parsed;
    try {
      parsed = new URL(fullUrl);
    } catch (err) {
      return cb(err);
    }
    var isHttps = parsed.protocol === "https:";
    var transport = isHttps ? https : http;
    var headers = {
      "User-Agent": "Ibossbad-GameMirror/8.0",
      Accept: acceptHeader || "*/*",
    };
    if (rangeHeader) {
      headers.Range = rangeHeader;
    }
    var reqUp = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: headers,
        agent: isHttps ? mggHttpsAgent : mggHttpAgent,
        timeout: 8000,
      },
      function (upRes) {
        cb(null, upRes);
      }
    );
    reqUp.on("timeout", function () {
      reqUp.destroy(new Error("Upstream game mirror timeout"));
    });
    reqUp.on("error", function (err) {
      cb(err);
    });
    reqUp.end();
  }

  function fetchMggAcrossTiers(relSuffix, rangeHeader, cb) {
    var now = Date.now();
    var startTier = now < preferredMggTierStickyUntil ? preferredMggTierIdx : 0;
    var order = [];
    for (var i = 0; i < mggTiers.length; i++) {
      order.push((startTier + i) % mggTiers.length);
    }

    var attemptIdx = 0;
    var lastStatus = 502;
    function tryNext() {
      if (attemptIdx >= order.length) {
        return cb(new Error("All game mirror tiers failed"), null, lastStatus);
      }
      var tierIdx = order[attemptIdx++];
      var tier = mggTiers[tierIdx];
      var fullUrl = tier.base.replace(/\/+$/, "") + "/" + relSuffix;
      fetchMggUpstream(
        fullUrl,
        tier.accept,
        rangeHeader,
        function (err, upRes) {
          if (
            !err &&
            upRes &&
            (upRes.statusCode === 200 || upRes.statusCode === 206)
          ) {
            if (tierIdx !== 0) {
              preferredMggTierIdx = tierIdx;
              preferredMggTierStickyUntil = Date.now() + 5 * 60 * 1000;
            }
            return cb(null, upRes, upRes.statusCode);
          }
          if (upRes) {
            lastStatus = upRes.statusCode || lastStatus;
            upRes.resume();
            // Genuine 404 from a reachable upstream does not need to hit fallback mirrors
            if (upRes.statusCode === 404) {
              return cb(null, null, 404);
            }
          }
          tryNext();
        }
      );
    }
    tryNext();
  }

  app.use("/mgg-games", function (req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return res.status(405).end();
    }
    var rawPath = "/";
    try {
      rawPath = decodeURIComponent(req.path || "/");
    } catch (_e) {
      return res.status(400).send("Invalid game path");
    }
    if (
      rawPath.indexOf("..") !== -1 ||
      rawPath.indexOf("\\") !== -1 ||
      rawPath.indexOf("\0") !== -1
    ) {
      return res.status(400).send("Invalid game path");
    }

    var trimmed = rawPath.replace(/^\/+/, "");
    var lastSeg = trimmed.split("/").pop() || "";
    var qIndex = req.originalUrl.indexOf("?");
    var querySuffix = qIndex !== -1 ? req.originalUrl.slice(qIndex) : "";

    // Redirect bare folder paths (/mgg-games/slope -> /mgg-games/slope/) so relative assets resolve
    if (trimmed && rawPath.slice(-1) !== "/" && lastSeg.indexOf(".") === -1) {
      return res.redirect(302, "/mgg-games/" + trimmed + "/" + querySuffix);
    }

    var fileRel =
      !trimmed || rawPath.slice(-1) === "/" ? trimmed + "index.html" : trimmed;
    var encodedRel = fileRel
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");

    var rangeHeader = req.headers.range || "";

    function pipeUpstreamResponse(upRes) {
      var meta = resolveMggMimeAndEncoding(fileRel);
      var statusCode = upRes.statusCode === 206 ? 206 : 200;
      res.status(statusCode);
      res.setHeader("Content-Type", meta.contentType);
      if (meta.contentEncoding) {
        res.setHeader("Content-Encoding", meta.contentEncoding);
      }
      if (upRes.headers["content-length"]) {
        res.setHeader("Content-Length", upRes.headers["content-length"]);
      }
      if (upRes.headers["content-range"]) {
        res.setHeader("Content-Range", upRes.headers["content-range"]);
      }
      if (upRes.headers["accept-ranges"]) {
        res.setHeader("Accept-Ranges", upRes.headers["accept-ranges"]);
      }
      res.setHeader(
        "Cache-Control",
        /\.html?$/i.test(fileRel)
          ? "public, max-age=600"
          : "public, max-age=86400"
      );
      if (req.method === "HEAD") {
        upRes.resume();
        return res.end();
      }
      upRes.pipe(res);
    }

    fetchMggAcrossTiers(
      encodedRel,
      rangeHeader,
      function (err, upRes, statusCode) {
        if (!err && upRes) {
          return pipeUpstreamResponse(upRes);
        }
        // If a dotted folder slug (e.g. /mgg-games/paper.io) omitted trailing slash, check index.html
        if (
          statusCode === 404 &&
          rawPath.slice(-1) !== "/" &&
          !/\/index\.html$/i.test(fileRel)
        ) {
          return fetchMggAcrossTiers(
            encodedRel + "/index.html",
            "",
            function (errIdx, idxRes) {
              if (idxRes) idxRes.resume();
              if (!errIdx && idxRes) {
                return res.redirect(
                  302,
                  "/mgg-games/" + trimmed + "/" + querySuffix
                );
              }
              res.status(404).send("Game asset not found.");
            }
          );
        }
        res
          .status(statusCode === 404 ? 404 : 502)
          .send(
            statusCode === 404
              ? "Game asset not found."
              : "Unable to load game mirror asset."
          );
      }
    );
  });

  // Bootstrap fallback if a /scramjet/* URL reaches the server before the Service Worker activates
  app.use("/scramjet", function (req, res) {
    res
      .status(200)
      .type("html")
      .send(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Initializing Scramjet...</title>' +
          "<style>body{margin:0;background:#0b0f19;color:#94a3b8;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}</style>" +
          "</head><body><div>Starting Scramjet Service Worker...</div><script>" +
          "if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js',{scope:'/'}).then(function(){return navigator.serviceWorker.ready;}).then(function(){location.reload();}).catch(function(){location.replace('/');});}else{location.replace('/');}" +
          "</script></body></html>"
      );
  });

  app.use(unblocker);

  // Serve browser shell UI at / (with Brotli/Gzip compression when accepted)
  var rootCompressedMiddleware = createCompressedStaticMiddleware(
    publicDir,
    "no-cache"
  );
  app.get("/", function (req, res, next) {
    var origUrl = req.url;
    req.url = "/index.html";
    rootCompressedMiddleware(req, res, function () {
      req.url = origUrl;
      res.sendFile(path.join(publicDir, "index.html"), function (err) {
        if (err) next(err);
      });
    });
  });

  app.get("/favicon.ico", function (req, res) {
    res.status(204).end();
  });

  // Friendly fallback for unmatched routes
  app.use(function (req, res) {
    res.status(404).send("Error 404: Resource not found.");
  });

  // Error handler for upstream network / DNS failures
  // eslint-disable-next-line no-unused-vars
  app.use(function (err, req, res, next) {
    if (res.headersSent) {
      return;
    }
    var message = (err && err.message) || "Unable to reach target website.";
    var code = (err && err.code) || "PROXY_ERROR";
    res
      .status(502)
      .type("html")
      .send(
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Connection Error</title>' +
          "<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0b0f19;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}" +
          ".card{max-width:480px;width:100%;background:#131a2b;border:1px solid #1e293b;border-radius:16px;padding:28px;box-shadow:0 20px 40px rgba(0,0,0,.4)}" +
          "h1{margin:0 0 10px;font-size:20px;color:#f8fafc}p{margin:0 0 16px;color:#94a3b8;line-height:1.5;font-size:14px}" +
          "code{display:block;background:#090d16;border:1px solid #1e293b;padding:10px 12px;border-radius:8px;color:#f87171;font-size:12px;word-break:break-all;margin-bottom:18px}" +
          "button{background:#6366f1;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:600;cursor:pointer;font-size:13px}button:hover{background:#4f46e5}</style></head>" +
          '<body><div class="card"><h1>Couldn\'t reach that site</h1>' +
          "<p>The proxy server could not establish a connection to the target host. Check the domain name or try again in a moment.</p>" +
          "<code>" +
          String(code + ": " + message)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;") +
          "</code>" +
          '<button onclick="location.reload()">Retry</button></div></body></html>'
      );
  });

  if (options.wispAllowLoopback) {
    wispPkg.server.options.allow_loopback_ips = true;
    wispPkg.server.options.allow_private_ips = true;
  }

  function onUpgrade(req, socket, head) {
    if (socket && typeof socket.setNoDelay === "function") {
      socket.setNoDelay(true);
    }
    if (socket && typeof socket.setKeepAlive === "function") {
      socket.setKeepAlive(true, 30000);
    }
    var clientIp = adminMgr.getClientIp(req);
    if (!getAdminFromReq(req) && adminMgr.findActiveBan(clientIp)) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    if (!isAuthenticated(req)) {
      socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return;
    }
    if (adminMgr.isLockdownActive() && !getAdminFromReq(req)) {
      socket.end("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      return;
    }
    if (
      req.url &&
      (req.url === "/wisp" ||
        req.url.indexOf("/wisp/") === 0 ||
        req.url.indexOf("/wisp?") === 0)
    ) {
      // Strip permessage-deflate so encrypted binary WISP frames are never double-compressed
      if (req.headers && req.headers["sec-websocket-extensions"]) {
        delete req.headers["sec-websocket-extensions"];
      }
      var qIdx = req.url.indexOf("?");
      var pathname = qIdx === -1 ? req.url : req.url.substr(0, qIdx);
      if (pathname.charAt(pathname.length - 1) !== "/") {
        req.url = pathname + "/";
      } else {
        req.url = pathname;
      }
      wispPkg.server.routeRequest(req, socket, head);
      return;
    }
    unblocker.onUpgrade(req, socket, head);
  }

  function attachUpgrade(server) {
    server.on("upgrade", onUpgrade);
    return server;
  }

  return {
    app: app,
    unblocker: unblocker,
    adminManager: adminMgr,
    dnsCache: sharedDnsCache,
    onUpgrade: onUpgrade,
    attachUpgrade: attachUpgrade,
    signSession: signSession,
    verifySession: verifySession,
  };
}

module.exports = createApp;
