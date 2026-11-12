# Ibossbad v4.0 — Scramjet + WISP Stealth Browser, Media & EmulatorJS Hub, WebOS Desktop & Admin v2

Ibossbad is an all-in-one stealth web browser, media & retro gaming hub, WebOS desktop, and proxy combining **Mercury Workshop's Scramjet Service-Worker Interception Engine**, **BareMux WASM TLS (`Libcurl` & `Epoxy`)**, **GUST SW-Free Blob WISP Fallback**, and an **Acorn AST Server Stream Engine (`/proxy/`)** with **200+ Real HTML5/Flash Games**, **EmulatorJS Local ROM Player**, **Ad-Free YouTube & Background Radio**, **1-Click Mod/DevTools Store**, **Multi-Decoy Stealth**, **Supabase Cloud Sync**, and a full **`iboss://admin` Command Center**.

---

## Core Capabilities

### 1. Triple-Engine Proxy Architecture
- **Scramjet Service-Worker Engine (`@mercuryworkshop/scramjet` — Default)**: Intercepts fetch, XHR, WebSockets, Workers, and media streams over `@mercuryworkshop/bare-mux` (`Libcurl` WASM TLS 1.3 + HTTP/2 or `Epoxy` Rust TLS) with popup catching and automatic WISP pool failover (`wss://pgis-wisp.joytree.site/`, DefinitelyScience, MercuryWorkshop, Terbium, etc.).
- **GUST Blob WISP Engine**: Automatic Service-Worker-free fallback (`public/wisp-engine.js`).
- **Server Stream Engine (`/proxy/`)**: Streaming HTTP/WebSocket proxy with Brotli/Zstd/Gzip decompression and Acorn AST location rewriting.

### 2. Built-In `iboss://` Pages, Media Hub, EmulatorJS & 1-Click Store
- `iboss://newtab` — New Tab dashboard with particle starfield, Quick Launch & bookmarks.
- `iboss://games` — **200+ Real Web, WebGL, EaglerCraft & Ruffle Flash Games** with **★ Favorites**, **Recently Played**, visual cover headers, Gamepad detection badge, Floating Mini-Window (PiP), and Game Request inbox.
- `iboss://media` — **Ad-Free YouTube / Invidious / Piped Smart Bypass**, **Persistent Background Radio Mini-Bar** (*Lofi Beats*, *Synthwave*, *Ambient Study*, *Chiptune* — auto-paused on Boss Key), and streaming directory (*Twitch*, *SoundCloud*, *Cobalt*, *Pluto TV*, *Hyperbeam*).
- `iboss://emulator` — **Retro EmulatorJS Console ROM Player** supporting local `.gba`, `.nds`, `.nes`, `.sfc`/`.smc`, `.z64`/`.n64`, `.gb`/`.gbc`, `.md`/`.gen`, and `.bin`/`.iso` ROMs with hardware gamepad support & save backup.
- `iboss://store` — **1-Click Mod & Bookmarklet Store**: **Eruda Full DevTools** (Elements, Console, Network, Storage), **Video Speed Controller (`0.25x–16x`)**, **Idle-Game Auto-Clicker**, **Page Element Zapper**, **Clean Reader Typography**, and **Focus Reading Ruler** (run immediately or auto-inject on page load).
- `iboss://extensions` — Install Zinc-compatible **`.zip` extensions** (`JSZip` + `IndexedDB` `manifest.json`), **Live FPS Counter HUD**, **Force Dark Mode**, and **Custom CSS/JS Userscripts**.
- `iboss://desktop` — **Terbium / Anura-Style Multi-Window WebOS Desktop Mode** with draggable/resizable/maximizable floating windows, glass dock, and built-in terminal.
- `iboss://downloads` — **Safe-Filename Proxy File Downloader** (`/api/safe-download` with private/loopback IP SSRF protection & domain policy enforcement).
- `iboss://storage` — Inspect `localStorage`, export/import `.json` game saves, and sync game progress to **Supabase Cloud**.
- `iboss://editor`, `iboss://urls`, `iboss://changelog` & `iboss://admin`.

### 3. Stealth v2, Multi-Decoys, Pinned Tabs & Chromebook Performance
- **Camouflage Study-App Front Door** (*FocusLab Pomodoro Timer + Calculator*) — unlock via Study Room Code, `Ctrl+Shift+U`, or triple-clicking the footer version.
- **4 Boss-Key School Decoy Templates**: Single-press `` ` `` covers the screen & mutes/pauses all tab & radio audio without losing game progress — choose **Google Docs**, **Desmos Graphing Calculator** (live interactive `<canvas>` curve plotter), **Canvas LMS Quiz**, or **Khan Academy Lesson**; double-press `` ` `` performs an emergency redirect.
- **Pinned Tabs**, **`Ctrl+Shift+T` / `Alt+Shift+T` Reopen Closed Tab**, **Split-Screen Dual-Tab View**, **Draggable PiP Mini-Window**, **Per-Tab Mute**, **Auto-Cloak on Tab Switch**, **Anti-Close Guard**, **`about:blank` & `blob:` Launchers**, and **Chromebook RAM Saver**.

### 4. Security, Invite Links, Polls & `iboss://admin` Command Center
- **Passcode-Locked Cloud Accounts**: Both Passcode/Key unlock and Supabase Cloud Account sign-in/sign-up enforce the active `PROXY_PASSCODE` (or a valid temporary key / invite link).
- **Shareable 1-Click Invite Links (`/?invite=INV-...`)**: Generate max-click/duration-limited share links that unlock the browser without revealing your master passcode.
- **Login MOTD Announcement Modal & Live Instance Chat Polls**: Publish "What's New" popups and launch real-time voting polls directly inside Instance Chat.
- **Live Connected Users, IP Bans & Domain Policies**: Real-time **Force-Redirect**, **Freeze Screen**, **Direct Popup DM**, **Live Broadcast**, **1-Click Global Mass-Cloak**, **IP & `/24` CIDR Bans**, **Domain Blacklist/Whitelist**, **12h Keys + LootLabs Hook**, **VIP/MOD Roles**, and **Discord Webhook Alerts** — persisted to Supabase.

---

## Quick Start

```bash
npm install
npm start
```

- **Browser URL**: `http://localhost:8080` (default passcode: `ibossbad`)
- **Admin Command Center**: Open `iboss://admin` in the address bar or click the lock icon in the toolbar (default `ADMIN_PASSWORD`: `ibossadmin` — rotatable live inside `iboss://admin`).

## Testing & Linting

```bash
npm test
```

## License

MIT
