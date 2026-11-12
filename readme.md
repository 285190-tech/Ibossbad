# Ibossbad — Scramjet + WISP Stealth Web Browser & Proxy

Ibossbad is an all-in-one, school-network-hardened web browser and proxy combining **Mercury Workshop's Scramjet Service-Worker Interception Engine**, **BareMux WASM TLS (`Libcurl` & `Epoxy`)**, **GUST SW-Free Blob WISP Fallback**, and an **Acorn AST Server Stream Engine (`/proxy/`)**, wrapped in a multi-tab stealth browser with **Tab Cloaking**, **about:blank / blob: Launchers**, **Boss/Panic Key**, **Ad/Tracker/WebRTC Shield**, and **Supabase Cloud Sync**.

---

## Triple-Engine Architecture

1. **Scramjet Service-Worker Engine (`@mercuryworkshop/scramjet` — Default)**
   - Registers a root Service Worker (`/sw.js` with `Service-Worker-Allowed: /`) powered by `ScramjetServiceWorker` and `ScramjetController` (`scramjet.wasm.wasm` Rust/OXC rewriter + SW sync XHR).
   - Routes every proxied request, WebSocket, Worker, and media stream through `@mercuryworkshop/bare-mux` over **WISP** using your choice of **Libcurl WASM (`@mercuryworkshop/libcurl-transport` — TLS 1.3 + HTTP/2)** or **Epoxy Rust TLS (`@mercuryworkshop/epoxy-transport`)**.
   - Supports complex modern SPAs and games including **YouTube, Discord, Poki, Neal.fun / Infinite Craft, Google, CAPTCHAs, and WebGL games** with zero domain leaks in network logs.

2. **GUST Blob WISP Engine (Automatic SW-Free Fallback)**
   - If a managed Chromebook or browser context blocks Service Worker registration, Ibossbad **automatically falls back** to its built-in **GUST Blob WISP** engine (`public/wisp-engine.js`), which fetches via `libcurl.js` WASM over WISP and renders inside an isolated `blob:` document with virtual DOM/XHR/Fetch interception.

3. **Server Stream Engine (`/proxy/` — Classic Unblocker + Acorn AST)**
   - Server-side streaming HTTP/WebSocket proxy with Brotli/Zstd/Gzip decompression, Acorn AST `window.location` / `document.location` rewriting (`lib/location-rewriter.js`), `Content-Security-Policy` / `X-Frame-Options` stripping, and per-origin `localStorage`/`sessionStorage` isolation.

4. **Built-in `/wisp/` Server + Multi-Relay Pool Failover**
   - Ships `@mercuryworkshop/wisp-js` directly on the same HTTP/HTTPS port (`/wisp/`) so Render (`wss://ibossbad.onrender.com/wisp/`) requires zero extra ports or external domains, with automatic latency-probed WISP pool failover when needed.

---

## Stealth, Privacy & Cloud Features

- **Multi-Tab Browser UI**: Tabs, omnibox with search-engine switcher (DuckDuckGo, Brave, Google, Wikipedia), Quick Launch cards, bookmarks bar, live **WISP Network Inspector Drawer**, and Ad/Tracker/WebRTC Shield counter.
- **Stealth & Anti-Detection Suite**:
  - **Tab Cloaking** presets (*Google Classroom*, *Google Docs*, *Google Drive*, *Canvas LMS*, *Clever Portal*, *IXL*, *Khan Academy*, or custom title + favicon).
  - **`about:blank` & `blob:` Stealth Launchers** so URL bar & browser history stay clean.
  - **Boss / Panic Hotkey** (default `` ` ``, customizable) — works even while focused inside Scramjet or GUST game iframes.
- **Access Gate + Supabase Cloud Sync**:
  - Unlock via shared **Passcode** (default `ibossbad`, configurable via `ACCESS_CODE`) or **Supabase Email + Password** account (`public.ibossbad_user_data` with Row-Level Security) to sync bookmarks, engine preferences, cloak settings, and panic keys across devices.

---

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:8080` (default passcode: `ibossbad`).

### Environment Variables (Render / Production)

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | HTTP + WebSocket (`/wisp/` & `/proxy/`) listen port |
| `ACCESS_CODE` | `ibossbad` | Shared passcode for quick unlock (`AUTH_REQUIRED=false` disables gate) |
| `SESSION_SECRET` | *(auto)* | HMAC secret for signed HttpOnly session cookies |
| `SUPABASE_URL` | *(configured)* | Supabase project URL for account auth & cloud sync |
| `SUPABASE_ANON_KEY` | *(configured)* | Supabase public anon key (protected by RLS) |

---

## Testing & Linting

```bash
npm run autofix
npm test
```

## License

MIT
