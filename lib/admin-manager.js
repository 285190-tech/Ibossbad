"use strict";

var crypto = require("crypto");
var https = require("https");
var http = require("http");

function sha256Hex(str) {
  return crypto.createHash("sha256").update(String(str)).digest("hex");
}

function safeEqual(a, b) {
  var bufA = crypto.createHash("sha256").update(String(a)).digest();
  var bufB = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(bufA, bufB);
}

function normalizeIp(rawIp) {
  if (!rawIp) return "127.0.0.1";
  var first = String(rawIp).split(",")[0].trim();
  if (first.indexOf("::ffff:") === 0) {
    return first.slice(7);
  }
  if (first === "::1") {
    return "127.0.0.1";
  }
  return first || "127.0.0.1";
}

function getClientIp(req) {
  var xff = req.headers && req.headers["x-forwarded-for"];
  if (xff) return normalizeIp(xff);
  var cf = req.headers && req.headers["cf-connecting-ip"];
  if (cf) return normalizeIp(cf);
  var xr = req.headers && req.headers["x-real-ip"];
  if (xr) return normalizeIp(xr);
  var sockIp =
    (req.socket && req.socket.remoteAddress) ||
    (req.connection && req.connection.remoteAddress) ||
    "127.0.0.1";
  return normalizeIp(sockIp);
}

function extractDomain(urlStr) {
  try {
    return new URL(urlStr).hostname.toLowerCase().replace(/^www\./, "");
  } catch (_e) {
    return "";
  }
}

function postJsonWebhook(webhookUrl, payload) {
  if (!webhookUrl || !/^https?:\/\//i.test(webhookUrl)) return;
  try {
    var parsed = new URL(webhookUrl);
    var client = parsed.protocol === "https:" ? https : http;
    var body = JSON.stringify(payload);
    var req = client.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 5000,
      },
      function (res) {
        res.resume();
      }
    );
    req.on("error", function () {});
    req.on("timeout", function () {
      req.destroy();
    });
    req.write(body);
    req.end();
  } catch (_e) {
    // ignore webhook errors
  }
}

function ipMatchesRule(clientIp, ruleIp) {
  if (!clientIp || !ruleIp) return false;
  var cleanRule = String(ruleIp).trim();
  if (cleanRule === clientIp) return true;
  if (cleanRule.slice(-1) === "*") {
    var prefix = cleanRule.slice(0, -1);
    return clientIp.indexOf(prefix) === 0;
  }
  // Simple IPv4 /24 or /16 CIDR support
  if (cleanRule.indexOf("/") !== -1 && clientIp.indexOf(".") !== -1) {
    var parts = cleanRule.split("/");
    var base = parts[0].split(".");
    var bits = parseInt(parts[1], 10);
    var target = clientIp.split(".");
    if (base.length === 4 && target.length === 4) {
      if (bits === 24) {
        return (
          base[0] === target[0] &&
          base[1] === target[1] &&
          base[2] === target[2]
        );
      }
      if (bits === 16) {
        return base[0] === target[0] && base[1] === target[1];
      }
      if (bits === 8) {
        return base[0] === target[0];
      }
    }
  }
  return false;
}

function createAdminManager(opts) {
  opts = opts || {};
  var adminPassword =
    opts.adminPassword !== undefined
      ? String(opts.adminPassword)
      : process.env.ADMIN_PASSWORD || "ibossadmin";

  var supabaseUrl = (opts.supabaseUrl || "").replace(/\/+$/, "");
  var supabaseAnonKey = opts.supabaseAnonKey || "";
  var jsonRequest = opts.jsonRequest;

  var state = {
    passcodeOverride: null, // null = use createApp initial passcode
    camouflageEnabled: false, // toggleable Study-App Front Door
    camouflageTrigger: "calculator", // typing passcode or Ctrl+Shift+U always works
    lockdownEnabled: false,
    lockdownMessage:
      "Server is temporarily in maintenance mode. Check back shortly.",
    banPageMessage:
      "Your IP address has been restricted by the instance administrator.",
    chatEnabled: true,
    rateLimitPerMin: 240,
    bruteForceMaxAttempts: 8,
    bruteForceBanMinutes: 15,
    whitelistMode: false,
    domainWhitelist: [
      "wikipedia.org",
      "duckduckgo.com",
      "neal.fun",
      "monkeygg2.github.io",
      "play2048.co",
    ],
    domainBlacklist: [],
    perTargetRules: {}, // key (ip or email/uid) -> { blockedDomains: [], rateLimit: 0, chatMuted: false }
    schedule: {
      enabled: false,
      startHour: 8,
      endHour: 15,
      action: "camouflage", // "camouflage" or "lockdown"
    },
    lootlabs: {
      enabled: false,
      linkUrl: "",
      durationHours: 12,
    },
    discordWebhookUrl: "",
    ipBans: [], // { ip, reason, createdAt, expiresAt, auto }
    accessKeys: [], // { code, label, durationHours, maxUses, uses, createdAt, expiresAt, revoked }
    inviteLinks: [], // { code, label, durationHours, maxUses, uses, createdAt, expiresAt, revoked }
    motd: {
      id: "motd-1",
      enabled: false,
      title: "Welcome to Ibossbad v4.0",
      body: "",
      updatedAt: 0,
    },
    activePoll: null, // { id, question, options: [{ id, label, votes }], voters: {}, createdAt, closed }
    roles: {}, // emailOrUidLower -> "VIP" | "MOD" | "ADMIN"
    customGames: [], // { title, url, category, aliases, addedBy, createdAt }
    chatMessages: [], // { id, author, role, text, ip, createdAt }
    gameRequests: [], // { id, title, url, kind, notes, submittedBy, ip, status, createdAt }
    revokedSessionIds: {}, // sid -> timestamp
    broadcast: null, // { id, text, level, createdAt, expiresAt }
    massCloakEpoch: 0,
  };

  var accessLogs = []; // newest first, max 1500
  var activeSessions = {}; // sid -> { sid, uid, email, mode, role, ip, ua, currentUrl, engine, createdAt, lastSeen, expiresAt, frozen: null, queue: [] }
  var rateBuckets = {}; // ip -> { windowStart, count }
  var failedAuthBuckets = {}; // ip -> { firstAt, count }
  var minuteTrafficBuckets = {}; // minuteEpoch -> count
  var totalRequestsServed = 0;

  function sendDiscordAlert(title, description, color) {
    if (!state.discordWebhookUrl) return;
    postJsonWebhook(state.discordWebhookUrl, {
      embeds: [
        {
          title: "Ibossbad Admin · " + title,
          description: String(description || "").slice(0, 1800),
          color: color || 3447003,
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }

  function exportableState() {
    return {
      passcodeOverride: state.passcodeOverride,
      camouflageEnabled: state.camouflageEnabled,
      lockdownEnabled: state.lockdownEnabled,
      lockdownMessage: state.lockdownMessage,
      banPageMessage: state.banPageMessage,
      chatEnabled: state.chatEnabled,
      rateLimitPerMin: state.rateLimitPerMin,
      bruteForceMaxAttempts: state.bruteForceMaxAttempts,
      bruteForceBanMinutes: state.bruteForceBanMinutes,
      whitelistMode: state.whitelistMode,
      domainWhitelist: state.domainWhitelist,
      domainBlacklist: state.domainBlacklist,
      perTargetRules: state.perTargetRules,
      schedule: state.schedule,
      lootlabs: state.lootlabs,
      discordWebhookUrl: state.discordWebhookUrl,
      ipBans: state.ipBans,
      accessKeys: state.accessKeys,
      inviteLinks: state.inviteLinks,
      motd: state.motd,
      activePoll: state.activePoll,
      roles: state.roles,
      customGames: state.customGames,
      chatMessages: state.chatMessages.slice(-150),
      gameRequests: state.gameRequests.slice(0, 200),
      broadcast: state.broadcast,
    };
  }

  function importPersistedState(incoming) {
    if (!incoming || typeof incoming !== "object") return;
    var keys = [
      "passcodeOverride",
      "camouflageEnabled",
      "lockdownEnabled",
      "lockdownMessage",
      "banPageMessage",
      "chatEnabled",
      "rateLimitPerMin",
      "bruteForceMaxAttempts",
      "bruteForceBanMinutes",
      "whitelistMode",
      "domainWhitelist",
      "domainBlacklist",
      "perTargetRules",
      "schedule",
      "lootlabs",
      "discordWebhookUrl",
      "ipBans",
      "accessKeys",
      "inviteLinks",
      "motd",
      "activePoll",
      "roles",
      "customGames",
      "chatMessages",
      "gameRequests",
      "broadcast",
    ];
    keys.forEach(function (k) {
      if (incoming[k] !== undefined) {
        state[k] = incoming[k];
      }
    });
  }

  function persistToSupabase(cb) {
    if (!jsonRequest || !supabaseUrl || !supabaseAnonKey) {
      if (cb) cb(null, { synced: false, fallbackDirect: true });
      return;
    }
    jsonRequest(
      supabaseUrl + "/rest/v1/rpc/ibossbad_admin_save",
      {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: "Bearer " + supabaseAnonKey,
        },
        body: {
          p_secret: adminPassword,
          p_state: exportableState(),
        },
      },
      function (err, resp) {
        if (err || !resp || resp.status >= 400) {
          if (cb) cb(null, { synced: false, fallbackDirect: true });
          return;
        }
        if (cb) cb(null, { synced: true });
      }
    );
  }

  function loadFromSupabase(cb) {
    if (!jsonRequest || !supabaseUrl || !supabaseAnonKey) {
      if (cb) cb(null, false);
      return;
    }
    jsonRequest(
      supabaseUrl + "/rest/v1/rpc/ibossbad_admin_load",
      {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: "Bearer " + supabaseAnonKey,
        },
        body: { p_secret: adminPassword },
      },
      function (err, resp) {
        if (err || !resp || resp.status >= 400 || !resp.data) {
          if (cb) cb(null, false);
          return;
        }
        if (resp.data.state && Object.keys(resp.data.state).length) {
          importPersistedState(resp.data.state);
        }
        if (Array.isArray(resp.data.logs) && resp.data.logs.length) {
          accessLogs = resp.data.logs.map(function (r) {
            return {
              id: r.id,
              ip: r.ip,
              userLabel: r.user_label,
              userMode: r.user_mode,
              engine: r.engine,
              url: r.target_url,
              domain: r.domain,
              ts: new Date(r.created_at).getTime() || Date.now(),
            };
          });
        }
        if (cb) cb(null, true);
      }
    );
  }

  function verifyAdminPassword(candidate) {
    if (!candidate) return false;
    return safeEqual(candidate, adminPassword);
  }

  function rotateAdminPassword(oldPwd, newPwd, cb) {
    if (!verifyAdminPassword(oldPwd)) {
      return cb(new Error("Current admin password is incorrect."));
    }
    if (!newPwd || String(newPwd).length < 4) {
      return cb(new Error("New admin password must be at least 4 characters."));
    }
    var prev = adminPassword;
    adminPassword = String(newPwd);
    if (jsonRequest && supabaseUrl && supabaseAnonKey) {
      jsonRequest(
        supabaseUrl + "/rest/v1/rpc/ibossbad_rotate_admin_secret",
        {
          method: "POST",
          headers: {
            apikey: supabaseAnonKey,
            Authorization: "Bearer " + supabaseAnonKey,
          },
          body: { p_old_secret: prev, p_new_secret: adminPassword },
        },
        function () {
          cb(null, true);
        }
      );
    } else {
      cb(null, true);
    }
  }

  function getEffectivePasscode(defaultPasscode) {
    if (
      state.passcodeOverride !== null &&
      state.passcodeOverride !== undefined
    ) {
      return state.passcodeOverride;
    }
    return defaultPasscode;
  }

  function getScheduleEffect() {
    var sch = state.schedule;
    if (!sch || !sch.enabled) return null;
    var hr = new Date().getHours();
    var inWindow =
      sch.startHour <= sch.endHour
        ? hr >= sch.startHour && hr < sch.endHour
        : hr >= sch.startHour || hr < sch.endHour;
    return inWindow ? sch.action : null;
  }

  function isCamouflageActive() {
    if (state.camouflageEnabled) return true;
    return getScheduleEffect() === "camouflage";
  }

  function isLockdownActive() {
    if (state.lockdownEnabled) return true;
    return getScheduleEffect() === "lockdown";
  }

  function getRoleForUser(session) {
    if (!session) return "USER";
    if (session.isAdmin) return "ADMIN";
    var emailKey = (session.email || "").toLowerCase();
    var uidKey = (session.uid || "").toLowerCase();
    if (emailKey && state.roles[emailKey]) return state.roles[emailKey];
    if (uidKey && state.roles[uidKey]) return state.roles[uidKey];
    return "USER";
  }

  function pruneExpiredBans() {
    var now = Date.now();
    state.ipBans = state.ipBans.filter(function (b) {
      return !b.expiresAt || b.expiresAt > now;
    });
  }

  function findActiveBan(ip) {
    pruneExpiredBans();
    for (var i = 0; i < state.ipBans.length; i++) {
      if (ipMatchesRule(ip, state.ipBans[i].ip)) {
        return state.ipBans[i];
      }
    }
    return null;
  }

  function banIp(ip, reason, durationMinutes, isAuto) {
    var clean = normalizeIp(ip);
    if (!clean) return null;
    state.ipBans = state.ipBans.filter(function (b) {
      return b.ip !== clean;
    });
    var expiresAt =
      durationMinutes && Number(durationMinutes) > 0
        ? Date.now() + Number(durationMinutes) * 60 * 1000
        : null;
    var entry = {
      ip: clean,
      reason: String(reason || "Policy violation").slice(0, 240),
      createdAt: Date.now(),
      expiresAt: expiresAt,
      auto: Boolean(isAuto),
    };
    state.ipBans.unshift(entry);

    // Revoke any active sessions belonging to that IP
    Object.keys(activeSessions).forEach(function (sid) {
      if (ipMatchesRule(activeSessions[sid].ip, clean)) {
        state.revokedSessionIds[sid] = Date.now();
        delete activeSessions[sid];
      }
    });

    persistToSupabase();
    return entry;
  }

  function unbanIp(ip) {
    var clean = String(ip || "").trim();
    var before = state.ipBans.length;
    state.ipBans = state.ipBans.filter(function (b) {
      return b.ip !== clean && b.ip !== normalizeIp(clean);
    });
    delete failedAuthBuckets[normalizeIp(clean)];
    if (state.ipBans.length !== before) {
      persistToSupabase();
      return true;
    }
    return false;
  }

  function recordFailedAuth(ip, contextLabel) {
    var clean = normalizeIp(ip);
    var now = Date.now();
    var b = failedAuthBuckets[clean];
    if (!b || now - b.firstAt > 10 * 60 * 1000) {
      b = { firstAt: now, count: 0 };
      failedAuthBuckets[clean] = b;
    }
    b.count++;
    var maxAllowed = Number(state.bruteForceMaxAttempts) || 8;
    if (maxAllowed > 0 && b.count >= maxAllowed) {
      var mins = Number(state.bruteForceBanMinutes) || 15;
      banIp(
        clean,
        "Auto-banned after " +
          b.count +
          " failed " +
          (contextLabel || "auth") +
          " attempts",
        mins,
        true
      );
      sendDiscordAlert(
        "Brute-Force Auto-Ban",
        "IP `" +
          clean +
          "` was temporarily banned for " +
          mins +
          "m after " +
          b.count +
          " failed " +
          (contextLabel || "login") +
          " attempts.",
        15158332
      );
      delete failedAuthBuckets[clean];
      return { autoBanned: true, minutes: mins };
    }
    return { autoBanned: false, attempts: b.count };
  }

  function clearFailedAuth(ip) {
    delete failedAuthBuckets[normalizeIp(ip)];
  }

  function checkRateLimit(ip, session) {
    var role = getRoleForUser(session);
    if (role === "ADMIN" || role === "VIP") {
      return { allowed: true };
    }
    var clean = normalizeIp(ip);
    var customRule = state.perTargetRules[clean];
    var limit =
      (customRule && Number(customRule.rateLimit)) ||
      Number(state.rateLimitPerMin) ||
      240;
    if (limit <= 0) return { allowed: true };

    var now = Date.now();
    var bucket = rateBuckets[clean];
    if (!bucket || now - bucket.windowStart > 60000) {
      bucket = { windowStart: now, count: 0 };
      rateBuckets[clean] = bucket;
    }
    bucket.count++;
    if (bucket.count > limit) {
      return { allowed: false, retryAfterSec: 30 };
    }
    return { allowed: true };
  }

  function validateAccessCodeOrKey(submitted, defaultPasscode) {
    var val = String(submitted || "").trim();
    if (!val) return { ok: false };

    var activePass = getEffectivePasscode(defaultPasscode);
    if (activePass && safeEqual(val, activePass)) {
      return { ok: true, mode: "passcode", expiresAt: null, keyCode: null };
    }

    var now = Date.now();
    for (var i = 0; i < state.accessKeys.length; i++) {
      var k = state.accessKeys[i];
      if (k.revoked) continue;
      if (k.expiresAt && now > k.expiresAt) continue;
      if (k.maxUses > 0 && k.uses >= k.maxUses) continue;
      if (safeEqual(val.toUpperCase(), String(k.code).toUpperCase())) {
        k.uses = (k.uses || 0) + 1;
        var keyExp =
          k.expiresAt || now + (Number(k.durationHours) || 12) * 60 * 60 * 1000;
        if (!k.expiresAt) {
          k.expiresAt = keyExp;
        }
        persistToSupabase();
        return {
          ok: true,
          mode: "temp_key",
          expiresAt: keyExp,
          keyCode: k.code,
        };
      }
    }
    return { ok: false };
  }

  function generateAccessKey(options) {
    options = options || {};
    var hours = Math.max(1, Number(options.durationHours) || 12);
    var maxUses = Math.max(1, Number(options.maxUses) || 1);
    var raw = crypto.randomBytes(5).toString("hex").toUpperCase();
    var code =
      "IBOSS-" + raw.slice(0, 4) + "-" + raw.slice(4, 8) + "-" + hours + "H";
    var entry = {
      code: code,
      label: String(options.label || hours + "h Access Key").slice(0, 80),
      durationHours: hours,
      maxUses: maxUses,
      uses: 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + hours * 60 * 60 * 1000,
      revoked: false,
    };
    state.accessKeys.unshift(entry);
    persistToSupabase();
    return entry;
  }

  function revokeAccessKey(code) {
    var found = false;
    state.accessKeys.forEach(function (k) {
      if (k.code === code) {
        k.revoked = true;
        found = true;
      }
    });
    if (found) persistToSupabase();
    return found;
  }

  function checkDomainAllowed(targetUrl, ip, session) {
    var domain = extractDomain(targetUrl);
    if (!domain) return { allowed: true };

    var role = getRoleForUser(session);
    if (role === "ADMIN") return { allowed: true };

    function matchesList(list) {
      if (!Array.isArray(list)) return false;
      for (var i = 0; i < list.length; i++) {
        var d = String(list[i] || "")
          .toLowerCase()
          .trim()
          .replace(/^www\./, "");
        if (d && (domain === d || domain.endsWith("." + d))) {
          return true;
        }
      }
      return false;
    }

    if (state.whitelistMode && !matchesList(state.domainWhitelist)) {
      return {
        allowed: false,
        reason:
          "Whitelist-only mode is active: " +
          domain +
          " is not on the approved list.",
      };
    }

    if (matchesList(state.domainBlacklist)) {
      return {
        allowed: false,
        reason: domain + " has been blocked by the instance administrator.",
      };
    }

    var cleanIp = normalizeIp(ip);
    var ipRule = state.perTargetRules[cleanIp];
    if (ipRule && matchesList(ipRule.blockedDomains)) {
      return {
        allowed: false,
        reason: domain + " is restricted for your connection.",
      };
    }

    var emailKey = session && session.email ? session.email.toLowerCase() : "";
    var userRule = emailKey ? state.perTargetRules[emailKey] : null;
    if (userRule && matchesList(userRule.blockedDomains)) {
      return {
        allowed: false,
        reason: domain + " is restricted for your account.",
      };
    }

    return { allowed: true };
  }

  function recordTrafficTick() {
    totalRequestsServed++;
    var minuteKey = Math.floor(Date.now() / 60000);
    minuteTrafficBuckets[minuteKey] =
      (minuteTrafficBuckets[minuteKey] || 0) + 1;
    // Prune older than 30 mins
    Object.keys(minuteTrafficBuckets).forEach(function (mk) {
      if (Number(mk) < minuteKey - 30) {
        delete minuteTrafficBuckets[mk];
      }
    });
  }

  function logVisit(info) {
    recordTrafficTick();
    if (!info || !info.url) return;
    var urlStr = String(info.url).slice(0, 1024);
    if (urlStr.indexOf("iboss://") === 0 || urlStr.indexOf("blob:") === 0) {
      return;
    }
    var domain = extractDomain(urlStr);
    var cleanIp = normalizeIp(info.ip);
    var userLabel =
      (info.session && (info.session.email || info.session.uid)) ||
      "passcode-user";
    var userMode = (info.session && info.session.mode) || "passcode";
    var engine = String(info.engine || "scramjet").slice(0, 24);

    // Deduplicate identical consecutive log within 3 seconds from same IP
    var head = accessLogs[0];
    var now = Date.now();
    if (
      head &&
      head.ip === cleanIp &&
      head.url === urlStr &&
      now - head.ts < 3000
    ) {
      return;
    }

    var entry = {
      id: now + "-" + Math.random().toString(36).slice(2, 6),
      ip: cleanIp,
      userLabel: userLabel,
      userMode: userMode,
      engine: engine,
      url: urlStr,
      domain: domain,
      ts: now,
    };
    accessLogs.unshift(entry);
    if (accessLogs.length > 1500) {
      accessLogs.pop();
    }

    if (jsonRequest && supabaseUrl && supabaseAnonKey) {
      jsonRequest(
        supabaseUrl + "/rest/v1/rpc/ibossbad_append_access_log",
        {
          method: "POST",
          headers: {
            apikey: supabaseAnonKey,
            Authorization: "Bearer " + supabaseAnonKey,
          },
          body: {
            p_secret: adminPassword,
            p_ip: cleanIp,
            p_user_label: userLabel,
            p_user_mode: userMode,
            p_engine: engine,
            p_target_url: urlStr,
            p_domain: domain,
          },
        },
        function () {}
      );
    }
  }

  function clearLogs(cb) {
    accessLogs = [];
    if (jsonRequest && supabaseUrl && supabaseAnonKey) {
      jsonRequest(
        supabaseUrl + "/rest/v1/rpc/ibossbad_clear_access_logs",
        {
          method: "POST",
          headers: {
            apikey: supabaseAnonKey,
            Authorization: "Bearer " + supabaseAnonKey,
          },
          body: { p_secret: adminPassword },
        },
        function () {
          if (cb) cb();
        }
      );
    } else if (cb) {
      cb();
    }
  }

  function isSessionRevoked(session) {
    if (!session) return false;
    if (session.sid && state.revokedSessionIds[session.sid]) {
      return true;
    }
    return false;
  }

  function touchPresence(session, ip, ua, payload) {
    if (!session || !session.sid) return null;
    var now = Date.now();
    var existing = activeSessions[session.sid];
    var role = getRoleForUser(session);
    if (!existing) {
      existing = {
        sid: session.sid,
        uid: session.uid,
        email: session.email || null,
        mode: session.mode || "passcode",
        role: role,
        ip: normalizeIp(ip),
        ua: String(ua || "").slice(0, 140),
        currentUrl: "",
        tabCount: 1,
        engine: "scramjet",
        createdAt: now,
        lastSeen: now,
        expiresAt: session.exp || null,
        frozen: null,
        queue: [],
      };
      activeSessions[session.sid] = existing;
    } else {
      existing.ip = normalizeIp(ip);
      existing.lastSeen = now;
      existing.role = role;
      if (session.email) existing.email = session.email;
    }

    if (payload && typeof payload === "object") {
      var navUrl =
        payload.currentUrl !== undefined ? payload.currentUrl : payload.url;
      if (navUrl !== undefined) {
        existing.currentUrl = String(navUrl || "").slice(0, 500);
      }
      if (payload.engine) {
        existing.engine = String(payload.engine).slice(0, 24);
      }
      if (payload.tabCount !== undefined) {
        existing.tabCount = Math.max(1, Number(payload.tabCount) || 1);
      }
    }

    var commands = existing.queue.splice(0, existing.queue.length);
    var activeBroadcast =
      state.broadcast &&
      (!state.broadcast.expiresAt || state.broadcast.expiresAt > now)
        ? state.broadcast
        : null;

    return {
      role: existing.role,
      expiresAt: existing.expiresAt,
      keySession: session.mode === "temp_key" || session.mode === "key",
      frozen: existing.frozen,
      freezeMessage: existing.frozen ? existing.frozen.message : "",
      commands: commands,
      broadcast: activeBroadcast,
      massCloakEpoch: state.massCloakEpoch,
      chatEnabled: state.chatEnabled,
    };
  }

  function pruneStaleSessions() {
    var cutoff = Date.now() - 5 * 60 * 1000;
    Object.keys(activeSessions).forEach(function (sid) {
      if (activeSessions[sid].lastSeen < cutoff) {
        delete activeSessions[sid];
      }
    });
  }

  function performSessionAction(targetSid, action, data) {
    if (targetSid === "ALL") {
      Object.keys(activeSessions).forEach(function (sid) {
        performSessionAction(sid, action, data);
      });
      return true;
    }
    var sess = activeSessions[targetSid];
    if (action === "kick") {
      state.revokedSessionIds[targetSid] = Date.now();
      if (sess) {
        sess.queue.push({ type: "kick" });
        delete activeSessions[targetSid];
      }
      return true;
    }
    if (!sess) return false;

    if (action === "redirect") {
      var rUrl = String((data && data.url) || "https://classroom.google.com");
      sess.queue.push({
        type: "redirect",
        url: rUrl,
        data: { url: rUrl },
        wholeWindow: Boolean(data && data.wholeWindow),
      });
      return true;
    }
    if (action === "popup") {
      var pMsg = String((data && data.message) || "").slice(0, 600);
      sess.queue.push({
        type: "popup",
        title: String((data && data.title) || "Message from Admin").slice(
          0,
          80
        ),
        message: pMsg,
        data: { message: pMsg },
      });
      return true;
    }
    if (action === "freeze") {
      sess.frozen = {
        active: true,
        message: String(
          (data && data.message) ||
            "Your session has been paused by the administrator."
        ).slice(0, 300),
      };
      return true;
    }
    if (action === "unfreeze") {
      sess.frozen = null;
      return true;
    }
    if (action === "cloak") {
      sess.queue.push({ type: "cloak" });
      return true;
    }
    return false;
  }

  function triggerMassCloak() {
    state.massCloakEpoch = Date.now();
    Object.keys(activeSessions).forEach(function (sid) {
      activeSessions[sid].queue.push({ type: "cloak" });
    });
    return state.massCloakEpoch;
  }

  function setBroadcast(text, level, durationMinutes) {
    if (!text || !String(text).trim()) {
      state.broadcast = null;
      persistToSupabase();
      return null;
    }
    var mins = Math.max(1, Number(durationMinutes) || 30);
    state.broadcast = {
      id: "bc-" + Date.now(),
      text: String(text).trim().slice(0, 400),
      level: level || "info",
      createdAt: Date.now(),
      expiresAt: Date.now() + mins * 60 * 1000,
    };
    persistToSupabase();
    return state.broadcast;
  }

  function postChatMessage(session, ip, text, isAdminOverride) {
    if (!state.chatEnabled && !isAdminOverride) {
      return { ok: false, error: "Instance chat is currently disabled." };
    }
    var cleanText = String(text || "")
      .trim()
      .slice(0, 360);
    if (!cleanText) {
      return { ok: false, error: "Message cannot be empty." };
    }
    var cleanIp = normalizeIp(ip);
    var ipRule = state.perTargetRules[cleanIp];
    var emailKey = session && session.email ? session.email.toLowerCase() : "";
    var userRule = emailKey ? state.perTargetRules[emailKey] : null;
    if (
      !isAdminOverride &&
      ((ipRule && ipRule.chatMuted) || (userRule && userRule.chatMuted))
    ) {
      return { ok: false, error: "You are muted in instance chat." };
    }

    var role = isAdminOverride ? "ADMIN" : getRoleForUser(session);
    var author = isAdminOverride
      ? "Admin"
      : session && session.email
      ? session.email.split("@")[0]
      : "User-" + cleanIp.split(".").pop();

    var msg = {
      id: "msg-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
      author: author,
      role: role,
      text: cleanText,
      ip: cleanIp,
      createdAt: Date.now(),
    };
    state.chatMessages.push(msg);
    if (state.chatMessages.length > 150) {
      state.chatMessages.splice(0, state.chatMessages.length - 150);
    }
    persistToSupabase();
    return { ok: true, message: msg };
  }

  function deleteChatMessage(msgId) {
    var before = state.chatMessages.length;
    state.chatMessages = state.chatMessages.filter(function (m) {
      return m.id !== msgId;
    });
    if (state.chatMessages.length !== before) {
      persistToSupabase();
      return true;
    }
    return false;
  }

  function clearChat() {
    state.chatMessages = [];
    persistToSupabase();
  }

  function submitGameRequest(session, ip, body) {
    var title = String((body && body.title) || "")
      .trim()
      .slice(0, 100);
    var url = String((body && body.url) || "")
      .trim()
      .slice(0, 500);
    var kind = body && body.kind === "bug" ? "bug" : "game";
    var notes = String((body && body.notes) || "")
      .trim()
      .slice(0, 400);
    if (!title) {
      return { ok: false, error: "Title is required." };
    }
    var item = {
      id: "req-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
      title: title,
      url: url,
      kind: kind,
      notes: notes,
      submittedBy:
        (session && (session.email || session.uid)) || "passcode-user",
      ip: normalizeIp(ip),
      status: "open",
      createdAt: Date.now(),
    };
    state.gameRequests.unshift(item);
    if (state.gameRequests.length > 200) {
      state.gameRequests.pop();
    }
    persistToSupabase();
    sendDiscordAlert(
      kind === "bug" ? "Broken Site Report" : "New Game Request",
      "**" +
        title +
        "**\nURL: " +
        (url || "N/A") +
        "\nNotes: " +
        (notes || "None") +
        "\nFrom: `" +
        item.submittedBy +
        "` (`" +
        item.ip +
        "`)",
      5763719
    );
    return { ok: true, request: item };
  }

  function resolveGameRequest(reqId, action, category) {
    var target = null;
    for (var i = 0; i < state.gameRequests.length; i++) {
      if (state.gameRequests[i].id === reqId) {
        target = state.gameRequests[i];
        break;
      }
    }
    if (!target) return { ok: false, error: "Request not found." };

    if (
      action === "approve" &&
      target.url &&
      /^https?:\/\//i.test(target.url)
    ) {
      target.status = "approved";
      state.customGames.unshift({
        title: target.title,
        url: target.url,
        category: category || "community",
        aliases: [],
        addedBy: "admin",
        createdAt: Date.now(),
      });
    } else if (action === "dismiss") {
      target.status = "dismissed";
    } else if (action === "delete") {
      state.gameRequests = state.gameRequests.filter(function (r) {
        return r.id !== reqId;
      });
    }
    persistToSupabase();
    return { ok: true };
  }

  function getAnalyticsSnapshot(defaultPasscode) {
    pruneStaleSessions();
    pruneExpiredBans();

    var nowMin = Math.floor(Date.now() / 60000);
    var chartSeries = [];
    for (var m = 14; m >= 0; m--) {
      var mk = nowMin - m;
      chartSeries.push({
        minuteOffset: -m,
        requests: minuteTrafficBuckets[mk] || 0,
      });
    }

    var domainCounts = {};
    accessLogs.forEach(function (l) {
      if (!l.domain) return;
      domainCounts[l.domain] = (domainCounts[l.domain] || 0) + 1;
    });
    var topDomains = Object.keys(domainCounts)
      .map(function (d) {
        return { domain: d, count: domainCounts[d] };
      })
      .sort(function (a, b) {
        return b.count - a.count;
      })
      .slice(0, 15);

    var onlineList = Object.keys(activeSessions).map(function (sid) {
      var s = activeSessions[sid];
      return {
        sid: s.sid,
        uid: s.uid,
        email: s.email,
        mode: s.mode,
        role: s.role,
        ip: s.ip,
        ua: s.ua,
        currentUrl: s.currentUrl,
        tabCount: s.tabCount,
        engine: s.engine,
        createdAt: s.createdAt,
        lastSeen: s.lastSeen,
        expiresAt: s.expiresAt,
        frozen: s.frozen,
      };
    });

    var mem = process.memoryUsage();
    return {
      stats: {
        onlineCount: onlineList.length,
        totalRequests: totalRequestsServed,
        loggedVisits: accessLogs.length,
        activeBans: state.ipBans.length,
        activeKeys: state.accessKeys.filter(function (k) {
          return !k.revoked && (!k.expiresAt || k.expiresAt > Date.now());
        }).length,
        openRequests: state.gameRequests.filter(function (r) {
          return r.status === "open";
        }).length,
        uptimeSec: Math.floor(process.uptime()),
        rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      },
      config: {
        activePasscode: getEffectivePasscode(defaultPasscode),
        camouflageEnabled: state.camouflageEnabled,
        scheduleActiveEffect: getScheduleEffect(),
        lockdownEnabled: state.lockdownEnabled,
        lockdownMessage: state.lockdownMessage,
        banPageMessage: state.banPageMessage,
        chatEnabled: state.chatEnabled,
        rateLimitPerMin: state.rateLimitPerMin,
        bruteForceMaxAttempts: state.bruteForceMaxAttempts,
        bruteForceBanMinutes: state.bruteForceBanMinutes,
        whitelistMode: state.whitelistMode,
        domainWhitelist: state.domainWhitelist,
        domainBlacklist: state.domainBlacklist,
        perTargetRules: state.perTargetRules,
        schedule: state.schedule,
        lootlabs: state.lootlabs,
        discordWebhookUrl: state.discordWebhookUrl,
        broadcast: state.broadcast,
        motd: state.motd,
      },
      onlineUsers: onlineList,
      ipBans: state.ipBans,
      accessKeys: state.accessKeys.slice(0, 100),
      inviteLinks: (state.inviteLinks || []).slice(0, 100),
      activePoll: getPublicPoll(null),
      roles: state.roles,
      customGames: state.customGames,
      gameRequests: state.gameRequests.slice(0, 100),
      chatMessages: state.chatMessages.slice(-80),
      logs: accessLogs.slice(0, 300),
      topDomains: topDomains,
      chartSeries: chartSeries,
    };
  }

  function renderBlockedHtml(title, message, clientIp) {
    var safeTitle = String(title || "Access Restricted")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;");
    var safeMsg = String(message || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;");
    var safeIp = String(clientIp || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;");
    return (
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<title>" +
      safeTitle +
      "</title>" +
      "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#080c14;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px}" +
      ".box{max-width:480px;width:100%;background:#111827;border:1px solid #1f2937;border-radius:16px;padding:30px;box-shadow:0 24px 48px rgba(0,0,0,.5)}" +
      ".badge{display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(239,68,68,.15);color:#f87171;font-size:12px;font-weight:700;margin-bottom:14px}" +
      "h1{margin:0 0 10px;font-size:22px;color:#f8fafc}p{margin:0 0 14px;color:#94a3b8;line-height:1.55;font-size:14px}" +
      ".meta{font-family:monospace;font-size:12px;color:#64748b;border-top:1px solid #1f2937;padding-top:12px;margin-top:16px}</style></head>" +
      '<body><div class="box"><span class="badge">403 · ACCESS DENIED</span><h1>' +
      safeTitle +
      "</h1><p>" +
      safeMsg +
      '</p><div class="meta">Connection IP: ' +
      safeIp +
      "</div></div></body></html>"
    );
  }

  function createInviteLink(opts2) {
    opts2 = opts2 || {};
    var hours = Math.max(1, Number(opts2.durationHours) || 12);
    var maxUses = Math.max(1, Number(opts2.maxUses) || 5);
    var label = String(opts2.label || "Shareable Invite").slice(0, 60);
    var code = "INV-" + crypto.randomBytes(6).toString("hex").toUpperCase();
    var entry = {
      code: code,
      label: label,
      durationHours: hours,
      maxUses: maxUses,
      uses: 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + hours * 3600 * 1000,
      revoked: false,
    };
    if (!Array.isArray(state.inviteLinks)) state.inviteLinks = [];
    state.inviteLinks.unshift(entry);
    persistToSupabase();
    return entry;
  }

  function revokeInviteLink(code) {
    if (!Array.isArray(state.inviteLinks)) return false;
    for (var i = 0; i < state.inviteLinks.length; i++) {
      if (state.inviteLinks[i].code === code) {
        state.inviteLinks[i].revoked = true;
        persistToSupabase();
        return true;
      }
    }
    return false;
  }

  function redeemInviteLink(code) {
    var clean = String(code || "")
      .trim()
      .toUpperCase();
    if (!clean || !Array.isArray(state.inviteLinks)) {
      return { ok: false, error: "Invalid invite link." };
    }
    for (var i = 0; i < state.inviteLinks.length; i++) {
      var inv = state.inviteLinks[i];
      if (inv.code === clean) {
        if (inv.revoked) {
          return { ok: false, error: "This invite link has been revoked." };
        }
        if (inv.expiresAt && Date.now() > inv.expiresAt) {
          return { ok: false, error: "This invite link has expired." };
        }
        if (inv.uses >= inv.maxUses) {
          return {
            ok: false,
            error: "This invite link has reached its maximum uses.",
          };
        }
        inv.uses++;
        var sessionExp = Date.now() + inv.durationHours * 3600 * 1000;
        persistToSupabase();
        return {
          ok: true,
          code: inv.code,
          durationHours: inv.durationHours,
          expiresAt: sessionExp,
        };
      }
    }
    return { ok: false, error: "Invite link not found." };
  }

  function setMotd(motdObj) {
    motdObj = motdObj || {};
    var enabled = Boolean(motdObj.enabled);
    var title = String(motdObj.title || "Announcement")
      .trim()
      .slice(0, 100);
    var body = String(motdObj.body || "")
      .trim()
      .slice(0, 1500);
    state.motd = {
      id: "motd-" + Date.now(),
      enabled: enabled && Boolean(body),
      title: title,
      body: body,
      updatedAt: Date.now(),
    };
    persistToSupabase();
    return state.motd;
  }

  function createPoll(question, rawOptions) {
    var q = String(question || "")
      .trim()
      .slice(0, 160);
    var list = Array.isArray(rawOptions)
      ? rawOptions
          .map(function (o) {
            return String(o || "")
              .trim()
              .slice(0, 80);
          })
          .filter(Boolean)
      : [];
    if (!q || list.length < 2) {
      return { ok: false, error: "Poll requires a question and 2+ options." };
    }
    state.activePoll = {
      id: "poll-" + Date.now(),
      question: q,
      options: list.slice(0, 5).map(function (lbl, idx) {
        return { id: "opt-" + idx, label: lbl };
      }),
      voters: {},
      createdAt: Date.now(),
      closed: false,
    };
    persistToSupabase();
    return { ok: true, poll: getPublicPoll(null) };
  }

  function closePoll() {
    if (state.activePoll) {
      state.activePoll = null;
      persistToSupabase();
    }
    return true;
  }

  function getPublicPoll(voterKey) {
    var p = state.activePoll;
    if (!p || p.closed) return null;
    var counts = {};
    p.options.forEach(function (o) {
      counts[o.id] = 0;
    });
    var total = 0;
    var voters = p.voters || {};
    Object.keys(voters).forEach(function (vk) {
      var oid = voters[vk];
      if (counts[oid] !== undefined) {
        counts[oid]++;
        total++;
      }
    });
    return {
      id: p.id,
      question: p.question,
      totalVotes: total,
      myVote: voterKey && voters[voterKey] ? voters[voterKey] : null,
      options: p.options.map(function (o) {
        return {
          id: o.id,
          label: o.label,
          votes: counts[o.id] || 0,
        };
      }),
    };
  }

  function votePoll(optionId, voterKey) {
    if (!state.activePoll || state.activePoll.closed) {
      return { ok: false, error: "No active poll right now." };
    }
    var valid = state.activePoll.options.some(function (o) {
      return o.id === optionId;
    });
    if (!valid) {
      return { ok: false, error: "Invalid poll option." };
    }
    if (!state.activePoll.voters) state.activePoll.voters = {};
    state.activePoll.voters[String(voterKey || "anon")] = optionId;
    persistToSupabase();
    return { ok: true, poll: getPublicPoll(voterKey) };
  }

  return {
    state: state,
    sha256Hex: sha256Hex,
    getClientIp: getClientIp,
    extractDomain: extractDomain,
    verifyAdminPassword: verifyAdminPassword,
    rotateAdminPassword: rotateAdminPassword,
    getEffectivePasscode: getEffectivePasscode,
    isCamouflageActive: isCamouflageActive,
    isLockdownActive: isLockdownActive,
    getRoleForUser: getRoleForUser,
    findActiveBan: findActiveBan,
    banIp: banIp,
    unbanIp: unbanIp,
    recordFailedAuth: recordFailedAuth,
    clearFailedAuth: clearFailedAuth,
    checkRateLimit: checkRateLimit,
    validateAccessCodeOrKey: validateAccessCodeOrKey,
    generateAccessKey: generateAccessKey,
    revokeAccessKey: revokeAccessKey,
    createInviteLink: createInviteLink,
    revokeInviteLink: revokeInviteLink,
    redeemInviteLink: redeemInviteLink,
    setMotd: setMotd,
    createPoll: createPoll,
    closePoll: closePoll,
    votePoll: votePoll,
    getPublicPoll: getPublicPoll,
    checkDomainAllowed: checkDomainAllowed,
    recordTrafficTick: recordTrafficTick,
    logVisit: logVisit,
    clearLogs: clearLogs,
    getLogs: function () {
      return accessLogs;
    },
    isSessionRevoked: isSessionRevoked,
    touchPresence: touchPresence,
    performSessionAction: performSessionAction,
    triggerMassCloak: triggerMassCloak,
    setBroadcast: setBroadcast,
    postChatMessage: postChatMessage,
    deleteChatMessage: deleteChatMessage,
    clearChat: clearChat,
    submitGameRequest: submitGameRequest,
    resolveGameRequest: resolveGameRequest,
    getAnalyticsSnapshot: getAnalyticsSnapshot,
    exportableState: exportableState,
    importPersistedState: importPersistedState,
    persistToSupabase: persistToSupabase,
    loadFromSupabase: loadFromSupabase,
    sendDiscordAlert: sendDiscordAlert,
    renderBlockedHtml: renderBlockedHtml,
  };
}

module.exports = createAdminManager;
