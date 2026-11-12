# Ibossbad

**Hate Iboss? Look no further.**

Ibossbad is a dual-engine stealth web browser and proxy built on an upgraded [Node Unblocker](https://github.com/nfriedly/node-unblocker) backend and a [GUST](https://github.com/nautilus-os/GUST)-inspired **WISP + WebAssembly `libcurl.js`** transport engine. It combines multi-tab browsing, real browser-side TLS 1.3 over WebSockets (`/wisp/`), Acorn AST `location` rewriting for SPAs & games (`neal.fun`, Vite, Next.js, React Router), ad/WebRTC shields, tab cloaking, `about:blank` / `blob:` stealth launching, a Boss/Panic hotkey, passcode/account access protection, and Supabase cloud sync.

---

## Features

- **Dual Proxy Engines (Switchable Anytime)**
  - **WISP + WASM `libcurl` Engine (Default)** — Performs real `libcurl` TLS 1.3 & HTTP/2 handshakes in WebAssembly over a single WebSocket tunnel (`wss://<host>/wisp/` powered by `@mercuryworkshop/wisp-js`, with automatic failover to verified WISP relays), crawls ES module graphs into an `importmap`, AST-rewrites `location` references, and renders inside a sandboxed `blob:` frame with zero direct subresource leaks.
  - **Server Stream (`/proxy/`) Engine** — Upgraded Node Unblocker streaming engine with Brotli (`br`)/gzip/deflate decompression, Acorn AST `location` rewriting (`lib/location-rewriter.js`), reverse-proxy HTTPS header support, Cloudflare loop-header stripping, and per-origin storage isolation.
- **Modern Browser-in-a-Browser UI**
  - Multi-tab browsing with per-tab history, bookmarks bar, live New Tab clock, search engine switcher (DuckDuckGo, Brave, Wikipedia, Google), live WISP latency indicator, Ad/Tracker + WebRTC Shield counter, and a real-time **WISP Network Inspector** drawer.
- **Stealth & Anti-Filter Suite**
  - **Tab Cloaking** — One-click presets for Google Docs, Google Classroom, Google Drive, Canvas, Schoology, Clever, Khan Academy, or custom title & icon.
  - **`about:blank` & `blob:` Launchers** — Open the browser inside an untraceable `about:blank` or `blob:` tab so URLs stay out of browser history.
  - **Boss / Panic Key** — Configurable hotkey (default `` ` ``) that works both in the browser UI and inside proxied game iframes, instantly replacing the tab with your safe URL (default `https://classroom.google.com`).
- **Access Gate & Supabase Cloud Sync**
  - Protect `/`, `/wisp/`, and `/proxy/*` behind a **Passcode** (`PROXY_PASSCODE`) and/or **Supabase Account** login (`public.ibossbad_user_data`).
  - Automatically syncs bookmarks, WISP relay preferences, and stealth settings across devices when signed in.

---

## Quick Start

```bash
npm install
npm start
```

The server listens on `0.0.0.0` at `PORT` (default `8080`).

> **Render Deployment Note:** Both the repository root (`npm start` -> `node server.js`) and `examples/simple` (`npm start` -> `node server.js`) launch the full Ibossbad application (including `/wisp/` and `/proxy/`), so existing Render services configured with either root directory work out of the box.

---

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | Port to bind HTTP, `/wisp/`, & WebSocket proxy server |
| `REQUIRE_AUTH` | `true` | Set to `false` to disable the login/passcode gate |
| `PROXY_PASSCODE` | `ibossbad` | Passcode for quick unlock on the Access Gate |
| `DISABLE_PASSCODE` | `false` | Set to `true` to require Supabase account login only |
| `SESSION_SECRET` | *(auto)* | HMAC secret used to sign `__ibossbad_session` cookies |
| `PROXY_HOST` | *(auto)* | Optional override for redirect host (auto-detected from headers by default) |
| `PROXY_STRICT_SSL` | `false` | Set to `true` to enforce strict upstream certificate verification in `/proxy/` mode |
| `SUPABASE_URL` | *(project URL)* | Supabase project URL for authentication & cloud sync |
| `SUPABASE_ANON_KEY` | *(anon key)* | Supabase public anon/publishable key |

---

## Testing & Linting

```bash
npm test
```

---

## License

Released under the [GNU Affero General Public License v3.0](LICENSE.txt). Originally based on [node-unblocker](https://github.com/nfriedly/node-unblocker) by Nathan Friedly, with WISP/AST proxy techniques inspired by [GUST](https://github.com/nautilus-os/GUST) (AGPL-3.0).
