# Ibossbad v9.0 — Scramjet + WISP v1/v2 Stealth Browser, Cine-Cloud OS, Arcade Mirror & Admin Suite

Ibossbad is a self-hosted stealth web browser, cloud gaming & media hub, productivity workspace, and multi-engine proxy combining **Mercury Workshop's Scramjet Service-Worker Engine**, **Protocol-Smart BareMux WASM TLS (`Libcurl` for WISP v1 + `Epoxy` for WISP v2)**, **GUST SW-Free Blob WISP Fallback**, and an **Acorn AST Server Stream Engine (`/proxy/`)** with **In-Memory Brotli/Gzip WASM Caching**, a **120 MB Normalized SW Asset Cache**, **200+ Direct-Mirrored HTML5/WebGL/Flash Games**, **106 AAA PC Cloud Games (`iboss://cinecloud`)**, **EmulatorJS Isolated Retro Lab**, **Focus & Study Launchpad (`iboss://launchpad`)**, and a full **`iboss://admin` Command Center**.

---

## Architecture & Highlights

### 1. Protocol-Smart WISP v1/v2 Transport & Turbo Speed Engine

- **Automatic WISP v1 / WISP v2 Transport Matching**: Automatically pairs `@mercuryworkshop/libcurl-transport` (`WISP v1` HTTP/2 + cached TLS sessions) on `Self-Hosted (/wisp/)` and universal WISP v1 relays, while seamlessly switching BareMux to `@mercuryworkshop/epoxy-transport` (`wisp_v2: true`) whenever a WISP v2 stealth server is selected.
- **Zero-Loop Recovery & Binary WISP Handshake Scanner (`iboss://servers`)**: Verifies real binary WISP stream handshakes across 21+ community and stealth relays without unsolicited background server swapping or reload loops.
- **Pre-Warmed Static Brotli/Gzip + HTTP `ETag`/`304` Cache**: Compresses `.wasm`, `.mjs`, `.js`, `.css`, and `.html` bundles in RAM with immutable headers for V8 WebAssembly native code caching.
- **LRU Memoized WHATWG URL Parser & Keep-Alive Upstream Pools**: Zero legacy `url.parse` deprecations, backed by LIFO keep-alive HTTP/HTTPS socket pools, TLS session ticket caching, and an in-memory TTL DNS cache.
- **120 MB Service Worker Asset Cache (`ibossbad-scramjet-v1`)**: Instant `<5ms` reloads for `.wasm`, `.data`, `.pck`, `.unityweb`, `.swf`, fonts, images, and audio, plus 260+ host O(1) domain-suffix Shield ad/tracker blocking.

### 2. Built-In `iboss://` Internal Hubs

- `iboss://newtab` — **Refurbished Dashboard** with live Session Pulse telemetry, Visual Bento Hub cards, Quick Launch grid, and 1-click Wallpaper Switcher.
- `iboss://games` — **207+ HTML5, Unity WebGL & Ruffle Flash Games** via the `/mgg-games/` direct mirror with **⭐ Favorites**, **🕒 Recently Played**, **🎲 Surprise Me**, game details/cover-source notes, and a reversible hidden-titles filter.
- `iboss://cinecloud` — **Cine-Cloud OS Hub** featuring **106 AAA PC Cloud Titles**, **⭐ Favorites**, **🎲 Surprise Pick**, **Gamepad D-Pad/Stick Navigation**, and **9 Interactive Canvas Particle Modes**.
- `iboss://launchpad` — **Focus & Productivity Launchpad** with a **Pomodoro Study Timer**, **Cloud-Synced Quick Tasks**, and a **Procedural WebAudio Ambient Focus Mixer** (Brown Noise, Soft Rain, Deep Space Drone).
- `iboss://servers` — **Unblocked Server Finder** with live binary WISP v1/v2 round-trip latency benchmarks.
- `iboss://media` — **Ad-Free YouTube / Invidious / Piped Hub** & **Persistent Background Radio Mini-Bar** (auto-paused on Boss Key).
- `iboss://emulator` — **EmulatorJS Retro Console Lab** (NES, SNES, GBA, N64, Sega Genesis, PSX, NDS) inside a dedicated `COOP`/`COEP` `SharedArrayBuffer` sandbox (`/emulator-sandbox`).
- `iboss://tools`, `iboss://extensions`, `iboss://downloads`, `iboss://storage`, `iboss://editor`, `iboss://diagnostics`, `iboss://urls`, `iboss://changelog` & `iboss://admin`.

### 3. Smart Omnibox, Stealth & Multi-Tab Controls

- **Instant Omnibox Math & `!bang` Shortcuts**: Evaluate math expressions live in the address bar dropdown or jump straight to `!yt`, `!wiki`, `!gh`, `!reddit`, `!brave`, `!ddg`, and `!g`.
- **Stealth Controls**: `about:blank` untraceable cloak launcher, customizable Boss-Key school decoys (Google Docs, Desmos, Canvas, Khan Academy), tab title/favicon cloaking, and 10 curated theme presets (including **Cyberpunk Neon**, **Aurora Borealis**, **OLED Pitch Black**, and **Sakura Dusk**).

### 4. Security & `iboss://admin` Command Center

- **Lockdown-Safe Admin Recovery**: Dedicated **👑 Admin** sign-in tab directly on the Access Gate so administrators can always authenticate and toggle Maintenance Lockdown even after kicking active user sessions.
- **Live Room & Policy Controls**: Real-time Mass-Cloak, Broadcast banners, Force-Redirect, Freeze Screen, IP/CIDR bans, Domain Whitelist/Blacklist, 12-hour temporary keys, shareable invite links, and Supabase state persistence.

---

## Quick Start & Environment Configuration

```bash
npm install
npm test
npm start
```

`npm test` also runs the catalog/cover preflight (`npm run check:catalog`). See [`ROADMAP.md`](ROADMAP.md) for the approved 100-item product backlog and phase status.

Configure production credentials via environment variables (never commit live secrets to source control):

| Variable            | Description                                                                             |
| ------------------- | --------------------------------------------------------------------------------------- |
| `PORT`              | HTTP/WebSocket listen port (default `8080`)                                             |
| `PASSCODE`          | Site access gate passcode (set empty string `""` to disable passcode gate)              |
| `ADMIN_PASSWORD`    | Administrator password for `iboss://admin` and Admin Gate recovery                      |
| `SESSION_SECRET`    | HMAC secret used to sign session and admin cookies                                      |
| `ADMIN_EMAILS`      | Optional comma-separated list of Supabase account emails granted permanent `ADMIN` role |
| `SUPABASE_URL`      | Optional Supabase project URL for cloud sync & persistent admin store                   |
| `SUPABASE_ANON_KEY` | Optional Supabase publishable/anon key                                                  |

## License

MIT
