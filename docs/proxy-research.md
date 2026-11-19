# Proxy research brief: types, protocols, browser proxies, security, performance, and Ibossbad

**Research snapshot:** 12 November 2026
**Scope:** A broad, project-oriented survey of proxies. This is research and code-path review, not a proxy implementation, penetration test, or legal opinion. No proxy code was changed for this report.

**Follow-up implementation status (12 November 2026):** Subsequent changes in this working tree now verify origin TLS certificates by default on the legacy `/proxy/` path (with an explicit `PROXY_STRICT_SSL=false` compatibility opt-out), cap Wisp streams per WebSocket (defaults: 256 total and 64 per host, configurable), and restrict the app's default Node-side `/proxy/`, safe-download, and external game-check requests to public unicast IP addresses. DNS answers are filtered and the selected address is pinned for the request. The findings below describe the original research snapshot; custom agents and the explicit `allowPrivateProxyTargets` option can bypass the `/proxy/` egress guard, and the app still cannot enforce destination policy on external Wisp relays.

## Executive takeaways

1. **“Proxy” describes an intermediary, not a privacy guarantee.** A proxy may forward requests, tunnel bytes, rewrite pages, front an origin, or intercept traffic. Who selects it, what it can see, and whether TLS ends at it matter more than the label.
2. **HTTP CONNECT, SOCKS5, and Wisp solve different transport problems.** CONNECT is an HTTP request that can establish a tunnel; SOCKS5 is a general TCP/UDP proxy protocol; Wisp carries multiple TCP/optional UDP streams over one WebSocket. None, by itself, guarantees end-to-end encryption.
3. **A browser web proxy is more than a network relay.** It must also keep navigation, scripts, CSS, workers, cookies, redirects, and security policies working through a browser-visible origin. A service worker is scoped to a secure web origin; it is not a system VPN.
4. **The proxy operator is a trust point.** HTTPS to the destination can hide page contents from a relay that only forwards TCP, but the relay still sees the client connection and destination metadata. Plain HTTP can be read or modified by intermediaries.
5. **Open-proxy research is grim, but bounded.** Large studies of public free-proxy lists found poor availability and observed content tampering, TLS interception, and malware delivery. Those results do not prove that any particular Ibossbad-listed Wisp relay is malicious; they do mean “it connected” is not a trust check.
6. **The research snapshot exposed high-priority TLS and egress gaps in the legacy `/proxy/` route:** the original HTTPS agent accepted invalid origin certificates by default, and Node-side proxy requests did not filter resolved destination IPs. The follow-up now verifies origin TLS, filters and pins public DNS results on the app's default server-side proxy/download checks, and bounds Wisp streams; external-relay enforcement, custom-agent opt-outs, and trusted-ingress/client-IP questions remain.
7. **The server finder’s “handshake ping” needs a correctness pass, and Wisp v2 compatibility is not yet established.** The probe requests no WebSocket subprotocol, tests a loopback destination, and treats any packet with the chosen stream ID as success—even a Wisp `CLOSE` packet. The Scramjet runtime does route relays classified as v2 through Epoxy with `wisp_v2: true`, but current tests do not verify a live v2 negotiation or an Epoxy-to-origin request.

### Evidence categories and limits

- **Standards and official guidance** define protocol behavior and security practices; they do not certify this implementation or its deployment ([1]–[15], [25]–[27], [37]–[38]). RFC requirements apply to conforming implementations, not automatically to every relay.
- **Academic measurements** report results from their sampled public/free-proxy ecosystems and study periods ([22]–[24]). They provide context for risk and availability, not a measurement of Ibossbad’s named relays.
- **Upstream project documentation** describes intended protocol, package, or transport behavior ([16]–[21]). It is useful primary-source material but is not an independent security audit or service-level guarantee.
- **Commercial/vendor explainers** ([28]–[36]) are cited for taxonomy and operational examples only. Their descriptions of their own features or products are not independent proof of privacy, safety, uptime, location accuracy, or performance.
- **Vendor/operator marketing claims** about “no logs,” anonymity, speeds, residential IPs, or unblock rates are not used here as verified facts. No commercial-provider ranking is attempted; claims require scope, reproducible methodology, and independent evidence.

---

## 1. First pin down what “proxy” means

A proxy is an intermediary in a communication path. The useful classification axes are **role**, **layer**, **visibility**, and **deployment**—not one mutually exclusive list.

| Term | What it means | What it does *not* imply |
|---|---|---|
| **Forward proxy** | Acts on behalf of a client to reach destinations selected by that client. A typical explicit HTTP proxy is configured in the client or application. | It is not automatically anonymous, encrypted, or safe. The proxy operator may see traffic and metadata. |
| **Reverse proxy / gateway** | Sits in front of one or more origin servers; it accepts requests as the apparent server and forwards them inward. Common uses include TLS termination, caching, load balancing, and access control. | It is not ordinarily a client-privacy relay. “Reverse” describes its relationship to the origins. |
| **Transparent / intercepting proxy** | A deployment in which traffic is redirected or intercepted without the client explicitly selecting a proxy. “Transparent” describes how it is deployed or observed, not whether it is a forward or reverse proxy. | It does not mean invisible, harmless, or content-blind. Interception can alter or terminate TLS if clients trust the intercepting CA. |
| **HTTP application proxy** | Understands HTTP requests and responses and can inspect or transform headers and bodies. | It may not support arbitrary TCP applications or non-HTTP protocols. |
| **Tunnel / transport proxy** | Creates a byte stream or datagram path to a destination, often without parsing the inner application protocol. | The outer tunnel’s encryption does not automatically encrypt the inner data all the way to the origin. |
| **Web/content proxy** | Rewrites or serves remote web pages under the proxy’s own browser origin. | It is not just a CONNECT tunnel: it must manage URL rewriting, cookies, redirects, CSP, CORS, and browser APIs. |
| **Datacenter / ISP / residential / mobile proxy** | Describes the network or address type used for egress, often for geolocation or reputation. | It says little about the protocol, operator trust, consent, or privacy controls. “Residential” is not a security certification. |
| **VPN** | Usually tunnels IP packets at the network layer, so many applications can use it without per-site content rewriting. | A VPN provider still sees metadata and may see plaintext traffic that is not protected end-to-end. A browser tab proxy is not a VPN. |

The HTTP standard’s terminology is useful: a proxy is generally selected by the client; a gateway/reverse proxy acts as the apparent origin on the client-facing connection; a tunnel forwards bytes without participating in the tunneled application exchange [1]. MDN provides a practical overview of forward/reverse proxy roles, forwarding headers, CONNECT, and browser proxy configuration [27]. Cloudflare’s reverse-proxy overview describes common edge roles such as load balancing, TLS handling, and caching; that is explanatory provider material, not a standard [35].

### Exit-network and session labels

Datacenter, ISP/static-residential, residential, and mobile describe the egress network or address classification—not the proxy protocol. These are practical industry labels, not a single strict taxonomy; commercial providers use them with some variation [31, 32].

- **Datacenter:** the address is associated with a hosting or cloud network.
- **ISP / static residential:** the range is registered to an internet provider, but the proxy may run on hosted infrastructure rather than a consumer device. “ISP” does not prove a residential endpoint.
- **Residential:** egress is associated with a home-broadband connection; how the provider sources and obtains consent for those connections is a separate question.
- **Mobile:** egress uses a cellular-carrier network, often with carrier-grade NAT and shared or changing addresses. A carrier ASN alone may not distinguish mobile access from fixed broadband.

ASN and WHOIS data can identify the announced network, registry, or organization; they do not identify the person/device currently using an address, prove that a particular request is proxied, or establish consent. IP-intelligence databases may add proxy flags, confidence scores, and last-seen timestamps, but those fields are provider-specific observations—not a standard or proof of trust [32]. Avoid repeating commercial speed, success-rate, or pool-size claims without independent methodology.

**Rotation and sticky sessions are separate from IP type.** A rotating service changes the exit address by request, interval, or session; a sticky service attempts to keep one exit for a configured period. These behaviors and guarantees vary by provider [30, 31]. Sticky egress does not preserve browser cookies, login state, tabs, or application sessions—those live in separate layers. For an authorized multi-step workflow, keep a stable route while state continuity matters; rotate only at a safe boundary between independent tasks, and do not use rotation to evade access controls or rate limits.

### “Proxy for AI” is an overloaded label

Classify the actual connection path rather than relying on the product name. A web proxy and an LLM gateway can both be called an “AI proxy,” but they handle different traffic [29, 36].

| Layer | Traffic path | Main job | It does not automatically do |
|---|---|---|---|
| **Web forward proxy** | Agent’s HTTP client, crawler, or browser → website | Routes target-facing web traffic through a chosen network exit | Select a model, render pages, parse content, or preserve browser state |
| **LLM proxy / AI gateway** | Application → model provider | Forwards model API calls; depending on the product, may centralize credentials, route/fail over between providers, enforce budgets, or record usage [36] | Route the agent’s separate browser requests through a residential/mobile IP |
| **Corporate egress proxy** | Employee or agent workload → internal/public resources | Applies organization-level routing and egress policy | Make returned web content safe for an LLM |
| **Scraping API / hosted browser** | Application → retrieval service or remote browser | May fetch, render, interact with, or extract a page | Give the customer direct control of the underlying proxy connection |
| **MCP server / proxy-control tool** | AI application → discoverable tools and resources | Exposes operations that an AI application may call; a provider may offer proxy management or web retrieval tools [29, 37] | Create a raw network tunnel by itself or grant permission to access a target |

MCP is a tool/context integration protocol, not a proxy transport. An agent may call an MCP tool that manages a proxy or invokes a browser, but the underlying network request is still made by the relevant HTTP client, browser, or service [37]. Vendor guides are useful examples of bundled products, not independent proof of privacy, compliance, or performance [29, 30].

### Questions to answer before choosing a design

- Is the goal to **reach a site through a different egress network**, to **hide the client’s IP from an origin**, to **make a browser page work despite CORS**, to **cache**, or to **enforce policy**? Those goals overlap but are not the same.
- Is the proxy allowed to inspect content, or must content remain confidential from the relay operator?
- Are destinations arbitrary public sites, or a known allowlist? This changes the SSRF control strategy.
- Does the user need a single web page in a tab, arbitrary browser networking, or system-wide traffic? A browser rewriter is appropriate only for the first category.
- Is there a policy/legal authorization to use the proxy on the client network? A proxy changes routing; it does not grant permission to evade an administrator’s rules.

---

## 2. Protocols and how they differ

### HTTP forwarding and CONNECT

For ordinary HTTP through a forward proxy, the client normally sends the target URI in absolute form; the proxy makes a request to that origin. The proxy can read and alter the HTTP request and response because it is the HTTP endpoint for that hop [1, 2].

For HTTPS, clients commonly use **CONNECT** to ask the proxy to open a TCP tunnel to `host:port`. After a successful response, the proxy relays bytes between the client-facing connection and a separate upstream TCP connection (for HTTP/1); the browser then performs TLS with the destination through that tunnel [28]. CONNECT is **not itself encryption**: it creates the path over which TLS may run. If end-to-end TLS is correctly verified, a blind tunnel proxy normally sees connection metadata and encrypted records, not the protected HTTP body. An explicit TLS-intercepting proxy is different: it terminates one TLS session and creates another, and must be trusted by the client to do so.

CONNECT is also an abuse surface. RFC 9110 specifically warns about tunneling to arbitrary or reserved ports and recommends restricting CONNECT to known ports or safe targets [1]. HTTP/2 and HTTP/3 express CONNECT differently, but keep the same core tunnel purpose [3, 4].

A browser’s **Proxy Auto-Configuration (PAC)** file is client-side route-selection logic: it can choose `DIRECT`, HTTP, or SOCKS proxy settings for a URL. It does not implement the proxy, create a tunnel, or add encryption by itself [27].

**Proxy TLS has two separate meanings:** `https://proxy.example` can encrypt the client-to-proxy hop; `https://origin.example` can encrypt the client-to-origin session inside a tunnel. Protecting only the first hop does not stop the proxy operator from reading plaintext that reaches the proxy, nor does it prove the origin certificate is valid.

### SOCKS5

SOCKS5 is a general proxy protocol, commonly on TCP port 1080. It negotiates an authentication method, then supports TCP `CONNECT`, the older `BIND` command, and `UDP ASSOCIATE`. Address types include IPv4, IPv6, and a domain name [5].

Important caveats:

- SOCKS5 is **not an encryption protocol**. The protocol negotiates authentication; the selected method and any additional protection determine what is protected. Username/password authentication is specified separately [6] and should not be treated as a confidential tunnel by itself.
- DNS can happen locally or at the proxy, depending on the client/library and whether it sends an address literal or a domain name. Remote resolution can reduce local DNS disclosure, but it makes the proxy’s resolver and egress policy part of the trust boundary.
- UDP support is an actual feature/implementation choice, not something to assume from “SOCKS5-compatible.” UDP relay behavior and failures differ from TCP.

### Wisp over WebSocket

Wisp is a project-specific protocol (not an IETF proxy standard) for multiplexing multiple TCP and optional UDP sockets over a single WebSocket [16, 17]. A stream-opening message names the destination host and port; the relay opens the socket and carries data frames. The Wisp protocol defines flow-control behavior so senders do not buffer without bound.

The current upstream Wisp v2 specification adds an INFO/extension handshake; extensions can include UDP capability, password or key authentication, and a server message. **These features are optional extensions, not automatic properties of every Wisp v2 server.** The v2 specification selects v2 by the presence of a `Sec-WebSocket-Protocol` header; without it, a compatible server behaves as a v1 server [17].

Crucially, Wisp and its WebSocket are transport layers:

- **`wss://`** encrypts/authenticates the browser-to-WebSocket-relay connection. The relay terminates that TLS session and can see the Wisp destination and traffic timing/volume.
- **Inner HTTPS/TLS** can protect the application payload from the relay when TLS is initiated by the client transport and the origin certificate is verified. The relay still sees the destination it was asked to connect to and metadata.
- **Plain HTTP over Wisp** is readable and modifiable by the relay operator unless a separate end-to-end protection layer is used.
- Wisp does not rewrite HTML, emulate cookies, or bypass browser CORS by itself. A separate web-proxy engine must do that.

### Other useful comparisons

- **BareMux is a transport manager, not the proxy protocol itself.** It lets the browser proxy switch transport implementations. In this checkout it selects a libcurl or Epoxy transport; Wisp is a possible underlying socket path. The installed `bare-mux` README says the project is deprecated/archived and points users toward `proxy-transports` [21]. That is a maintenance consideration, not proof of a current exploit.
- **QUIC** is a secure, multiplexed transport with independent streams and flow control [8]. It is not what a standard WebSocket/Wisp connection becomes simply because both can carry multiple logical streams. In the usual WebSocket-over-TCP setup, packet loss on the shared outer TCP connection can delay all Wisp traffic on it; QUIC’s stream model avoids cross-stream head-of-line blocking for losses that affect only another stream.
- **MASQUE CONNECT-UDP** is an IETF-standardized way to proxy UDP over HTTP [9]. It is a useful comparison point for future transport research, but is not the current Ibossbad transport and still needs server policy, authentication, and egress controls.
- **Tor** is a multi-hop anonymity network, not a generic synonym for “proxy.” Multi-hop routing changes who can associate source and destination, but does not make plaintext safe at the exit. Ordinary one-hop proxies should not claim Tor-like anonymity.
- **Oblivious DoH** is a narrow privacy protocol for DNS, not a full web proxy: it separates client IP knowledge from DNS query plaintext across proxy and resolver roles [10].

---

## 3. How a browser-based web proxy works

A browser enforces the same-origin policy and CORS. A service worker can intercept requests made by pages it controls, but it is registered for a particular origin and path scope, and requires a secure context (HTTPS; localhost is generally allowed for development) [11, 12]. This makes a service worker useful as an in-browser request broker; it does **not** make the browser a system-level router or VPN.

A typical interception proxy has two distinct flows:

```text
User enters origin URL
    -> proxy UI creates a same-origin proxy URL
    -> service worker intercepts controlled requests
    -> proxy transport fetches the remote resource
    -> rewriter updates HTML / CSS / JS / headers / cookies / redirects
    -> browser receives a response under the proxy origin
    -> later subresources repeat the cycle
```

The transport may be an HTTP server, CONNECT tunnel, Bare protocol backend, Wisp server, or another relay. The rewriter is the browser-compatibility engine. The Scramjet project describes its own design as interception + rewriting + sandboxing [18]; those are separate from its Wisp-capable transports [19, 20].

A browser rewriter must account for more than literal `href` and `src` attributes:

- relative URLs, `<base>`, CSS `url()` and `@import`, `srcset`, forms, redirects, and meta refresh;
- JavaScript location references, `fetch`, XHR, dynamic imports, workers, and WebSockets;
- cookie domains/paths, `SameSite`, `Secure`, per-destination cookie/storage isolation;
- CORS response headers, CSP, CORP/COEP, HSTS, framing policy, and integrity metadata;
- browser APIs that can establish their own connections (including WebRTC and APIs not represented as ordinary page fetches).

A proxy often has to transform or replace some upstream headers to make pages render under its origin. That can be necessary for compatibility, but it is security-sensitive: the page is no longer executing under the origin that authored it. Keep untrusted proxied content isolated from the application shell and its cookies, storage, admin APIs, and credentials. Test direct-network escape paths instead of assuming every browser API is intercepted.

**CORS is not “turned off” by a magic proxy header.** A proxy can fetch content server-side and re-serve it under the application’s origin, or rewrite content and responses, so the browser sees a different origin relationship. That is an architectural mediation of access; the browser still enforces its own rules at the proxy origin [13].

---

## 4. Security and trust: the practical model

### What each party can learn

| Party | Commonly visible information |
|---|---|
| User’s local network / ISP | The user’s IP and the first proxy/relay endpoint; timing and volume. With `wss`, normally not the Wisp frames or inner HTTPS content. |
| Forward proxy / Wisp relay | The user’s network address, the requested host/port (for Wisp/CONNECT), connection timing/volume, and any plaintext it terminates or forwards. It can read/alter plain HTTP. |
| Origin website | The relay’s egress IP, the HTTP request and plaintext application content after TLS termination at the origin, cookies/login state, and identifying browser/request headers. A proxy does not erase account identity or browser fingerprinting. |
| Browser-proxy operator | For a server-side HTTP fetcher, the proxy server handles the HTTP request and response. For a blind Wisp TCP relay with verified inner TLS, the operator has less content visibility, but still has connection metadata. |
| Public relay pool / CDN | Depends on whether it only transports encrypted data or terminates/rewrites it. A domain label, “CDN” label, successful WebSocket, or low latency is not an audit of the operator. |

`Forwarded`, `X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto` are request-chain metadata, not authentication. A reverse proxy should overwrite or safely append them, and an application should trust them only from known ingress proxies [27, 34].

### SSRF and destination control

Any server that fetches a user-controlled URL is an SSRF boundary. For a constrained fetch feature, OWASP prefers allowlisting known destinations. A general-purpose web proxy cannot usually know all legitimate domains in advance, so it needs robust destination filtering and infrastructure isolation instead. OWASP guidance includes strict scheme/URL parsing, IPv4 and IPv6 special/private/link-local/loopback protections, DNS-rebinding/TOCTOU handling, redirect revalidation, and network-layer egress controls [14, 15].

A defensible arbitrary-web destination policy should, at minimum:

1. Parse with a maintained URL implementation; permit only intended schemes (normally `http:`/`https:`); reject malformed authority, userinfo ambiguity, and unexpected ports.
2. Resolve A and AAAA records, classify **every** candidate address, and connect to a validated address rather than performing an unchecked second lookup. Include IPv4-mapped IPv6 and special-purpose ranges; use the IANA special-purpose registries rather than a short hand-written “private IP” list.
3. Reapply policy to every redirect and retry. An allowed public URL can redirect to a disallowed target.
4. Enforce egress rules outside the application too. A bug in application parsing should not provide a route to localhost, private network services, link-local metadata, or internal control planes.
5. Bound connection count, open streams, idle duration, bytes, bandwidth, and request time; log policy blocks without logging secrets or full sensitive bodies.

### TLS and credentials

TLS provides confidentiality and integrity between its TLS endpoints and authenticates the server only when the client verifies the certificate chain and hostname [7]. If a relay merely forwards TLS records, it should not be able to read the HTTP body. If the proxy process itself makes the HTTPS request, the proxy is the TLS client; certificate verification at that process is essential. If verification is disabled, the socket may still be encrypted, but a man-in-the-middle can impersonate the origin.

Do not mix up:

- **proxy authentication** (who may use the intermediary);
- **origin authentication** (the user’s account at the website);
- **TLS server authentication** (whether the remote endpoint is really the intended host);
- **Wisp/WebSocket authentication** (whether the relay accepts this stream session).

A WebSocket endpoint on `wss://` authenticates the TLS endpoint for that hostname; it does not certify that the relay is honest, private, or safe. Wisp v2 authentication extensions are optional; an application’s session/cookie check may be the actual access gate.

### Free/open proxy trust evidence

Three academic measurements are especially relevant, with an important limitation: they study publicly listed free/open proxy ecosystems, not this project’s particular community Wisp servers.

- The 2018 ACSAC study tested more than 107,000 listed proxies over 13 million requests in a 50-day period and found over 92% unresponsive or unavailable. It also documented HTML manipulation, TLS man-in-the-middle behavior, and fetched binaries modified to include malware [22].
- The 2019 longitudinal ecosystem study reported that under 2% of proxies advertised on the web actually proxied traffic on behalf of users. It observed malicious behavior on roughly 5–10% of active proxies on a typical day, including ad injection, TLS interception, and cryptojacking [23].
- A 30-month study collected 640,693 free proxies from 11 providers: 34.5% worked at least once during the whole study, while the average daily verified-working fraction was 3.36%; 16,923 distinct proxies altered test content at least once [24]. “Active at least once over 30 months” is not the same as likely to work today.

These are strong reasons to avoid random public proxy lists and to treat all community relays as untrusted transport until proven otherwise. They are **not evidence that any named relay in Ibossbad is malicious**.

---

## 5. Performance: measure the whole request, not a “ping” badge

A proxy adds extra legs, handshakes, buffering, policy checks, rewriting, and sometimes a longer route to the origin. No protocol name or vendor speed claim predicts end-user page speed by itself.

### Break latency into stages

For a browser-to-Wisp-to-HTTPS-origin request, measure separately where possible:

1. Browser DNS / connection to relay, TLS and WebSocket upgrade.
2. Wisp v1/v2 handshake and any authentication/extension negotiation.
3. Relay DNS and TCP connect to the destination.
4. Origin TLS handshake and certificate validation.
5. Time to first byte (TTFB), response transfer time, and total body size.
6. Rewriter and service-worker processing time; cache hit/miss; page-level completion.
7. Success rate, timeout rate, failover, and retry count.

Report **p50, p95, and p99** plus success rate—not just the best sample. Compare cold and warm sessions separately; test same-origin connection reuse, concurrency, fixed-size objects, and realistic page waterfalls. Record location and test time, because relay location/load and internet routing vary. A controlled endpoint that returns a known body is safer and more repeatable than probing arbitrary third-party hosts.

Use `performance.now()` or equivalent monotonic timing. ICMP ping, WebSocket-open duration, Wisp stream-open time, full HTTPS GET latency, and page load time are different metrics. A good relay can have a quick WebSocket handshake but slow DNS/TCP to the target; the reverse can also happen.

Wisp multiplexing and connection reuse can reduce per-connection overhead, but they do not eliminate origin TCP/TLS handshakes, bandwidth limits, WebSocket head-of-line effects, or rewriter CPU cost. Larger buffers may improve throughput on some paths while increasing memory use or tail latency on others. Tune the actual installed settings with controlled measurements; do not assume that a larger `send_buffer_size` or a bigger connection pool is universally faster.

Caching is also a privacy decision. HTTP shared caches must respect directives such as `private` and `no-store` [10]. Cache public static app assets separately from authenticated proxied responses; never let one user’s cookies or personalized response satisfy another user’s request.

### Pool health and retry discipline

A useful proxy-pool score measures completed, valid target requests—not only an open socket or an HTTP 200. Separate route/DNS/TLS failures from target authorization, rate limiting, browser rendering, challenge pages, localization, and extraction errors. Industry proxy-management guides make the same operational distinction, but their advice is not a protocol standard or a product benchmark [33].

For **429 Too Many Requests**, RFC 6585 says the server may include `Retry-After`; a conservative client should pause for the stated interval when present, then reduce aggregate concurrency/rate rather than immediately retrying through another address [38]. Use bounded retries with exponential backoff and jitter when no server delay is given, and coordinate retry budgets across application, queue, browser, and proxy layers to avoid retry storms [33]. For **403 Forbidden**, inspect permission, policy, account, and session state before retrying or changing routes; do not treat IP rotation as authorization. A **200** response may still be a challenge, consent page, empty shell, or wrong-region result. Validate content before marking the request successful.

Retry only operations that are safe to repeat, cap attempts and elapsed time, and stop on persistent policy failures. These are workload safeguards; they do not grant permission to collect data or bypass a destination’s access controls.

---

## 6. Ibossbad: project-specific architecture and findings

This section is a review of the current checkout, not a formal security audit. The code references below are local repository paths.

### Current request paths

| Path | Architecture | Notes from this checkout |
|---|---|---|
| **Legacy `/proxy/`** | Server-side HTTP(S) fetch + response rewriting | `lib/unblocker.js` and `lib/proxy.js` use Node HTTP/HTTPS requests and middleware for headers, cookies, response bodies, redirects, and WebSockets. The Node process receives the upstream HTTP response. |
| **Scramjet `/scramjet/`** | Service-worker interception + Scramjet rewriter + BareMux transport | `public/sw.js` hands controlled requests into Scramjet. `public/scramjet-engine.js` registers the worker, starts BareMux, and chooses a libcurl or Epoxy transport for the selected Wisp endpoint. It uses browser-standard service-worker APIs, but Scramjet itself is experimental; this remains a browser-origin rewriter, not a system VPN. |
| **GUST Wisp fallback** | Service-worker-free client-side fetch/rewrite over Wisp | `public/wisp-engine.js` uses WASM libcurl, fetches assets over Wisp, then builds/revises a page in a Blob-backed iframe. It has separate behavior and compatibility limitations from Scramjet. |
| **Self-hosted `/wisp/`** | WebSocket endpoint that relays TCP/UDP streams | `lib/app.js` routes upgrades to `@mercuryworkshop/wisp-js`. The app checks its session/auth gate before routing the Wisp socket. The Wisp relay is distinct from the page rewriting engine. |

`readme.md` describes the intended Scramjet + Wisp v1/v2 arrangement. In the installed package versions, `@mercuryworkshop/scramjet` is 1.1.0, `@mercuryworkshop/wisp-js` is 0.5.3, `@mercuryworkshop/bare-mux` is 2.1.9, `@mercuryworkshop/epoxy-transport` is 2.1.29, and `@mercuryworkshop/libcurl-transport` is 1.5.2 (from the current package lock). The server sets Wisp DNS TTL/cache/result ordering and `send_buffer_size=512`; the Wisp library defaults inspected at runtime allow TCP/UDP and direct public IPs, deny private/loopback IPs, and leave `stream_limit_total` unlimited unless another caller/config changes those options.

### Findings to prioritize before a public deployment

Priority labels below are provisional code-review triage, not CVSS ratings or a claim that exploitability has been demonstrated. Findings are based on the checked code paths; verify deployment configuration and product policy.

#### P0 — Legacy `/proxy/` HTTPS certificate verification is off by default

In `lib/app.js:2741-2766`, `strictSsl` is `process.env.PROXY_STRICT_SSL === "true"` and the shared HTTPS agent sets `rejectUnauthorized: strictSsl`. Unless the deployment sets that environment variable to the string `true` (or injects its own agent), the legacy server-side proxy does **not** reject untrusted upstream TLS certificates. Node’s TLS client default is verification enabled; this application explicitly overrides it [25].

**Why it matters:** TLS encryption without certificate verification does not prove that the endpoint is the intended origin. An on-path attacker can impersonate an HTTPS site to this proxy and potentially read or change the content returned to the user. Verify the production environment immediately; then make strict verification the safe default and handle exceptional trust roots narrowly rather than disabling checks globally.

#### P0 — Audit SSRF and egress controls on `/proxy/` separately from Wisp

The legacy proxy accepts target URLs and makes upstream Node HTTP(S) requests (`lib/unblocker.js`, `lib/proxy.js`). In the checked path, the admin domain policy is applied to a parsed domain on `/proxy/`, but there is no comparable resolved-IP check visible before the HTTPS/HTTP agent connects. A domain allow/block list is not sufficient protection against loopback/private IP literals, IPv6, DNS rebinding, or redirects to internal destinations. The Wisp server’s private/loopback checks do **not** automatically protect the separate Node HTTP(S) fetch path.

There is a separate `/api/safe-download` route with a single `dns.lookup()` / private-address preflight, but it passes the original hostname to a new HTTP(S) request rather than pinning the validated address to that connection. Do not treat that helper as a complete or shared SSRF control for `/proxy/`.

**Why it matters:** this is a server-side request-forgery and egress-control question. The proxy is intentionally general-purpose and authenticated, so strict host allowlisting may not fit its product goal; it still needs connection-time classification of all resolved addresses, redirect/retry revalidation, safe scheme/port rules, and network-level isolation/egress controls [14, 15]. Test only in an authorized local lab.

#### P1 — Domain policy coverage differs by engine and request stage

It is important to distinguish **an initial target check** from **enforcement on every proxied request**. `public/app.js` calls `/api/check-url` before an ordinary app-driven navigation; that API runs `checkDomainAllowed()` and records the selected engine, so it is not accurate to say Scramjet receives no policy check at all. The server also checks the domain on each legacy `/proxy/` request. However, the proxy-route middleware classifies `/scramjet/` for authentication while its `checkDomainAllowed()` branch runs only for requests whose path begins with the legacy `/proxy/` prefix. The `/wisp/` WebSocket upgrade is authenticated but does not inspect each destination host, and `public/wisp-engine.js` fetches page resources through the relay.

On the inspected paths, the policy therefore covers app-driven initial navigations and the legacy server proxy, but is not visibly enforced server-side for every Scramjet/Wisp subresource, redirect, or navigation initiated inside proxied content. In `public/app.js`, a policy response blocks navigation for HTTP 403/503; network errors are caught and ignored, and other statuses do not show the block page. This is a policy-coverage question, not proof that a user can bypass the intended product controls in every deployment.

**Why it matters:** if domain rules are meant to constrain all destinations, verify enforcement for each engine, redirects, workers, WebSockets, and relay traffic; add per-engine regression tests or explicitly document the narrower “initial navigation” scope.

#### P1 — Client-IP controls depend on trusted ingress

`lib/admin-manager.js:29-41` reads the first `X-Forwarded-For` value before falling back to Cloudflare, `X-Real-IP`, or the socket address; `lib/app.js` also sets Express `trust proxy` to `true`. If the application is directly reachable or the trusted edge preserves client-supplied forwarding headers, a caller may spoof the IP used by controls and records that rely on `getClientIp()` (for example, IP bans, per-IP rules, and visit logs). The deployment configuration is not established by this code review, so this is a configuration-dependent risk rather than a confirmed production bypass.

**Recommended check:** restrict origin access to the intended reverse proxy, configure trusted hops/addresses narrowly, have the edge strip and set forwarding headers, and add a test that submits spoofed headers both through and around the trusted ingress [27, 34].

#### P1 — Wisp egress and resource limits need an explicit production policy

The installed Wisp server runtime defaults observed in this checkout include `allow_direct_ip=true`, TCP and UDP enabled, no hostname/port allow/block lists, and `stream_limit_total=-1`; private and loopback IP access are denied by default. `lib/app.js` only changes the Wisp loopback/private options when `options.wispAllowLoopback` is true (the test suite uses that flag; the normal app path does not appear to). The app’s `/wisp/` HTTP upgrade is protected by its session gate, but that is not the same thing as Wisp v2 authentication.

**Recommended policy:** choose whether UDP is needed, set per-WebSocket stream/connection caps, add idle timeouts and bandwidth/byte quotas, rate-limit new connections, constrain destination ports where product requirements permit, and deny private/reserved/link-local egress at both the Wisp implementation and the host/network firewall. If the service is public, replace the source-level default passcode (`ibossbad`) and fallback session secret with strong deployment secrets; confirm `REQUIRE_AUTH` is not disabled. Keep trusted reverse-proxy/client-IP configuration exact so forwarded headers cannot be spoofed.

#### P1 — Server-finder probe can misclassify v2 and report rejected streams healthy

`public/server-finder.js:302-420` opens a WebSocket with `new WebSocket(url)` (no requested subprotocol), but its v2 branch expects a Wisp INFO handshake. The Wisp v2 specification uses `Sec-WebSocket-Protocol` to select v2; without it, a compliant dual-version server should act as v1 [17]. The scanner then attempts a stream to `127.0.0.1:69`. After sending CONNECT, it marks the probe successful if **any** packet has the selected stream ID, without checking the packet type. A Wisp server that correctly rejects loopback can reply with CLOSE on that ID, which the scanner can count as success.

The measured interval also starts after the WebSocket and initial protocol setup, and ends at the first matching stream frame. It is not an ICMP ping, a successful public-origin fetch, or a throughput test. The GUST fallback’s `selectBestPoolRelay()` similarly resolves on the first successful WebSocket-open probe rather than completing an end-to-end target request.

There is an intended v2-aware runtime path: `public/scramjet-engine.js` selects Epoxy and passes `{ wisp_v2: true }` when a relay is classified as Wisp v2; it otherwise selects the v1-only libcurl transport. However, protocol resolution consults `IbossServerFinder.getServerProtocol()` first, and that function prefers cached scan results over the static `v2: true` entry for built-in relays. A misclassified scan result can therefore override the static hint and route a v2 relay to libcurl. In `test/v8_cinecloud_serverfinder_spec.js`, the real local Wisp endpoint is tested for a successful binary probe and a fake text WebSocket is rejected; the v1/v2 assertions only check the expected protocol labels for two URLs. They do **not** connect to a live v2 relay, assert the WebSocket subprotocol, or test Epoxy opening a stream to a controlled origin. Runtime intent exists, but end-to-end v2 compatibility remains unverified.

**Recommended probe and test:** use a controlled public test endpoint, explicitly request/validate the intended Wisp version, validate successful stream-open and response type/content, and report the metric honestly (for example, “Wisp stream-open RTT”). Add an integration test with a spec-compliant v2 relay that checks the browser transport’s offered subprotocol and an Epoxy-to-origin request. Keep handshake, origin-TCP/TLS, HTTP TTFB, and bulk transfer measurements separate.

#### P1 — Community relays are external trust dependencies

`public/server-finder.js` includes a pool of community and “stealth” relays, and allows custom relays. A successful WSS or Wisp handshake only establishes protocol reachability and the TLS identity for that relay hostname; it does not certify the operator. The relay sees the client’s connection and destination metadata. Inner HTTPS through the selected libcurl/Epoxy transport can protect origin content from a blind relay only if TLS is end-to-end and verified. Avoid presenting these relays as audited, anonymous, or private without independent evidence.

#### P1 — Dependency lifecycle and license metadata conflict

- The installed `@mercuryworkshop/bare-mux@2.1.9` README says it is deprecated and points to `proxy-transports`; the upstream repository is archived/read-only [21]. Evaluate the migration path as a separate compatibility task; do not assume it is a drop-in change for Scramjet 1.1.0.
- `package.json` identifies this project as `AGPL-3.0`, while `readme.md` says `MIT`.
- The locked Scramjet package’s npm/package metadata says `MIT`, but its installed `node_modules/@mercuryworkshop/scramjet/LICENSE` contains AGPLv3 text. Treat that as a material unresolved discrepancy, not a license conclusion.
- The locked Epoxy and libcurl transport packages identify as AGPL-3.0-only; Wisp JS identifies as LGPL-3.0-or-later; BareMux’s packaged LICENSE is MIT even though its package metadata omits the license field.

Reconcile the source repository, exact package tarballs, lockfile, and shipped notices before distribution. AGPLv3 §13 contains a network-interaction source-offer requirement under its stated conditions [26]. This report is not legal advice.

---

## 7. A practical next-step plan

### Before calling the proxy stack production-safe

1. **TLS:** verify `PROXY_STRICT_SSL=true` in production and make origin certificate validation the default for `/proxy/`.
2. **SSRF/egress:** define one destination policy and apply it at connection time to every server-side fetch path; revalidate redirects and retries; add network egress controls that block private, loopback, link-local, reserved, and metadata destinations.
3. **Policy coverage:** test domain restrictions against `/proxy/`, `/scramjet/`, Wisp fallback, redirects, workers, WebSockets, and external relays. Mark unsupported paths honestly.
4. **Access and abuse:** replace defaults with per-deployment secrets, keep authentication on, add per-user/per-IP connection and stream limits, idle timeouts, byte/bandwidth quotas, and safe egress rules.
5. **Relay trust:** document which relay is active, who operates it, what it can observe, and whether origin TLS is verified. Do not imply a public relay is privacy-preserving merely because it is WSS.
6. **Health checks:** correct the v2 negotiation and false-positive stream check; add a controlled origin test and separate latency/throughput results.
7. **Maintenance/legal:** pin and review versions; reconcile package notices, `readme.md`, `package.json`, and exact tarball license files; assess the archived BareMux migration independently.

### A minimal benchmark matrix

For each relay/transport, run cold and warm sessions from the same client/network against one controlled small response and one controlled large response. Record: WebSocket/TLS setup, Wisp handshake, stream-open time, destination DNS/TCP/TLS, TTFB, total time, bytes/sec, error/timeout rate, failovers, and p50/p95/p99. Repeat at several times of day. Keep the best relay’s speed separate from the median; a single fastest sample is not a service-level guarantee.

---

## Sources

References 1–10 and 38 are RFC standards; 11–15 and 25–27 are official browser, platform, and security guidance; 16–21 are upstream project documentation; 22–24 are academic measurements; 26 is the GNU license text; 28–36 are commercial or industry explainers; and 37 is official MCP documentation. Vendor material is used only for taxonomy and operational examples—not as independent evidence of privacy, security, or performance. Study results apply to their samples and measurement periods, not as forecasts for the Ibossbad relay pool.

1. HTTP semantics (proxy, gateway/reverse proxy, CONNECT, proxy authentication): [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html).
2. HTTP/1.1 message and request-target forms: [RFC 9112](https://www.rfc-editor.org/rfc/rfc9112.html).
3. HTTP/2 semantics and CONNECT: [RFC 9113](https://www.rfc-editor.org/rfc/rfc9113.html).
4. HTTP/3 semantics and CONNECT: [RFC 9114](https://www.rfc-editor.org/rfc/rfc9114.html).
5. SOCKS Protocol Version 5: [RFC 1928](https://www.rfc-editor.org/rfc/rfc1928.html).
6. SOCKS5 username/password authentication: [RFC 1929](https://www.rfc-editor.org/rfc/rfc1929.html).
7. TLS 1.3 security properties: [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446.html).
8. QUIC multiplexed secure transport: [RFC 9000](https://www.rfc-editor.org/rfc/rfc9000.html).
9. UDP proxying over HTTP / MASQUE CONNECT-UDP: [RFC 9298](https://www.rfc-editor.org/rfc/rfc9298.html).
10. HTTP caching, including `private` and `no-store`: [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html).
11. Browser service worker API, secure contexts, and scope: [MDN, Using Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).
12. Service-worker fetch interception: [MDN, ServiceWorkerGlobalScope fetch event](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/fetch_event).
13. Browser CORS behavior: [MDN, CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).
14. SSRF validation and DNS-rebinding guidance: [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).
15. SSRF threat and mitigation overview: [OWASP Top 10 A10:2021](https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/).
16. Wisp v1 protocol: [MercuryWorkshop Wisp protocol, v1](https://github.com/MercuryWorkshop/wisp-protocol/blob/v1/protocol.md).
17. Wisp v2 protocol and extensions: [MercuryWorkshop Wisp protocol, v2](https://github.com/MercuryWorkshop/wisp-protocol/blob/v2/protocol.md).
18. Scramjet project source and upstream documentation: [MercuryWorkshop/scramjet](https://github.com/MercuryWorkshop/scramjet) and [Scramjet wiki](https://github.com/MercuryWorkshop/scramjet/wiki).
19. libcurl transport, TLS + Wisp options: [MercuryWorkshop/libcurl-transport](https://github.com/MercuryWorkshop/libcurl-transport).
20. Epoxy transport: [MercuryWorkshop/epoxy-transport](https://github.com/MercuryWorkshop/epoxy-transport).
21. BareMux deprecation/archive and replacement direction: [MercuryWorkshop/bare-mux](https://github.com/MercuryWorkshop/bare-mux).
22. A. Mani et al., “An Extensive Evaluation of the Internet’s Open Proxies,” ACSAC 2018: [ACM DOI](https://doi.org/10.1145/3274694.3274711) and [author preprint](https://arxiv.org/abs/1806.10258).
23. D. Perino, M. Varvello, C. Soriente, “Long-term Measurement and Analysis of the Free Proxy Ecosystem,” 2019: [ACM DOI](https://doi.org/10.1145/3360695).
24. N. Mehanna et al., “Free Proxies Unmasked: A Vulnerability and Longitudinal Analysis of Free Proxy Services,” MADWeb 2024: [arXiv HTML](https://arxiv.org/html/2403.02445v1).
25. Node TLS client option semantics: [Node.js TLS documentation](https://nodejs.org/api/tls.html#tlsconnectoptions-callback).
26. GNU Affero General Public License v3, including §13: [GNU/FSF license text](https://www.gnu.org/licenses/agpl-3.0.html).
27. Proxy roles, forwarding headers, CONNECT, and PAC: [MDN, Proxy servers and tunneling](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Proxy_servers_and_tunneling).
28. TCP proxying, HTTP CONNECT, and proxy protocol overview: [Cloudflare Blog, A Primer on Proxies](https://blog.cloudflare.com/a-primer-on-proxies/).
29. Commercial guide and MCP proxy-management example: [PROXIES.SX, Proxies for AI Agents: The Complete Guide](https://www.proxies.sx/blog/proxies-for-ai-agents-complete-guide).
30. Commercial operational guide to AI-agent proxy sessions and retries: [Byteful, Proxies for AI Agents: Why and How to Set Them Up](https://byteful.com/blog/proxy-for-ai-agents).
31. Commercial taxonomy of datacenter, ISP, residential, and mobile egress: [Bright Data, The Ultimate Guide To Proxy IP Types](https://brightdata.com/blog/proxy-101/ultimate-guide-to-proxy-types).
32. IP/ASN and proxy-detection field caveats: [IPGeolocation.io, Types of Proxies: Residential, ISP, Datacenter, and Mobile](https://ipgeolocation.io/guides/types-of-proxies).
33. Commercial operational guidance on failure classes, retries, and request budgets: [Web Scraper, Proxy management for web scraping: what actually matters](https://webscraper.io/blog/proxy-management-for-web-scraping).
34. Reverse-proxy deployment and forwarded-header example: [SaaS Custom Domains, What Is a Reverse Proxy? A Beginner’s Guide with Examples](https://saascustomdomains.com/blog/posts/beginners-guide-to-reverse-proxies).
35. Reverse-proxy roles and common benefits: [Cloudflare Learning Center, What is a reverse proxy?](https://www.cloudflare.com/learning/cdn/glossary/reverse-proxy/).
36. Model API gateway routing, usage, and budget-control example: [Vercel AI Gateway documentation](https://vercel.com/docs/ai-gateway).
37. Official tool/context integration protocol: [Model Context Protocol introduction](https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro).
38. HTTP 429 and optional Retry-After guidance: [RFC 6585 §4](https://www.rfc-editor.org/rfc/rfc6585.html#section-4).

**Post-snapshot source (not relied on in this report):** Proxidize, [What Is an AI Proxy? How Proxies Fit Into AI Workflows](https://proxidize.com/blog/ai-proxy/). The page states it was published 16 November 2026, after this report’s 12 November 2026 research snapshot.

### Ibossbad repository evidence

Project-specific findings refer to the current checkout: `lib/app.js`, `lib/proxy.js`, `lib/unblocker.js`, `lib/parse-url.js`, `lib/admin-manager.js`, `public/app.js`, `public/server-finder.js`, `public/scramjet-engine.js`, `public/sw.js`, `public/wisp-engine.js`, and `test/v8_cinecloud_serverfinder_spec.js`. Dependency versions and licensing observations come from `package.json`, `package-lock.json`, `readme.md`, and the installed package metadata/license files; those conflicting license declarations are intentionally reported as unresolved.
