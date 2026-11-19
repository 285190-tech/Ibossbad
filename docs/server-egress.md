# Server-side egress policy

Ibossbad is a general-purpose proxy, so an application-level hostname allowlist is not practical for every proxied destination. The server therefore classifies the resolved address at connection time and, for request paths that validate a URL before dialing, pins the connection to the validated address. This protects against DNS rebinding between a preflight and the connection; it does not replace host/network egress controls.

## Covered by the default public-unicast policy

The default Node-side egress checks cover:

- The legacy `/proxy/` HTTP, HTTPS, and WebSocket paths. The configured agents filter DNS results; private/reserved IP literals are rejected before the request.
- The in-process `/wisp/` relay. Wisp uses the filtered resolver, pins the selected address for TCP/UDP sockets, and rejects non-public IP literals.
- MGG game-mirror requests, safe downloads, and external game-availability checks. They filter answers before dialing and pin the selected address for each request.
- Configured Supabase calls and administrator webhooks. These are also public-only and use a one-request connection rather than a pooled socket.

The app's Node HTTP requests do not automatically follow 3xx responses. If redirect-following is added, treat every `Location` as a new untrusted destination: parse the scheme and hostname again, resolve/filter every answer, pin the new connection, cap redirect count, and avoid forwarding credentials across origins.

## Trusted escape hatches

These options or extension points execute with elevated network trust. Keep them out of public deployments unless the supplied code independently enforces an equivalent egress policy:

- `createApp({ allowPrivateProxyTargets: true })` disables the legacy `/proxy/` destination restriction so trusted local development can reach LAN fixtures. It does not relax safe downloads, Wisp, MGG, Supabase, or webhook checks.
- `createApp({ allowPrivateMggTargets: true })` disables MGG mirror filtering for local test fixtures.
- A custom `httpAgent` or `httpsAgent` is rejected unless `trustCustomProxyAgents: true` is supplied (or the broader `allowPrivateProxyTargets` option is explicitly enabled). A trusted custom agent is responsible for its own destination policy.
- `requestMiddleware` is executable application code. Middleware that handles a request itself can make network requests outside the built-in proxy agents; review it as trusted server code.
- Code that mutates the upstream Wisp package's global options after `createApp()` can override the relay policy. Do not enable private/loopback Wisp targets or replace its DNS method on a public instance.

The self-hosted `/wisp/` endpoint is different from external relays chosen in the browser. A remote relay makes the outbound connection from its own infrastructure, so this app cannot constrain that relay's destination policy. Use only relays whose operators and policies you trust.

## Deployment-level defense in depth

There are no deployment-specific firewall or container manifests in this repository. Operators should implement network egress controls at the cloud security group, container/CNI policy, host firewall, or equivalent boundary:

1. Deny outbound traffic to loopback, private, link-local, carrier-grade NAT, multicast, reserved/special-use, and cloud metadata destinations for **both IPv4 and IPv6**. Include provider-specific metadata endpoints and prevent IPv6 from becoming an unfiltered alternate path.
2. Permit DNS only to the intended resolver(s), and allow only the public services and protocols the instance needs. Prefer an explicit egress allowlist when the deployment supports it; a broad “internet allowed” rule is weaker defense in depth.
3. Apply the same restrictions to any self-hosted Wisp relay host. If a third-party Wisp relay is used, its operator must enforce its own egress controls.
4. If a deployment genuinely needs a private backend, connect to that backend through a separate, fixed, explicitly allowed service path rather than weakening the general-purpose proxy policy.
5. Verify the deployed policy from the running environment, including attempts to reach loopback, RFC1918/ULA, link-local/cloud metadata, and public IPv4/IPv6 destinations. Confirm that blocked attempts do not produce packets at the target.

An application test can prove the code rejected a test request; only the deployment's actual network controls can prove the process is prevented from reaching an internal address if another code path or dependency is compromised.
