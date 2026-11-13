# Ibossbad v5.0 — Scramjet + WISP Stealth Browser, Command Palette, Media/Emulator Hub, WebOS & Admin Suite

Ibossbad is a flagship stealth web browser, gaming & media hub, WebOS desktop, and proxy combining **Mercury Workshop's Scramjet Service-Worker Interception Engine**, **BareMux WASM TLS (`Libcurl` & `Epoxy`)**, **GUST SW-Free Blob WISP Fallback**, and an **Acorn AST Server Stream Engine (`/proxy/`)** with **200+ Real HTML5/Flash Games**, **EmulatorJS Local ROM Player**, **`Ctrl+K` Universal Command Palette**, **7-Relay WISP Latency Benchmarker**, **Multi-Tab Workspaces**, **Supabase Cloud Sync**, and a full **`iboss://admin` Command Center**.

---

## Core Capabilities

### 1. Triple-Engine Proxy Architecture & Live WISP Benchmarker
- **Scramjet Service-Worker Engine (`@mercuryworkshop/scramjet` — Default)**: Intercepts fetch, XHR, WebSockets, Workers, and media streams over `@mercuryworkshop/bare-mux` (`Libcurl` WASM TLS 1.3 + HTTP/2 or `Epoxy` Rust TLS) with popup catching and automatic WISP pool failover.
- **GUST Blob WISP Engine** & **Server Stream Engine (`/proxy/`)**: Automatic Service-Worker-free fallback plus streaming HTTP/WebSocket proxy with Brotli/Zstd/Gzip decompression and Acorn AST location rewriting.
- **`iboss://diagnostics` — Live 7-Relay WISP Benchmarker**: Concurrent WebSocket RTT latency benchmark across `/wisp/` and all pool relays with **1-Click Auto-Select Fastest Relay** plus Service Worker, JS Heap, Storage Quota & Battery telemetry.

### 2. Universal `Ctrl+K` Command Palette, Smart Omnibox & Power Tab UX
- **`Ctrl+K` / `Cmd+K` Command Palette**: Instant fuzzy launcher across all 200+ games, 15 `iboss://` pages, open tabs, 1-click store mods, theme presets, and stealth actions.
- **Smart Omnibox Autocomplete**: Live dropdown matching `iboss://` pages, saved bookmarks, private local history, and games.
- **Rich Tab Right-Click Context Menu & Pinned Tabs**: Pin/Unpin (`📌`), Duplicate, Mute/Unmute, Sleep Tab (instant RAM release), Pop Out to PiP, Open in `about:blank`, Close Others, Middle-Click to Close, and **`Ctrl+Shift+T` Reopen Closed Tab**.

### 3. Built-In `iboss://` Suite, Media Hub, EmulatorJS & 1-Click Store
- `iboss://games` — **200+ Real Web, WebGL, EaglerCraft & Ruffle Flash Games** with **★ Favorites**, **Recently Played**, **🎲 Surprise Me**, visual cover banners, Gamepad badge & PiP.
- `iboss://media` — **Ad-Free YouTube / Invidious / Piped Smart Bypass**, **Persistent Background Radio Mini-Bar** (auto-paused on Boss Key), and streaming directory.
- `iboss://emulator` — **Retro EmulatorJS Console ROM Player** (`.gba`, `.nds`, `.nes`, `.sfc`, `.z64`, `.gb`, `.md`, `.bin`/`.iso`) with gamepad detection.
- `iboss://store` & `iboss://extensions` — **Eruda Full DevTools**, **16x Video Speed**, **Idle Auto-Clicker**, **Element Zapper**, **Reader Typography**, **Reading Ruler**, and Zinc-compatible **`.zip` extensions** (`JSZip` + `IndexedDB`).
- `iboss://desktop` — **Multi-Window WebOS Desktop Mode** with floating windows, glass dock & terminal.
- `iboss://history` — **Multi-Tab Workspace Snapshots** & private searchable local history.
- `iboss://tools` — Offline **Scratchpad + Word Counter**, **Base64/URL/JWT Codec**, **Cryptographic Password Generator** & **Scientific Math Evaluator**.
- `iboss://downloads`, `iboss://storage`, `iboss://editor`, `iboss://urls`, `iboss://changelog` & `iboss://admin`.

### 4. Multi-Decoy Stealth, 8 Themes & PWA Installability
- **Camouflage FocusLab Front Door** + **4 Boss-Key School Decoy Templates** (*Google Docs*, interactive `<canvas>` *Desmos Graphing Calculator*, *Canvas LMS Quiz*, *Khan Academy*).
- **8 Curated Themes** (*Midnight*, *OLED Black*, *Catppuccin Mocha*, *Tokyo Night*, *Rosé Pine*, *Emerald Matrix*, *Cyberpunk*, *Nord*) + **Custom Color Builder** + standalone **PWA Manifest (`/manifest.webmanifest`)**.

### 5. Security, Permanent Admin Accounts & `iboss://admin` Command Center
- **Permanent Cloud Account Admin Role (`ADMIN` + `ADMIN_EMAILS`)**: Bind your Supabase Cloud Account as permanent `ADMIN` in 1 click inside `iboss://admin` (or via `ADMIN_EMAILS`) to unlock `iboss://admin` automatically on sign-in with a live `👑 Admin · N online` header badge.
- **Live User Controls, Moderation & Audit Trail**: Real-time **Force-Redirect**, **Freeze Screen**, **Direct Popup DM**, **Live Broadcast**, **1-Click Global Mass-Cloak**, **IP & `/24` CIDR Bans**, **Domain Blacklist/Whitelist**, **12h Keys + LootLabs**, **Shareable `/?invite=INV-...` Links**, **Login MOTD**, **Live Chat Polls**, **Chat Slow-Mode & Blocked-Word Filter**, and **Admin Security Audit Trail** — persisted to Supabase.

---

## Quick Start & Testing

```bash
npm install
npm test
npm start
```

- **Browser URL**: `http://localhost:8080` (default passcode: `ibossbad`)
- **Admin Command Center**: `iboss://admin` (default `ADMIN_PASSWORD`: `ibossadmin`, or bind your email via `ADMIN_EMAILS` / 1-click inside `iboss://admin`).

## License

MIT
