# Ibossbad v3.0 — Scramjet + WISP Stealth Browser, 200+ Games Hub & Admin Command Center

Ibossbad is an all-in-one stealth web browser, game hub, and proxy combining **Mercury Workshop's Scramjet Service-Worker Interception Engine**, **BareMux WASM TLS (`Libcurl` & `Epoxy`)**, **GUST SW-Free Blob WISP Fallback**, and an **Acorn AST Server Stream Engine (`/proxy/`)** with **200+ Real HTML5/Flash Games**, **`.zip` Browser Extensions**, **Stealth v2**, **Supabase Cloud Sync**, and a full **`iboss://admin` Command Center**.

---

## Core Capabilities

### 1. Triple-Engine Proxy Architecture
- **Scramjet Service-Worker Engine (`@mercuryworkshop/scramjet` — Default)**: Intercepts fetch, XHR, WebSockets, Workers, and media streams over `@mercuryworkshop/bare-mux` (`Libcurl` WASM TLS 1.3 + HTTP/2 or `Epoxy` Rust TLS) with popup catching and automatic WISP pool failover (`wss://pgis-wisp.joytree.site/`, DefinitelyScience, MercuryWorkshop, etc.).
- **GUST Blob WISP Engine**: Automatic Service-Worker-free fallback (`public/wisp-engine.js`).
- **Server Stream Engine (`/proxy/`)**: Streaming HTTP/WebSocket proxy with Brotli/Zstd/Gzip decompression and Acorn AST location rewriting.

### 2. Internal `iboss://` Protocol Pages & `.zip` Extensions
- `iboss://newtab` — New Tab dashboard with particle starfield, Quick Launch & bookmarks.
- `iboss://games` — **200+ Real Web, WebGL, EaglerCraft & Ruffle Flash Games** with search aliases, category filters, Floating Mini-Window (PiP), and Game Request inbox.
- `iboss://extensions` — Install Zinc-compatible **`.zip` extensions** (`JSZip` + `IndexedDB` `manifest.json`) or toggle **Live FPS Counter HUD**, **Force Dark Mode**, and **Custom CSS/JS Userscripts**.
- `iboss://storage` — Inspect `localStorage`, export/import `.json` game saves, and sync game progress to **Supabase Cloud**.
- `iboss://editor` — Live HTML/CSS/JS code playground with `blob:` pop-out.
- `iboss://urls` & `iboss://changelog` — Directory of built-in pages & release notes.
- `iboss://admin` — Instance Owner **Admin Command Center**.
- **`javascript:` Omnibox Support** + **Unblocked DevTools Console & DOM Inspector Drawer**.

### 3. Stealth v2, Themes & Chromebook Performance
- **Camouflage Study-App Front Door** (*FocusLab Pomodoro Timer + Calculator*) — unlock via Study Room Code, `Ctrl+Shift+U`, or triple-clicking the footer version.
- **Boss-Key Google Docs Decoy Overlay**: Single-press `` ` `` covers the screen with an editable AP History Google Doc & mutes all tabs without losing game progress; double-press `` ` `` performs an emergency redirect.
- **Auto-Cloak on Tab Switch**, **Anti-Close Guard (`beforeunload`)**, **`about:blank` & `blob:` Launchers**, **Split-Screen Dual-Tab View**, **Draggable PiP Mini-Window**, **Per-Tab Mute**, and **Chromebook RAM Saver** (auto-sleeps idle background tabs + auto-restores open tabs).
- **Preset Themes** (*Midnight*, *OLED Black*, *Catppuccin Mocha*, *Cyberpunk*, *Nord*) + **Granular Color-Picker Theme Builder** & **Custom Keyboard Shortcuts**.

### 4. Security, 12h Keys & `iboss://admin` Command Center
- **Passcode-Locked Cloud Accounts**: Both Passcode/Key unlock and Supabase Cloud Account sign-in/sign-up enforce the active `PROXY_PASSCODE` (or a valid 12h temporary key).
- **Live Connected Users & Remote Controls**: View online users in real time and trigger **Force-Redirect**, **Freeze/Pause Screen**, **Direct Popup DM**, **Live Broadcast Banner**, or **1-Click "Teacher Walked In" Global Mass-Cloak**.
- **Access History, IP Bans & Domain Policies**: Filterable per-IP/per-user browsing history (with CSV/JSON export), 1-click **IP & `/24` CIDR Ban/Unban** (with self-ban protection & brute-force auto-ban), **Domain Blacklist**, **Whitelist-Only Mode**, **Per-User/IP Rules**, **Time-of-Day Schedules**, **12h/24h/7d Key Generator + LootLabs Hook**, **VIP/MOD Roles**, **Moderated Instance Chat (`[ADMIN]` badge)**, and **Discord Webhook Alerts** — persisted to Supabase.

---

## Quick Start

```bash
npm install
npm start
```

- **Browser URL**: `http://localhost:8080` (default passcode: `ibossbad`)
- **Admin Command Center**: Open `iboss://admin` in the address bar or click the lock icon in the toolbar (default `ADMIN_PASSWORD`: `ibossadmin` — rotatable live inside `iboss://admin`).

### Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | HTTP + WebSocket (`/wisp/` & `/proxy/`) listen port |
| `PROXY_PASSCODE` | `ibossbad` | Shared passcode required for access & account sign-in (`DISABLE_PASSCODE=true` disables) |
| `ADMIN_PASSWORD` | `ibossadmin` | Password for `iboss://admin` Command Center |
| `SESSION_SECRET` | *(auto)* | HMAC secret for signed HttpOnly session cookies |
| `SUPABASE_URL` | *(configured)* | Supabase project URL for account auth, saves & admin persistence |
| `SUPABASE_ANON_KEY` | *(configured)* | Supabase anon key (protected by RLS & `SECURITY DEFINER` RPCs) |

---

## Testing & Linting

```bash
npm test
```

## License

MIT
