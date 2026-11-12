"use strict";

var path = require("path");
var https = require("https");
var http = require("http");
var crypto = require("crypto");
var express = require("express");
var libCookie = require("cookie");
// eslint-disable-next-line node/no-missing-require
var wispPkg = require("@mercuryworkshop/wisp-js/server");
var Unblocker = require("./unblocker.js");

wispPkg.logging.set_level(wispPkg.logging.NONE);

var SESSION_COOKIE = "__ibossbad_session";
var SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
  } catch (err) {
    return null;
  }
}

function safeCompareStrings(a, b) {
  var bufA = crypto.createHash("sha256").update(String(a)).digest();
  var bufB = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(bufA, bufB);
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
  } catch (err) {
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
  var headers = Object.assign({}, options.headers || {});
  if (bodyStr) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(bodyStr);
  }

  var reqOpts = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || undefined,
    path: parsed.pathname + parsed.search,
    method: options.method || "GET",
    headers: headers,
    timeout: options.timeout || 6000,
  };

  var done = false;
  function finish(err, result) {
    if (done) return;
    done = true;
    callback(err, result);
  }

  var req = proto.request(reqOpts, function (res) {
    var chunks = [];
    res.on("data", function (c) {
      chunks.push(c);
    });
    res.on("end", function () {
      var raw = Buffer.concat(chunks).toString("utf8");
      var json = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch (e) {
        json = null;
      }
      finish(null, {
        status: res.statusCode,
        data: json,
        raw: raw,
      });
    });
  });

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

  var passcode = passcodeDisabled
    ? ""
    : options.passcode !== undefined
    ? String(options.passcode)
    : process.env.PROXY_PASSCODE !== undefined
    ? String(process.env.PROXY_PASSCODE)
    : "ibossbad";

  var sessionSecret =
    options.sessionSecret ||
    process.env.SESSION_SECRET ||
    "ibossbad-session-key-v1-" + (passcode || "supabase-only");

  var supabaseUrl = (
    options.supabaseUrl ||
    process.env.SUPABASE_URL ||
    DEFAULT_SUPABASE_URL
  ).replace(/\/+$/, "");

  var supabaseAnonKey =
    options.supabaseAnonKey ||
    process.env.SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_ANON_KEY;

  var app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);

  function getSessionFromReq(req) {
    var cookies = libCookie.parse((req.headers && req.headers.cookie) || "");
    return verifySession(cookies[SESSION_COOKIE], sessionSecret);
  }

  function isAuthenticated(req) {
    if (!authRequired) return true;
    return Boolean(getSessionFromReq(req));
  }

  function setSessionCookie(req, res, sessionData) {
    var payload = {
      uid: sessionData.uid,
      email: sessionData.email || null,
      mode: sessionData.mode,
      exp: Date.now() + SESSION_TTL_MS,
    };
    var signed = signSession(payload, sessionSecret);
    var isHttps =
      req.protocol === "https" ||
      (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
    var serialized = libCookie.serialize(SESSION_COOKIE, signed, {
      httpOnly: true,
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      sameSite: "lax",
      secure: isHttps,
    });
    res.setHeader("Set-Cookie", serialized);
    return payload;
  }

  function clearSessionCookies(res) {
    res.setHeader("Set-Cookie", [
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
    ]);
  }

  // Static UI assets & local WASM/AST vendor modules (mounted BEFORE unblocker)
  var publicDir = path.join(__dirname, "..", "public");
  var staticCacheAge = process.env.NODE_ENV === "production" ? "1h" : 0;
  app.use(
    "/ui",
    express.static(publicDir, {
      index: false,
      maxAge: staticCacheAge,
    })
  );
  app.use(
    "/vendor/libcurl",
    express.static(path.dirname(require.resolve("libcurl.js")), {
      index: false,
      maxAge: "7d",
    })
  );
  app.use(
    "/vendor/acorn",
    express.static(path.dirname(require.resolve("acorn")), {
      index: false,
      maxAge: "7d",
    })
  );
  app.use(
    "/vendor/acorn-walk",
    express.static(path.dirname(require.resolve("acorn-walk")), {
      index: false,
      maxAge: "7d",
    })
  );

  var apiRouter = express.Router();
  apiRouter.use(express.json({ limit: "256kb" }));

  apiRouter.get("/health", function (req, res) {
    res.json({
      ok: true,
      uptime: Math.floor(process.uptime()),
    });
  });

  apiRouter.get("/status", function (req, res) {
    var session = getSessionFromReq(req);
    res.json({
      authenticated: !authRequired || Boolean(session),
      authRequired: authRequired,
      passcodeEnabled: Boolean(passcode),
      prefix: prefix,
      wispPath: "/wisp/",
      user: session
        ? {
            id: session.uid,
            email: session.email,
            mode: session.mode,
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
    if (!passcode) {
      return res
        .status(403)
        .json({ ok: false, error: "Passcode login is disabled." });
    }
    var submitted = (req.body && req.body.passcode) || "";
    if (!submitted || !safeCompareStrings(submitted, passcode)) {
      return res
        .status(401)
        .json({ ok: false, error: "Incorrect passcode. Please try again." });
    }
    var session = setSessionCookie(req, res, {
      uid: "passcode-user",
      mode: "passcode",
    });
    return res.json({
      ok: true,
      user: {
        id: session.uid,
        email: null,
        mode: "passcode",
      },
    });
  });

  apiRouter.post("/auth/login", function (req, res) {
    var email = ((req.body && req.body.email) || "").trim();
    var password = (req.body && req.body.password) || "";
    if (!email || !password) {
      return res
        .status(400)
        .json({ ok: false, error: "Email and password are required." });
    }

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
        if (response.status >= 400 || !response.data || !response.data.user) {
          var errMsg =
            (response.data &&
              (response.data.error_description ||
                response.data.msg ||
                response.data.message)) ||
            "Invalid email or password.";
          return res.status(401).json({ ok: false, error: errMsg });
        }

        var supaUser = response.data.user;
        setSessionCookie(req, res, {
          uid: supaUser.id,
          email: supaUser.email,
          mode: "supabase",
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
            },
          },
        });
      }
    );
  });

  apiRouter.post("/auth/signup", function (req, res) {
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

        setSessionCookie(req, res, {
          uid: userObj.id,
          email: userObj.email,
          mode: "supabase",
        });

        return res.json({
          ok: true,
          session: {
            access_token: response.data.access_token || null,
            refresh_token: response.data.refresh_token || null,
            user: {
              id: userObj.id,
              email: userObj.email,
              mode: "supabase",
            },
          },
        });
      }
    );
  });

  apiRouter.post("/auth/token-session", function (req, res) {
    var accessToken = (req.body && req.body.access_token) || "";
    var claims = verifySupabaseJwtClaims(accessToken, supabaseUrl);
    if (!claims) {
      return res
        .status(401)
        .json({ ok: false, error: "Invalid or expired Supabase token." });
    }

    setSessionCookie(req, res, {
      uid: claims.sub,
      email: claims.email || null,
      mode: "supabase",
    });

    return res.json({
      ok: true,
      user: {
        id: claims.sub,
        email: claims.email || null,
        mode: "supabase",
      },
    });
  });

  apiRouter.post("/auth/logout", function (req, res) {
    clearSessionCookies(res);
    res.json({ ok: true });
  });

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
        "&select=bookmarks,settings,updated_at&limit=1",
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
          data: row || { bookmarks: [], settings: {} },
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

    var bookmarks = Array.isArray(req.body && req.body.bookmarks)
      ? req.body.bookmarks.slice(0, 100)
      : [];
    var settings =
      req.body && req.body.settings && typeof req.body.settings === "object"
        ? req.body.settings
        : {};

    jsonRequest(
      supabaseUrl + "/rest/v1/ibossbad_user_data?on_conflict=user_id",
      {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: "Bearer " + token,
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: {
          user_id: claims.sub,
          bookmarks: bookmarks,
          settings: settings,
          updated_at: new Date().toISOString(),
        },
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

  app.use("/api", apiRouter);

  // Enforce access gate before forwarding any proxy requests
  app.use(function (req, res, next) {
    var isProxyRoute =
      req.url === prefix.substr(0, prefix.length - 1) ||
      req.url.indexOf(prefix) === 0;

    // Also guard Referer-based root-relative asset recovery when unauthenticated
    var hasProxyReferer =
      req.headers.referer && req.headers.referer.indexOf(prefix) !== -1;

    if ((isProxyRoute || hasProxyReferer) && !isAuthenticated(req)) {
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
    next();
  });

  var strictSsl = process.env.PROXY_STRICT_SSL === "true";
  var defaultHttpAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 64,
  });
  var defaultHttpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 64,
    rejectUnauthorized: strictSsl,
  });

  var unblocker = new Unblocker({
    prefix: prefix,
    host: options.host || process.env.PROXY_HOST || null,
    httpAgent: options.httpAgent || defaultHttpAgent,
    httpsAgent: options.httpsAgent || defaultHttpsAgent,
    enableOriginCookie:
      options.enableOriginCookie !== undefined
        ? options.enableOriginCookie
        : true,
    ignorePaths: ["/api/", "/ui/", "/favicon.ico"],
    requestMiddleware: options.requestMiddleware || [],
    responseMiddleware: options.responseMiddleware || [],
  });

  app.use(unblocker);

  // Serve browser shell UI at /
  app.get("/", function (req, res) {
    res.sendFile(path.join(publicDir, "index.html"));
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
    if (!isAuthenticated(req)) {
      socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return;
    }
    if (
      req.url &&
      (req.url === "/wisp" ||
        req.url.indexOf("/wisp/") === 0 ||
        req.url.indexOf("/wisp?") === 0)
    ) {
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
    onUpgrade: onUpgrade,
    attachUpgrade: attachUpgrade,
    signSession: signSession,
    verifySession: verifySession,
  };
}

module.exports = createApp;
