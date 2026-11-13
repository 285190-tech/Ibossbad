"use strict";

(function (window) {
  function esc(str) {
    return String(str === undefined || str === null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtTime(ts) {
    if (!ts) return "Never";
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function createAdminPanel(hooks) {
    var activeTab = "overview";
    var logFilter = "";
    var cachedAdminSecret = "";
    var lastSnapshot = null;
    var clientIp = "";
    var activeContainer = null;

    async function syncDirectSupabaseIfNeeded(exportableState) {
      var supa = hooks.getSupabaseConfig ? hooks.getSupabaseConfig() : null;
      if (
        !supa ||
        !supa.url ||
        !supa.anonKey ||
        !cachedAdminSecret ||
        !exportableState
      ) {
        return;
      }
      try {
        await fetch(supa.url + "/rest/v1/rpc/ibossbad_admin_save", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supa.anonKey,
            Authorization: "Bearer " + supa.anonKey,
          },
          body: JSON.stringify({
            p_secret: cachedAdminSecret,
            p_state: exportableState,
          }),
        });
      } catch (_e) {}
    }

    async function apiAdmin(path, method, body) {
      var headers = { "Content-Type": "application/json" };
      if (cachedAdminSecret) {
        headers["X-Admin-Password"] = cachedAdminSecret;
      }
      var res = await fetch("/api/admin" + path, {
        method: method || "GET",
        headers: headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      var data = await res.json();
      if (res.ok && data && data.exportableState) {
        syncDirectSupabaseIfNeeded(data.exportableState);
      }
      return {
        ok: res.ok && data.ok !== false,
        status: res.status,
        data: data,
      };
    }

    function renderLoginPrompt(container) {
      container.innerHTML =
        '<div class="internal-wrap" style="max-width:460px;padding-top:48px">' +
        '<div class="internal-panel">' +
        '<div class="hero-badge" style="margin-bottom:12px"><span class="pulse-dot"></span><span>iboss://admin · Restricted</span></div>' +
        "<h2>Admin Command Center</h2>" +
        '<p class="settings-desc" style="margin-bottom:16px">Enter your <code>ADMIN_PASSWORD</code> to manage live connected users, IP bans, access history, 12h keys, roles &amp; site policies.</p>' +
        '<form id="adminLoginForm">' +
        '<label class="field-label" for="adminPwdInput">Admin Password</label>' +
        '<input id="adminPwdInput" type="password" class="field-input" placeholder="Enter Admin password..." required />' +
        '<div id="adminLoginErr" class="gate-alert hidden" style="margin-top:10px"></div>' +
        '<button type="submit" class="btn btn-primary btn-block" style="margin-top:14px">Unlock Admin Center</button>' +
        "</form></div></div>";

      container
        .querySelector("#adminLoginForm")
        .addEventListener("submit", async function (ev) {
          ev.preventDefault();
          var pwd = container.querySelector("#adminPwdInput").value;
          var errBox = container.querySelector("#adminLoginErr");
          errBox.classList.add("hidden");
          var r = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: pwd }),
          });
          var d = await r.json();
          if (!r.ok || !d.ok) {
            errBox.textContent = (d && d.error) || "Invalid Admin password.";
            errBox.classList.remove("hidden");
            return;
          }
          cachedAdminSecret = pwd;
          clientIp = d.clientIp || "";
          lastSnapshot = d.snapshot;

          // Pull persisted Supabase state if server was in sandboxed network mode
          var supa = hooks.getSupabaseConfig ? hooks.getSupabaseConfig() : null;
          if (supa && supa.url && supa.anonKey) {
            try {
              var loadRes = await fetch(
                supa.url + "/rest/v1/rpc/ibossbad_admin_load",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    apikey: supa.anonKey,
                    Authorization: "Bearer " + supa.anonKey,
                  },
                  body: JSON.stringify({ p_secret: pwd }),
                }
              );
              if (loadRes.ok) {
                var supaData = await loadRes.json();
                if (
                  supaData &&
                  supaData.state &&
                  Object.keys(supaData.state).length
                ) {
                  var imp = await apiAdmin("/import-state", "POST", {
                    state: supaData.state,
                  });
                  if (imp.ok && imp.data.snapshot) {
                    lastSnapshot = imp.data.snapshot;
                  }
                }
              }
            } catch (_e) {}
          }

          hooks.onAdminAuthenticated();
          renderDashboard(container);
        });
    }

    async function refreshSnapshot(container) {
      var res = await apiAdmin("/dashboard", "GET");
      if (!res.ok) {
        renderLoginPrompt(container);
        return;
      }
      clientIp = res.data.clientIp || clientIp;
      lastSnapshot = res.data.snapshot;
      renderDashboard(container);
    }

    function renderOverviewTab(s) {
      var maxReq = 1;
      (s.chartSeries || []).forEach(function (pt) {
        if (pt.requests > maxReq) maxReq = pt.requests;
      });

      return (
        '<div class="admin-stats-grid">' +
        '<div class="admin-stat-card"><span class="stat-k">Online Now</span><strong>' +
        s.stats.onlineCount +
        "</strong></div>" +
        '<div class="admin-stat-card"><span class="stat-k">Total Requests</span><strong>' +
        s.stats.totalRequests +
        "</strong></div>" +
        '<div class="admin-stat-card"><span class="stat-k">Logged Visits</span><strong>' +
        s.stats.loggedVisits +
        "</strong></div>" +
        '<div class="admin-stat-card"><span class="stat-k">Active IP Bans</span><strong>' +
        s.stats.activeBans +
        "</strong></div>" +
        '<div class="admin-stat-card"><span class="stat-k">Active Keys</span><strong>' +
        s.stats.activeKeys +
        "</strong></div>" +
        '<div class="admin-stat-card"><span class="stat-k">Memory / Uptime</span><strong>' +
        s.stats.rssMb +
        "MB · " +
        Math.floor(s.stats.uptimeSec / 60) +
        "m</strong></div>" +
        "</div>" +
        '<div class="internal-panel" style="margin-top:16px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">' +
        "<div><h3>Emergency &amp; Global Room Controls</h3>" +
        '<p class="settings-desc">Instant controls pushed to all connected browsers on their next heartbeat.</p></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="button" class="btn btn-danger" id="admMassCloakBtn">Teacher Walked In (Mass-Cloak All)</button>' +
        '<button type="button" class="btn btn-secondary" id="admToggleCamoBtn">Camouflage Door: ' +
        (s.config.camouflageEnabled ? "ON" : "OFF") +
        "</button>" +
        '<button type="button" class="btn btn-secondary" id="admToggleLockdownBtn">Lockdown: ' +
        (s.config.lockdownEnabled ? "ON" : "OFF") +
        "</button>" +
        '<button type="button" class="btn btn-secondary" id="admKickAllBtn">Kick All Sessions</button>' +
        "</div></div>" +
        '<div class="req-grid" style="margin-top:14px">' +
        '<input id="admBroadcastInput" type="text" class="field-input" placeholder="Broadcast banner to all active users..." value="' +
        esc((s.config.broadcast && s.config.broadcast.text) || "") +
        '" />' +
        '<select id="admBroadcastLevel" class="field-select"><option value="info">Info Banner</option><option value="warn">Warning Banner</option><option value="danger">Alert Banner</option></select>' +
        '<button type="button" class="btn btn-primary" id="admSendBroadcastBtn">Send Banner</button>' +
        '<button type="button" class="btn btn-ghost" id="admClearBroadcastBtn">Clear</button>' +
        "</div></div>" +
        '<div class="admin-two-col" style="margin-top:16px">' +
        '<div class="internal-panel"><h3>Requests / Min (Last 15m)</h3>' +
        '<div class="mini-bar-chart">' +
        (s.chartSeries || [])
          .map(function (pt) {
            var hPct = Math.max(6, Math.round((pt.requests / maxReq) * 100));
            return (
              '<div class="mini-bar-col" title="' +
              pt.requests +
              ' reqs"><div class="mini-bar-fill" style="height:' +
              hPct +
              '%"></div><span>' +
              pt.requests +
              "</span></div>"
            );
          })
          .join("") +
        "</div></div>" +
        '<div class="internal-panel"><h3>Top Visited Domains</h3>' +
        (s.topDomains.length === 0
          ? '<div class="empty-bookmarks">No site navigations logged yet.</div>'
          : s.topDomains
              .slice(0, 8)
              .map(function (d) {
                return (
                  '<div class="ext-row" style="padding:6px 10px">' +
                  "<span><strong>" +
                  esc(d.domain) +
                  '</strong> <span class="relay-mini-badge">' +
                  d.count +
                  "x</span></span>" +
                  '<button type="button" class="btn btn-danger btn-xs" data-block-dom="' +
                  esc(d.domain) +
                  '">Block</button></div>'
                );
              })
              .join("")) +
        "</div></div>" +
        '<div class="internal-panel" style="margin-top:16px">' +
        "<h3>Live Connected Users (" +
        s.onlineUsers.length +
        ")</h3>" +
        (s.onlineUsers.length === 0
          ? '<div class="empty-bookmarks">No active browser sessions right now.</div>'
          : '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>User / Role</th><th>IP</th><th>Current Open Site</th><th>Engine</th><th>Remote Actions</th></tr></thead><tbody>' +
            s.onlineUsers
              .map(function (u) {
                var who = u.email || u.uid || "passcode-user";
                return (
                  "<tr><td><strong>" +
                  esc(who) +
                  '</strong> <span class="relay-mini-badge">' +
                  esc(u.role) +
                  "</span>" +
                  (u.frozen
                    ? ' <span class="badge-frozen">FROZEN</span>'
                    : "") +
                  "</td><td><code>" +
                  esc(u.ip) +
                  "</code></td><td style='max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' title='" +
                  esc(u.currentUrl) +
                  "'>" +
                  esc(u.currentUrl || "New Tab") +
                  "</td><td>" +
                  esc(u.engine) +
                  '</td><td class="admin-act-cell">' +
                  '<button type="button" class="btn btn-secondary btn-xs" data-sess-act="redirect" data-sid="' +
                  esc(u.sid) +
                  '">Redirect</button>' +
                  '<button type="button" class="btn btn-secondary btn-xs" data-sess-act="' +
                  (u.frozen ? "unfreeze" : "freeze") +
                  '" data-sid="' +
                  esc(u.sid) +
                  '">' +
                  (u.frozen ? "Unfreeze" : "Freeze") +
                  "</button>" +
                  '<button type="button" class="btn btn-secondary btn-xs" data-sess-act="popup" data-sid="' +
                  esc(u.sid) +
                  '">DM</button>' +
                  '<button type="button" class="btn btn-secondary btn-xs" data-sess-act="cloak" data-sid="' +
                  esc(u.sid) +
                  '">Cloak</button>' +
                  '<button type="button" class="btn btn-danger btn-xs" data-sess-act="kick" data-sid="' +
                  esc(u.sid) +
                  '">Kick</button>' +
                  '<button type="button" class="btn btn-danger btn-xs" data-quick-ban="' +
                  esc(u.ip) +
                  '">Ban IP</button>' +
                  "</td></tr>"
                );
              })
              .join("") +
            "</tbody></table></div>") +
        "</div>"
      );
    }

    function renderLogsAndBansTab(s) {
      var q = logFilter.trim().toLowerCase();
      var filtered = (s.logs || []).filter(function (l) {
        if (!q) return true;
        return (
          String(l.ip || "")
            .toLowerCase()
            .indexOf(q) !== -1 ||
          String(l.userLabel || "")
            .toLowerCase()
            .indexOf(q) !== -1 ||
          String(l.url || "")
            .toLowerCase()
            .indexOf(q) !== -1
        );
      });

      return (
        '<div class="internal-panel" style="margin-bottom:16px">' +
        "<h3>IP Ban Moderation (Your IP: <code>" +
        esc(clientIp) +
        "</code>)</h3>" +
        '<div class="req-grid" style="margin-top:10px">' +
        '<input id="banIpInput" type="text" class="field-input" placeholder="IP or CIDR (e.g. 203.0.113.9 or 203.0.113.0/24)" />' +
        '<input id="banReasonInput" type="text" class="field-input" placeholder="Reason (shown on 403 screen)" />' +
        '<input id="banDurationInput" type="number" class="field-input" placeholder="Minutes (blank = permanent)" />' +
        '<button type="button" class="btn btn-danger" id="addBanBtn">Ban IP</button>' +
        "</div>" +
        '<div style="margin-top:12px">' +
        (s.ipBans.length === 0
          ? '<div class="empty-bookmarks">No IPs currently banned.</div>'
          : s.ipBans
              .map(function (b) {
                var expStr = b.expiresAt
                  ? "Expires " + fmtTime(b.expiresAt)
                  : "Permanent";
                return (
                  '<div class="ext-row"><div><code>' +
                  esc(b.ip) +
                  "</code> · <strong>" +
                  esc(b.reason) +
                  '</strong> <span class="relay-mini-badge">' +
                  esc(expStr) +
                  "</span></div>" +
                  '<button type="button" class="btn btn-secondary btn-xs" data-unban-ip="' +
                  esc(b.ip) +
                  '">Unban</button></div>'
                );
              })
              .join("")) +
        "</div></div>" +
        '<div class="internal-panel">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">' +
        "<h3>User Browsing &amp; IP Access History (" +
        filtered.length +
        ")</h3>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<a class="btn btn-secondary btn-xs" href="/api/admin/export?format=csv" target="_blank">Export CSV</a>' +
        '<a class="btn btn-secondary btn-xs" href="/api/admin/export?format=json" target="_blank">Backup JSON</a>' +
        '<button type="button" class="btn btn-danger btn-xs" id="clearAccessLogsBtn">Clear History</button>' +
        "</div></div>" +
        '<input id="admLogSearchInput" type="text" class="field-input" placeholder="Filter by IP address, user email, or domain..." value="' +
        esc(logFilter) +
        '" style="margin-bottom:12px" />' +
        (filtered.length === 0
          ? '<div class="empty-bookmarks">No matching access history entries.</div>'
          : '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Time</th><th>Client IP</th><th>User</th><th>Engine</th><th>Visited URL</th><th>Actions</th></tr></thead><tbody>' +
            filtered
              .slice(0, 150)
              .map(function (l) {
                return (
                  "<tr><td>" +
                  esc(fmtTime(l.ts)) +
                  "</td><td><code>" +
                  esc(l.ip) +
                  "</code></td><td>" +
                  esc(l.userLabel) +
                  "</td><td>" +
                  esc(l.engine) +
                  "</td><td style='max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' title='" +
                  esc(l.url) +
                  "'>" +
                  esc(l.url) +
                  '</td><td class="admin-act-cell">' +
                  '<button type="button" class="btn btn-danger btn-xs" data-quick-ban="' +
                  esc(l.ip) +
                  '">Ban IP</button>' +
                  (l.domain
                    ? '<button type="button" class="btn btn-secondary btn-xs" data-block-dom="' +
                      esc(l.domain) +
                      '">Block Site</button>'
                    : "") +
                  "</td></tr>"
                );
              })
              .join("") +
            "</tbody></table></div>") +
        "</div>" +
        '<div class="internal-panel" style="margin-top:16px">' +
        "<h3>Admin Security Audit Trail (" +
        ((s.auditLog && s.auditLog.length) || 0) +
        ")</h3>" +
        (!s.auditLog || s.auditLog.length === 0
          ? '<div class="empty-bookmarks">No admin actions recorded yet.</div>'
          : '<div style="margin-top:8px">' +
            s.auditLog
              .slice(0, 30)
              .map(function (a) {
                return (
                  '<div class="ext-row"><span><strong>' +
                  esc(a.action) +
                  "</strong> · <code>" +
                  esc(a.target) +
                  '</code></span><span class="settings-desc">' +
                  esc(fmtTime(a.ts)) +
                  "</span></div>"
                );
              })
              .join("") +
            "</div>") +
        "</div>"
      );
    }

    function renderKeysAndRolesTab(s) {
      var roleKeys = Object.keys(s.roles || {});
      var invites = s.inviteLinks || [];
      return (
        '<div class="internal-panel" style="margin-bottom:16px">' +
        "<h3>Shareable 1-Click Invite Links (<code>/?invite=INV-...</code>)</h3>" +
        '<p class="settings-desc">Share a clickable URL with friends that unlocks Ibossbad for a set duration without ever revealing your master passcode.</p>' +
        '<div class="req-grid" style="margin-top:10px">' +
        '<input id="invLabelInput" type="text" class="field-input" placeholder="Label (e.g. Period 3 Group)" />' +
        '<input id="invHoursInput" type="number" class="field-input" value="12" min="1" placeholder="Hours" />' +
        '<input id="invMaxUsesInput" type="number" class="field-input" value="5" min="1" placeholder="Max Clicks" />' +
        '<button type="button" class="btn btn-primary" id="createInviteBtn">Create Invite Link</button>' +
        "</div>" +
        '<div style="margin-top:12px">' +
        (invites.length === 0
          ? '<div class="empty-bookmarks">No invite links created yet.</div>'
          : invites
              .map(function (inv) {
                var fullUrl =
                  window.location.origin +
                  "/?invite=" +
                  encodeURIComponent(inv.code);
                var st = inv.revoked
                  ? "REVOKED"
                  : inv.expiresAt && Date.now() > inv.expiresAt
                  ? "EXPIRED"
                  : inv.uses + "/" + inv.maxUses + " clicks";
                return (
                  '<div class="ext-row"><div><code>' +
                  esc(inv.code) +
                  "</code> · " +
                  esc(inv.label) +
                  ' <span class="relay-mini-badge">' +
                  esc(st) +
                  "</span></div>" +
                  '<div style="display:flex;gap:6px">' +
                  '<button type="button" class="btn btn-secondary btn-xs" data-copy-key="' +
                  esc(fullUrl) +
                  '">Copy Link</button>' +
                  (!inv.revoked
                    ? '<button type="button" class="btn btn-danger btn-xs" data-revoke-inv="' +
                      esc(inv.code) +
                      '">Revoke</button>'
                    : "") +
                  "</div></div>"
                );
              })
              .join("")) +
        "</div></div>" +
        '<div class="internal-panel" style="margin-bottom:16px">' +
        "<h3>Temporary Access Keys (12h / 24h / 7d)</h3>" +
        '<div class="req-grid" style="margin-top:10px">' +
        '<input id="keyLabelInput" type="text" class="field-input" placeholder="Label (e.g. Friend 12h Key)" />' +
        '<input id="keyHoursInput" type="number" class="field-input" value="12" min="1" placeholder="Hours (e.g. 12)" />' +
        '<input id="keyMaxUsesInput" type="number" class="field-input" value="1" min="1" placeholder="Max Uses" />' +
        '<button type="button" class="btn btn-primary" id="mintKeyBtn">Generate Key</button>' +
        "</div>" +
        '<div style="margin-top:12px">' +
        (s.accessKeys.length === 0
          ? '<div class="empty-bookmarks">No temporary keys generated yet.</div>'
          : s.accessKeys
              .map(function (k) {
                var status = k.revoked
                  ? "REVOKED"
                  : k.expiresAt && Date.now() > k.expiresAt
                  ? "EXPIRED"
                  : k.uses + "/" + k.maxUses + " uses";
                return (
                  '<div class="ext-row"><div><code>' +
                  esc(k.code) +
                  "</code> · " +
                  esc(k.label) +
                  ' <span class="relay-mini-badge">' +
                  esc(status) +
                  "</span></div>" +
                  '<div style="display:flex;gap:6px">' +
                  '<button type="button" class="btn btn-secondary btn-xs" data-copy-key="' +
                  esc(k.code) +
                  '">Copy</button>' +
                  (!k.revoked
                    ? '<button type="button" class="btn btn-danger btn-xs" data-revoke-key="' +
                      esc(k.code) +
                      '">Revoke</button>'
                    : "") +
                  "</div></div>"
                );
              })
              .join("")) +
        "</div></div>" +
        '<div class="internal-panel" style="margin-bottom:16px">' +
        "<h3>LootLabs 12h Key Redirect Hook</h3>" +
        '<p class="settings-desc">Point your LootLabs destination URL to <code>' +
        esc(window.location.origin + "/api/keys/lootlabs-claim") +
        "</code> (or use the signed callback URL).</p>" +
        '<div class="req-grid" style="margin-top:10px">' +
        '<select id="llEnabledSelect" class="field-select"><option value="off"' +
        (!s.config.lootlabs.enabled ? " selected" : "") +
        '>Disabled</option><option value="on"' +
        (s.config.lootlabs.enabled ? " selected" : "") +
        ">Enabled on Lock Screen</option></select>" +
        '<input id="llUrlInput" type="text" class="field-input" placeholder="https://loot-link.com/s?..." value="' +
        esc(s.config.lootlabs.linkUrl || "") +
        '" />' +
        '<input id="llHoursInput" type="number" class="field-input" value="' +
        Number(s.config.lootlabs.durationHours || 12) +
        '" />' +
        '<button type="button" class="btn btn-primary" id="saveLootlabsBtn">Save LootLabs</button>' +
        "</div></div>" +
        '<div class="internal-panel">' +
        "<h3>Admin, VIP &amp; Moderator Account Roles</h3>" +
        '<p class="settings-desc"><strong>ADMIN</strong> accounts unlock <code>iboss://admin</code> automatically on sign-in. <strong>VIP</strong> accounts skip 12h key timers &amp; rate limits. <strong>MOD</strong> accounts get a Moderator badge &amp; bypass chat slow-mode.</p>' +
        '<div class="req-grid" style="margin-top:10px">' +
        '<input id="roleIdentInput" type="text" class="field-input" placeholder="Account email (e.g. you@example.com)" />' +
        '<select id="roleSelect" class="field-select"><option value="ADMIN">ADMIN (Full Admin Access)</option><option value="VIP">VIP</option><option value="MOD">MOD</option><option value="NONE">Remove Role</option></select>' +
        '<button type="button" class="btn btn-primary" id="saveRoleBtn">Assign Role</button>' +
        "</div>" +
        '<div style="margin-top:12px">' +
        (roleKeys.length === 0
          ? '<div class="empty-bookmarks">No custom roles assigned yet.</div>'
          : roleKeys
              .map(function (rk) {
                return (
                  '<div class="ext-row"><span><strong>' +
                  esc(rk) +
                  '</strong> <span class="relay-mini-badge">' +
                  esc(s.roles[rk]) +
                  "</span></span>" +
                  '<button type="button" class="btn btn-danger btn-xs" data-rm-role="' +
                  esc(rk) +
                  '">Remove</button></div>'
                );
              })
              .join("")) +
        "</div></div>"
      );
    }

    function renderPoliciesTab(s) {
      var ruleTargets = Object.keys(s.config.perTargetRules || {});
      return (
        '<div class="internal-panel" style="margin-bottom:16px">' +
        "<h3>Passcode, Rate Limits, Schedule &amp; Discord Alerts</h3>" +
        '<div class="admin-form-grid">' +
        '<div><label class="field-label">Active Proxy Passcode</label><input id="polPasscode" type="text" class="field-input" value="' +
        esc(s.config.activePasscode || "") +
        '" /></div>' +
        '<div><label class="field-label">Max Requests / Min per IP</label><input id="polRateLimit" type="number" class="field-input" value="' +
        Number(s.config.rateLimitPerMin || 240) +
        '" /></div>' +
        '<div><label class="field-label">Brute-Force Max Failed Logins</label><input id="polBfAttempts" type="number" class="field-input" value="' +
        Number(s.config.bruteForceMaxAttempts || 8) +
        '" /></div>' +
        '<div><label class="field-label">Brute-Force Ban Minutes</label><input id="polBfMins" type="number" class="field-input" value="' +
        Number(s.config.bruteForceBanMinutes || 15) +
        '" /></div>' +
        '<div><label class="field-label">Custom 403 Ban Screen Message</label><input id="polBanMsg" type="text" class="field-input" value="' +
        esc(s.config.banPageMessage || "") +
        '" /></div>' +
        '<div><label class="field-label">Maintenance Lockdown Message</label><input id="polLockMsg" type="text" class="field-input" value="' +
        esc(s.config.lockdownMessage || "") +
        '" /></div>' +
        '<div style="grid-column:1/-1"><label class="field-label">Discord Webhook URL (Alerts on Auto-Bans, Signups &amp; Requests)</label><input id="polDiscordHook" type="text" class="field-input" placeholder="https://discord.com/api/webhooks/..." value="' +
        esc(s.config.discordWebhookUrl || "") +
        '" /></div>' +
        "</div>" +
        '<hr style="border:0;border-top:1px solid var(--border);margin:16px 0" />' +
        "<h4>Time-of-Day Automatic Schedule</h4>" +
        '<div class="req-grid" style="margin-top:8px">' +
        '<select id="schEnabled" class="field-select"><option value="off"' +
        (!s.config.schedule.enabled ? " selected" : "") +
        '>Schedule Disabled</option><option value="on"' +
        (s.config.schedule.enabled ? " selected" : "") +
        ">Schedule Enabled</option></select>" +
        '<input id="schStart" type="number" min="0" max="23" class="field-input" placeholder="Start Hour (0-23)" value="' +
        Number(s.config.schedule.startHour) +
        '" />' +
        '<input id="schEnd" type="number" min="0" max="23" class="field-input" placeholder="End Hour (0-23)" value="' +
        Number(s.config.schedule.endHour) +
        '" />' +
        '<select id="schAction" class="field-select"><option value="camouflage"' +
        (s.config.schedule.action === "camouflage" ? " selected" : "") +
        '>Auto-Camouflage</option><option value="lockdown"' +
        (s.config.schedule.action === "lockdown" ? " selected" : "") +
        ">Auto-Lockdown</option></select>" +
        "</div>" +
        '<hr style="border:0;border-top:1px solid var(--border);margin:16px 0" />' +
        "<h4>Domain Blacklist &amp; Whitelist-Only Mode</h4>" +
        '<div class="toggle-row" style="margin-top:8px"><div><strong>Whitelist-Only Mode</strong><p class="settings-desc">When ON, users can only open domains listed in Approved Whitelist.</p></div>' +
        '<select id="polWhitelistMode" class="field-select"><option value="off"' +
        (!s.config.whitelistMode ? " selected" : "") +
        '>Off</option><option value="on"' +
        (s.config.whitelistMode ? " selected" : "") +
        ">Enabled</option></select></div>" +
        '<div class="admin-two-col" style="margin-top:10px">' +
        '<div><label class="field-label">Blocked Domains (comma-separated)</label><textarea id="polBlacklist" class="field-input code-area" rows="3">' +
        esc((s.config.domainBlacklist || []).join(", ")) +
        "</textarea></div>" +
        '<div><label class="field-label">Approved Whitelist Domains (comma-separated)</label><textarea id="polWhitelist" class="field-input code-area" rows="3">' +
        esc((s.config.domainWhitelist || []).join(", ")) +
        "</textarea></div></div>" +
        '<div style="margin-top:14px"><button type="button" class="btn btn-primary" id="savePoliciesBtn">Save All Policies</button></div>' +
        "</div>" +
        '<div class="internal-panel" style="margin-bottom:16px">' +
        "<h3>Per-User / Per-IP Site &amp; Chat Rules</h3>" +
        '<div class="req-grid" style="margin-top:10px">' +
        '<input id="ruleTargetInput" type="text" class="field-input" placeholder="IP or Email" />' +
        '<input id="ruleDomainsInput" type="text" class="field-input" placeholder="Blocked domains (comma-separated)" />' +
        '<select id="ruleMuteSelect" class="field-select"><option value="no">Chat Allowed</option><option value="yes">Mute in Chat</option></select>' +
        '<button type="button" class="btn btn-primary" id="addTargetRuleBtn">Save Rule</button>' +
        "</div>" +
        '<div style="margin-top:10px">' +
        (ruleTargets.length === 0
          ? '<div class="empty-bookmarks">No per-user/IP custom rules set.</div>'
          : ruleTargets
              .map(function (tk) {
                var r = s.config.perTargetRules[tk] || {};
                return (
                  '<div class="ext-row"><span><code>' +
                  esc(tk) +
                  "</code> · Blocked: " +
                  esc((r.blockedDomains || []).join(", ") || "none") +
                  (r.chatMuted ? " · <strong>CHAT MUTED</strong>" : "") +
                  '</span><button type="button" class="btn btn-danger btn-xs" data-del-rule="' +
                  esc(tk) +
                  '">Delete</button></div>'
                );
              })
              .join("")) +
        "</div></div>" +
        '<div class="internal-panel" style="margin-bottom:16px">' +
        "<h3>Login MOTD / What's New Popup Modal</h3>" +
        '<p class="settings-desc">Shown once per update when users unlock the browser.</p>' +
        '<div class="req-grid" style="margin-top:10px">' +
        '<select id="motdEnabledSelect" class="field-select"><option value="off"' +
        (!(s.config.motd && s.config.motd.enabled) ? " selected" : "") +
        '>Disabled</option><option value="on"' +
        (s.config.motd && s.config.motd.enabled ? " selected" : "") +
        ">Enabled</option></select>" +
        '<input id="motdTitleInput" type="text" class="field-input" placeholder="Announcement Title" value="' +
        esc((s.config.motd && s.config.motd.title) || "What's New") +
        '" />' +
        '<input id="motdBodyInput" type="text" class="field-input" placeholder="Announcement text..." value="' +
        esc((s.config.motd && s.config.motd.body) || "") +
        '" />' +
        '<button type="button" class="btn btn-primary" id="saveMotdBtn">Save MOTD</button>' +
        "</div></div>" +
        '<div class="internal-panel">' +
        "<h3>Rotate Admin Password</h3>" +
        '<div class="req-grid" style="margin-top:10px">' +
        '<input id="rotOldPwd" type="password" class="field-input" placeholder="Current Admin Password" />' +
        '<input id="rotNewPwd" type="password" class="field-input" placeholder="New Admin Password" />' +
        '<button type="button" class="btn btn-secondary" id="rotateAdminPwdBtn">Update Admin Password</button>' +
        "</div></div>"
      );
    }

    function renderCommunityTab(s) {
      return (
        '<div class="internal-panel" style="margin-bottom:16px">' +
        "<h3>Game Requests &amp; Broken-Site Inbox (" +
        s.gameRequests.length +
        ")</h3>" +
        (s.gameRequests.length === 0
          ? '<div class="empty-bookmarks">Inbox is empty.</div>'
          : s.gameRequests
              .map(function (r) {
                return (
                  '<div class="ext-row"><div><strong>[' +
                  esc(r.kind.toUpperCase()) +
                  "] " +
                  esc(r.title) +
                  "</strong> · <code>" +
                  esc(r.ip) +
                  '</code> <span class="relay-mini-badge">' +
                  esc(r.status) +
                  '</span><div class="settings-desc">' +
                  esc(r.url || "No URL") +
                  (r.notes ? " — " + esc(r.notes) : "") +
                  "</div></div>" +
                  '<div style="display:flex;gap:6px">' +
                  (r.url && r.status === "open"
                    ? '<button type="button" class="btn btn-primary btn-xs" data-req-act="approve" data-req-id="' +
                      esc(r.id) +
                      '">Approve to Hub</button>'
                    : "") +
                  '<button type="button" class="btn btn-danger btn-xs" data-req-act="delete" data-req-id="' +
                  esc(r.id) +
                  '">Delete</button></div></div>'
                );
              })
              .join("")) +
        "</div>" +
        '<div class="internal-panel" style="margin-bottom:16px">' +
        "<h3>Add Game / App to Catalog</h3>" +
        '<div class="req-grid" style="margin-top:10px">' +
        '<input id="cgTitle" type="text" class="field-input" placeholder="Game Title" />' +
        '<input id="cgUrl" type="text" class="field-input" placeholder="https://..." />' +
        '<select id="cgCat" class="field-select"><option value="featured">Featured</option><option value="action">Action</option><option value="arcade">Arcade</option><option value="sports">Sports</option><option value="puzzle">Puzzle</option><option value="apps">Apps</option></select>' +
        '<button type="button" class="btn btn-primary" id="addCustomGameBtn">Add to Hub</button>' +
        "</div>" +
        '<div style="margin-top:10px">' +
        (s.customGames || [])
          .map(function (g) {
            return (
              '<div class="ext-row"><span><strong>' +
              esc(g.title) +
              "</strong> (" +
              esc(g.url) +
              ')</span><button type="button" class="btn btn-danger btn-xs" data-del-cg="' +
              esc(g.url) +
              '">Remove</button></div>'
            );
          })
          .join("") +
        "</div></div>" +
        '<div class="internal-panel" style="margin-bottom:16px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
        "<h3>Live Instance Chat Poll</h3>" +
        (s.activePoll
          ? '<button type="button" class="btn btn-danger btn-xs" id="admClosePollBtn">Close Active Poll</button>'
          : "") +
        "</div>" +
        (s.activePoll
          ? '<div style="margin-top:8px"><strong>' +
            esc(s.activePoll.question) +
            '</strong> <span class="relay-mini-badge">' +
            s.activePoll.totalVotes +
            " votes</span>" +
            '<div style="margin-top:8px">' +
            s.activePoll.options
              .map(function (o) {
                return (
                  '<div class="ext-row"><span>' +
                  esc(o.label) +
                  "</span><strong>" +
                  o.votes +
                  " votes</strong></div>"
                );
              })
              .join("") +
            "</div></div>"
          : '<div class="req-grid" style="margin-top:10px">' +
            '<input id="pollQuestionInput" type="text" class="field-input" placeholder="Poll question (e.g. Which game should we feature?)" />' +
            '<input id="pollOptionsInput" type="text" class="field-input" placeholder="Comma-separated options (e.g. PolyTrack, Slope 2, Celeste)" />' +
            '<button type="button" class="btn btn-primary" id="admLaunchPollBtn">Launch Poll</button></div>') +
        "</div>" +
        '<div class="internal-panel">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
        "<h3>Instance Chat Moderation</h3>" +
        '<div style="display:flex;gap:8px">' +
        '<button type="button" class="btn btn-secondary btn-xs" id="toggleChatStateBtn">Chat: ' +
        (s.config.chatEnabled ? "ENABLED" : "DISABLED") +
        "</button>" +
        '<button type="button" class="btn btn-danger btn-xs" id="clearAllChatBtn">Clear Chat</button>' +
        "</div></div>" +
        '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<input id="admChatMsgInput" type="text" class="field-input" placeholder="Send message with [ADMIN] crown badge..." />' +
        '<button type="button" class="btn btn-primary" id="admSendChatBtn">Post as [ADMIN]</button>' +
        "</div>" +
        '<div class="req-grid" style="margin-top:12px">' +
        '<input id="chatSlowInput" type="number" min="0" max="300" class="field-input" placeholder="Slow-mode seconds (0 = off)" value="' +
        Number(s.config.chatSlowModeSec || 0) +
        '" />' +
        '<input id="chatWordsInput" type="text" class="field-input" placeholder="Blocked words (comma-separated)" value="' +
        esc((s.config.chatBlockedWords || []).join(", ")) +
        '" />' +
        '<button type="button" class="btn btn-secondary" id="saveChatFilterBtn">Save Chat Rules</button>' +
        "</div>" +
        '<div style="margin-top:12px">' +
        (s.chatMessages || [])
          .slice()
          .reverse()
          .map(function (m) {
            return (
              '<div class="ext-row"><div><strong>[' +
              esc(m.role) +
              "] " +
              esc(m.author) +
              "</strong> (<code>" +
              esc(m.ip) +
              "</code>): " +
              esc(m.text) +
              '</div><button type="button" class="btn btn-danger btn-xs" data-del-msg="' +
              esc(m.id) +
              '">Delete</button></div>'
            );
          })
          .join("") +
        "</div></div>"
      );
    }

    function bindEvents(container, s) {
      container.querySelectorAll("[data-adm-tab]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          activeTab = btn.getAttribute("data-adm-tab");
          renderDashboard(container);
        });
      });

      var refreshBtn = container.querySelector("#admRefreshBtn");
      if (refreshBtn) {
        refreshBtn.addEventListener("click", function () {
          refreshSnapshot(container);
        });
      }

      var massCloakBtn = container.querySelector("#admMassCloakBtn");
      if (massCloakBtn) {
        massCloakBtn.addEventListener("click", async function () {
          await apiAdmin("/mass-cloak", "POST");
          hooks.toast("Mass-Cloak triggered across all connected users!");
        });
      }

      var camoBtn = container.querySelector("#admToggleCamoBtn");
      if (camoBtn) {
        camoBtn.addEventListener("click", async function () {
          await apiAdmin("/config", "PUT", {
            camouflageEnabled: !s.config.camouflageEnabled,
          });
          refreshSnapshot(container);
        });
      }

      var lockBtn = container.querySelector("#admToggleLockdownBtn");
      if (lockBtn) {
        lockBtn.addEventListener("click", async function () {
          await apiAdmin("/config", "PUT", {
            lockdownEnabled: !s.config.lockdownEnabled,
          });
          refreshSnapshot(container);
        });
      }

      var kickAllBtn = container.querySelector("#admKickAllBtn");
      if (kickAllBtn) {
        kickAllBtn.addEventListener("click", async function () {
          await apiAdmin("/session-action", "POST", {
            sid: "ALL",
            action: "kick",
          });
          hooks.toast("All non-admin sessions kicked.");
          refreshSnapshot(container);
        });
      }

      var sendBcBtn = container.querySelector("#admSendBroadcastBtn");
      if (sendBcBtn) {
        sendBcBtn.addEventListener("click", async function () {
          var txt = container.querySelector("#admBroadcastInput").value;
          var lvl = container.querySelector("#admBroadcastLevel").value;
          await apiAdmin("/broadcast", "POST", {
            text: txt,
            level: lvl,
            durationMinutes: 30,
          });
          hooks.toast("Live broadcast updated!");
          refreshSnapshot(container);
        });
      }

      var clrBcBtn = container.querySelector("#admClearBroadcastBtn");
      if (clrBcBtn) {
        clrBcBtn.addEventListener("click", async function () {
          await apiAdmin("/broadcast", "POST", { text: "" });
          refreshSnapshot(container);
        });
      }

      container.querySelectorAll("[data-sess-act]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var sid = btn.getAttribute("data-sid");
          var act = btn.getAttribute("data-sess-act");
          var data = {};
          if (act === "redirect") {
            var u = window.prompt(
              "Enter URL to force-redirect this user to:",
              "https://classroom.google.com"
            );
            if (!u) return;
            data.url = u;
          } else if (act === "popup") {
            var m = window.prompt("Direct popup message to send to user:");
            if (!m) return;
            data.message = m;
          } else if (act === "freeze") {
            var fm = window.prompt(
              "Freeze screen message:",
              "Paused by Administrator."
            );
            if (fm === null) return;
            data.message = fm;
          }
          await apiAdmin("/session-action", "POST", {
            sid: sid,
            action: act,
            data: data,
          });
          hooks.toast("Sent '" + act + "' command!");
          refreshSnapshot(container);
        });
      });

      container.querySelectorAll("[data-quick-ban]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var ip = btn.getAttribute("data-quick-ban");
          var r = await apiAdmin("/ban-ip", "POST", {
            ip: ip,
            reason: "Banned by Admin",
          });
          if (!r.ok) {
            hooks.toast((r.data && r.data.error) || "Could not ban IP.");
            return;
          }
          hooks.toast("Banned IP " + ip);
          refreshSnapshot(container);
        });
      });

      container.querySelectorAll("[data-block-dom]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var dom = btn.getAttribute("data-block-dom");
          var nextList = (s.config.domainBlacklist || []).concat(dom);
          await apiAdmin("/config", "PUT", { domainBlacklist: nextList });
          hooks.toast("Blocked domain " + dom);
          refreshSnapshot(container);
        });
      });

      var addBanBtn = container.querySelector("#addBanBtn");
      if (addBanBtn) {
        addBanBtn.addEventListener("click", async function () {
          var ip = container.querySelector("#banIpInput").value.trim();
          var reason = container.querySelector("#banReasonInput").value.trim();
          var mins = Number(
            container.querySelector("#banDurationInput").value || 0
          );
          var r = await apiAdmin("/ban-ip", "POST", {
            ip: ip,
            reason: reason,
            durationMinutes: mins,
          });
          if (!r.ok) {
            hooks.toast((r.data && r.data.error) || "Failed to ban IP.");
            return;
          }
          hooks.toast("Banned " + ip);
          refreshSnapshot(container);
        });
      }

      container.querySelectorAll("[data-unban-ip]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          await apiAdmin("/unban-ip", "POST", {
            ip: btn.getAttribute("data-unban-ip"),
          });
          refreshSnapshot(container);
        });
      });

      var logSearch = container.querySelector("#admLogSearchInput");
      if (logSearch) {
        logSearch.addEventListener("input", function () {
          logFilter = logSearch.value;
          renderDashboard(container);
          var next = container.querySelector("#admLogSearchInput");
          if (next) next.focus();
        });
      }

      var clearLogsBtn = container.querySelector("#clearAccessLogsBtn");
      if (clearLogsBtn) {
        clearLogsBtn.addEventListener("click", async function () {
          await apiAdmin("/logs/clear", "POST");
          hooks.toast("Access history cleared.");
          refreshSnapshot(container);
        });
      }

      var mintKeyBtn = container.querySelector("#mintKeyBtn");
      if (mintKeyBtn) {
        mintKeyBtn.addEventListener("click", async function () {
          var label = container.querySelector("#keyLabelInput").value;
          var hours = Number(
            container.querySelector("#keyHoursInput").value || 12
          );
          var maxUses = Number(
            container.querySelector("#keyMaxUsesInput").value || 1
          );
          var r = await apiAdmin("/keys", "POST", {
            label: label,
            durationHours: hours,
            maxUses: maxUses,
          });
          if (r.ok && r.data.key) {
            hooks.toast("Minted key: " + r.data.key.code);
            refreshSnapshot(container);
          }
        });
      }

      container.querySelectorAll("[data-copy-key]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var code = btn.getAttribute("data-copy-key");
          if (navigator.clipboard) {
            navigator.clipboard.writeText(code);
          }
          hooks.toast("Copied " + code);
        });
      });

      container.querySelectorAll("[data-revoke-key]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          await apiAdmin(
            "/keys/" + encodeURIComponent(btn.getAttribute("data-revoke-key")),
            "DELETE"
          );
          refreshSnapshot(container);
        });
      });

      var saveLlBtn = container.querySelector("#saveLootlabsBtn");
      if (saveLlBtn) {
        saveLlBtn.addEventListener("click", async function () {
          await apiAdmin("/config", "PUT", {
            lootlabs: {
              enabled:
                container.querySelector("#llEnabledSelect").value === "on",
              linkUrl: container.querySelector("#llUrlInput").value.trim(),
              durationHours: Number(
                container.querySelector("#llHoursInput").value || 12
              ),
            },
          });
          hooks.toast("LootLabs settings saved!");
          refreshSnapshot(container);
        });
      }

      var saveRoleBtn = container.querySelector("#saveRoleBtn");
      if (saveRoleBtn) {
        saveRoleBtn.addEventListener("click", async function () {
          await apiAdmin("/roles", "PUT", {
            identifier: container.querySelector("#roleIdentInput").value,
            role: container.querySelector("#roleSelect").value,
          });
          refreshSnapshot(container);
        });
      }

      container.querySelectorAll("[data-rm-role]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          await apiAdmin("/roles", "PUT", {
            identifier: btn.getAttribute("data-rm-role"),
            role: "NONE",
          });
          refreshSnapshot(container);
        });
      });

      var savePolBtn = container.querySelector("#savePoliciesBtn");
      if (savePolBtn) {
        savePolBtn.addEventListener("click", async function () {
          var bl = container
            .querySelector("#polBlacklist")
            .value.split(",")
            .map(function (s2) {
              return s2.trim();
            })
            .filter(Boolean);
          var wl = container
            .querySelector("#polWhitelist")
            .value.split(",")
            .map(function (s2) {
              return s2.trim();
            })
            .filter(Boolean);

          await apiAdmin("/config", "PUT", {
            passcode: container.querySelector("#polPasscode").value,
            rateLimitPerMin: Number(
              container.querySelector("#polRateLimit").value || 240
            ),
            bruteForceMaxAttempts: Number(
              container.querySelector("#polBfAttempts").value || 8
            ),
            bruteForceBanMinutes: Number(
              container.querySelector("#polBfMins").value || 15
            ),
            banPageMessage: container.querySelector("#polBanMsg").value,
            lockdownMessage: container.querySelector("#polLockMsg").value,
            discordWebhookUrl: container.querySelector("#polDiscordHook").value,
            whitelistMode:
              container.querySelector("#polWhitelistMode").value === "on",
            domainBlacklist: bl,
            domainWhitelist: wl,
            schedule: {
              enabled: container.querySelector("#schEnabled").value === "on",
              startHour: Number(
                container.querySelector("#schStart").value || 8
              ),
              endHour: Number(container.querySelector("#schEnd").value || 15),
              action: container.querySelector("#schAction").value,
            },
          });
          hooks.toast("Policies & schedule saved!");
          refreshSnapshot(container);
        });
      }

      var addRuleBtn = container.querySelector("#addTargetRuleBtn");
      if (addRuleBtn) {
        addRuleBtn.addEventListener("click", async function () {
          var tgt = container
            .querySelector("#ruleTargetInput")
            .value.trim()
            .toLowerCase();
          if (!tgt) return;
          var doms = container
            .querySelector("#ruleDomainsInput")
            .value.split(",")
            .map(function (x) {
              return x.trim();
            })
            .filter(Boolean);
          var muted =
            container.querySelector("#ruleMuteSelect").value === "yes";
          var nextRules = Object.assign({}, s.config.perTargetRules || {});
          nextRules[tgt] = { blockedDomains: doms, chatMuted: muted };
          await apiAdmin("/config", "PUT", { perTargetRules: nextRules });
          refreshSnapshot(container);
        });
      }

      container.querySelectorAll("[data-del-rule]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var nextRules = Object.assign({}, s.config.perTargetRules || {});
          delete nextRules[btn.getAttribute("data-del-rule")];
          await apiAdmin("/config", "PUT", { perTargetRules: nextRules });
          refreshSnapshot(container);
        });
      });

      var rotBtn = container.querySelector("#rotateAdminPwdBtn");
      if (rotBtn) {
        rotBtn.addEventListener("click", async function () {
          var oldP = container.querySelector("#rotOldPwd").value;
          var newP = container.querySelector("#rotNewPwd").value;
          var r = await apiAdmin("/rotate-password", "POST", {
            currentPassword: oldP,
            newPassword: newP,
          });
          if (!r.ok) {
            hooks.toast((r.data && r.data.error) || "Rotation failed.");
            return;
          }
          cachedAdminSecret = newP;
          hooks.toast("Admin password updated!");
        });
      }

      container.querySelectorAll("[data-req-act]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          await apiAdmin(
            "/requests/" + encodeURIComponent(btn.getAttribute("data-req-id")),
            "POST",
            { action: btn.getAttribute("data-req-act") }
          );
          hooks.reloadCustomGames();
          refreshSnapshot(container);
        });
      });

      var addCgBtn = container.querySelector("#addCustomGameBtn");
      if (addCgBtn) {
        addCgBtn.addEventListener("click", async function () {
          var r = await apiAdmin("/games", "POST", {
            title: container.querySelector("#cgTitle").value,
            url: container.querySelector("#cgUrl").value,
            category: container.querySelector("#cgCat").value,
          });
          if (!r.ok) {
            hooks.toast((r.data && r.data.error) || "Invalid game.");
            return;
          }
          hooks.reloadCustomGames();
          refreshSnapshot(container);
        });
      }

      container.querySelectorAll("[data-del-cg]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          await apiAdmin("/games", "DELETE", {
            url: btn.getAttribute("data-del-cg"),
          });
          hooks.reloadCustomGames();
          refreshSnapshot(container);
        });
      });

      var toggleChatBtn = container.querySelector("#toggleChatStateBtn");
      if (toggleChatBtn) {
        toggleChatBtn.addEventListener("click", async function () {
          await apiAdmin("/config", "PUT", {
            chatEnabled: !s.config.chatEnabled,
          });
          refreshSnapshot(container);
        });
      }

      var clrChatBtn = container.querySelector("#clearAllChatBtn");
      if (clrChatBtn) {
        clrChatBtn.addEventListener("click", async function () {
          await apiAdmin("/chat/clear", "POST");
          refreshSnapshot(container);
        });
      }

      var sendAdmChat = container.querySelector("#admSendChatBtn");
      if (sendAdmChat) {
        sendAdmChat.addEventListener("click", async function () {
          var txt = container.querySelector("#admChatMsgInput").value;
          if (!txt) return;
          await fetch("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Admin-Password": cachedAdminSecret,
            },
            body: JSON.stringify({ text: txt }),
          });
          refreshSnapshot(container);
        });
      }

      container.querySelectorAll("[data-del-msg]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          await apiAdmin(
            "/chat/" + encodeURIComponent(btn.getAttribute("data-del-msg")),
            "DELETE"
          );
          refreshSnapshot(container);
        });
      });

      var createInvBtn = container.querySelector("#createInviteBtn");
      if (createInvBtn) {
        createInvBtn.addEventListener("click", async function () {
          var r = await apiAdmin("/invites", "POST", {
            label: container.querySelector("#invLabelInput").value,
            durationHours: Number(
              container.querySelector("#invHoursInput").value || 12
            ),
            maxUses: Number(
              container.querySelector("#invMaxUsesInput").value || 5
            ),
          });
          if (r.ok && r.data.invite) {
            var link =
              window.location.origin +
              "/?invite=" +
              encodeURIComponent(r.data.invite.code);
            if (navigator.clipboard) navigator.clipboard.writeText(link);
            hooks.toast("Created & copied invite link!");
            refreshSnapshot(container);
          }
        });
      }

      container.querySelectorAll("[data-revoke-inv]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          await apiAdmin(
            "/invites/" +
              encodeURIComponent(btn.getAttribute("data-revoke-inv")),
            "DELETE"
          );
          refreshSnapshot(container);
        });
      });

      var saveMotdBtn = container.querySelector("#saveMotdBtn");
      if (saveMotdBtn) {
        saveMotdBtn.addEventListener("click", async function () {
          await apiAdmin("/motd", "POST", {
            enabled:
              container.querySelector("#motdEnabledSelect").value === "on",
            title: container.querySelector("#motdTitleInput").value,
            body: container.querySelector("#motdBodyInput").value,
          });
          hooks.toast("MOTD announcement updated!");
          refreshSnapshot(container);
        });
      }

      var launchPollBtn = container.querySelector("#admLaunchPollBtn");
      if (launchPollBtn) {
        launchPollBtn.addEventListener("click", async function () {
          var q = container.querySelector("#pollQuestionInput").value;
          var opts = container
            .querySelector("#pollOptionsInput")
            .value.split(",")
            .map(function (x) {
              return x.trim();
            })
            .filter(Boolean);
          var r = await apiAdmin("/poll", "POST", {
            question: q,
            options: opts,
          });
          if (!r.ok) {
            hooks.toast((r.data && r.data.error) || "Need 2+ options.");
            return;
          }
          hooks.toast("Live poll launched in Instance Chat!");
          refreshSnapshot(container);
        });
      }

      var closePollBtn = container.querySelector("#admClosePollBtn");
      if (closePollBtn) {
        closePollBtn.addEventListener("click", async function () {
          await apiAdmin("/poll", "POST", { action: "close" });
          refreshSnapshot(container);
        });
      }

      var saveChatFilterBtn = container.querySelector("#saveChatFilterBtn");
      if (saveChatFilterBtn) {
        saveChatFilterBtn.addEventListener("click", async function () {
          var slowSec = Number(
            container.querySelector("#chatSlowInput").value || 0
          );
          var words = container
            .querySelector("#chatWordsInput")
            .value.split(",")
            .map(function (w) {
              return w.trim().toLowerCase();
            })
            .filter(Boolean);
          await apiAdmin("/config", "PUT", {
            chatSlowModeSec: slowSec,
            chatBlockedWords: words,
          });
          hooks.toast("Chat slow-mode & word filter saved!");
          refreshSnapshot(container);
        });
      }

      var selfGrantBtn = container.querySelector("#admGrantSelfRoleBtn");
      if (selfGrantBtn) {
        selfGrantBtn.addEventListener("click", async function () {
          var myEmail = hooks.getCurrentUserEmail
            ? hooks.getCurrentUserEmail()
            : "";
          if (!myEmail) return;
          await apiAdmin("/roles", "PUT", {
            identifier: myEmail,
            role: "ADMIN",
          });
          hooks.toast("👑 Bound " + myEmail + " as permanent ADMIN!");
          if (hooks.onAdminAuthenticated) hooks.onAdminAuthenticated();
          refreshSnapshot(container);
        });
      }
    }

    function renderDashboard(container) {
      if (!lastSnapshot) {
        refreshSnapshot(container);
        return;
      }
      var s = lastSnapshot;
      var myEmail = hooks.getCurrentUserEmail
        ? String(hooks.getCurrentUserEmail() || "").toLowerCase()
        : "";
      var canBindSelf =
        Boolean(myEmail) && (!s.roles || s.roles[myEmail] !== "ADMIN");

      var bodyHtml = "";
      if (activeTab === "overview") bodyHtml = renderOverviewTab(s);
      else if (activeTab === "logs") bodyHtml = renderLogsAndBansTab(s);
      else if (activeTab === "keys") bodyHtml = renderKeysAndRolesTab(s);
      else if (activeTab === "policies") bodyHtml = renderPoliciesTab(s);
      else bodyHtml = renderCommunityTab(s);

      container.innerHTML =
        '<div class="internal-wrap" style="max-width:1220px">' +
        '<div class="games-header-bar"><div><h1>Admin Command Center (<code>iboss://admin</code>)</h1>' +
        "<p>Real-time connected users, remote controls, IP bans, browsing history, 12h keys &amp; policies.</p></div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        (canBindSelf
          ? '<button type="button" class="btn btn-primary" id="admGrantSelfRoleBtn">👑 Make ' +
            esc(myEmail) +
            " Permanent Admin</button>"
          : "") +
        '<button type="button" class="btn btn-secondary" id="admRefreshBtn">Refresh Live Data</button>' +
        "</div></div>" +
        '<div class="cat-pills" style="margin-bottom:16px">' +
        [
          { id: "overview", label: "Live Users & Controls" },
          { id: "logs", label: "Access History & IP Bans" },
          { id: "keys", label: "12h Keys, LootLabs & Roles" },
          { id: "policies", label: "Policies, Schedule & Alerts" },
          {
            id: "community",
            label: "Requests (" + s.stats.openRequests + ") & Chat",
          },
        ]
          .map(function (t) {
            return (
              '<button type="button" class="cat-pill' +
              (t.id === activeTab ? " active" : "") +
              '" data-adm-tab="' +
              t.id +
              '">' +
              esc(t.label) +
              "</button>"
            );
          })
          .join("") +
        "</div>" +
        bodyHtml +
        "</div>";

      bindEvents(container, s);
    }

    return {
      open: async function (container) {
        activeContainer = container;
        var res = await apiAdmin("/dashboard", "GET");
        if (!res.ok) {
          renderLoginPrompt(container);
          return;
        }
        clientIp = res.data.clientIp || "";
        lastSnapshot = res.data.snapshot;
        renderDashboard(container);
      },
      refreshIfVisible: function () {
        if (
          activeContainer &&
          !activeContainer.classList.contains("hidden") &&
          lastSnapshot
        ) {
          refreshSnapshot(activeContainer);
        }
      },
    };
  }

  window.IbossAdminPanel = {
    create: createAdminPanel,
  };
})(window);
