# Product roadmap: 200 proposed additions

Items 1–100 are the original approved backlog and will be delivered in phases rather than as one large release. Items 101–200 are a separate set of additional proposals only; they are not approved, implemented, or scheduled yet. Retain existing behavior and add tests as features are selected. Items already present in the current code are marked complete so they are not duplicated. Status: `[ ]` pending, `[~]` partial, `[x]` implemented or already present.

## Phase 1 — Game catalog reliability and discovery

1. [x] Nightly checks that flag games whose mirror URLs stop responding (built-in mirror catalog is scanned at server start and every 24 hours; status is in-memory).
2. [x] Show a per-game last-checked date and availability badge (manual checks cover visible external/custom titles; server reachability is not a browser-playability guarantee).
3. [x] Report a broken game from the Games hub (existing Request / Report flow).
4. [x] Admin inbox for game requests and broken-link reports (`gameRequests`).
5. [x] Configure ordered alternate mirrors with `MGG_MIRRORS` and fail over across them on non-success responses, including 404.
6. [ ] Check mirrored game files for missing WebGL, Unity, or other dependencies.
7. [~] Track image source, attribution, and license status for each cover (manifest/preflight exist, but only five covers currently have records).
8. [ ] Add an admin cover-review screen with replace, crop, and preview controls.
9. [~] Warn about exact duplicate cover files (visual/similarity review remains open).
10. [~] Validate catalog entries and covers in preflight; validated import/export remains open.
11. [x] Add a game detail drawer with game description/category and cover attribution where recorded.
12. [ ] Show badges for supported inputs, player count, platform, and save support.
13. [ ] Filter games by keyboard, mouse, touch, or controller support.
14. [ ] Filter for solo, local multiplayer, or online multiplayer.
15. [ ] Filter by difficulty or typical session length.
16. [ ] Add editorial shelves such as “Quick Breaks” or “Local Multiplayer.”
17. [ ] Suggest similar games from matching tags or categories.
18. [x] Let users hide titles they do not want to see (local to the current browser profile, with an Unhide filter).
19. [x] “Surprise Me” uses the currently filtered game results.
20. [ ] Add a rotating daily or weekly game challenge.

## Phase 2 — Personalization and play experience

21. [ ] Create custom game collections that sync across devices.
22. [ ] Share a read-only collection link.
23. [ ] Pin a collection to the New Tab page.
24. [ ] Add private notes to individual games.
25. [ ] Mark games as “Play later” or “Completed.”
26. [ ] Add a playtime dashboard.
27. [ ] Show a personal play-history timeline.
28. [ ] Recommend games based on local play history, with an opt-out.
29. [ ] Add guest or family profiles with separate preferences.
30. [ ] Export/import a personal library: collections, notes, and preferences.
31. [ ] Show game controls before launch and as an in-game overlay.
32. [ ] Allow per-game keyboard remapping.
33. [ ] Save controller mapping profiles.
34. [ ] Add a gamepad test and diagnostics page.
35. [ ] Notify users when a controller connects or disconnects.
36. [ ] Let users reposition and resize touch controls.
37. [ ] Add an optional fullscreen-on-launch setting.
38. [ ] Offer orientation guidance for portrait- or landscape-designed games.
39. [ ] Add an optional FPS and performance overlay.
40. [ ] Detect a frozen game and offer retry/reload options.

## Phase 3 — Save data and browser/workspace tools

41. [ ] Keep versioned snapshots of cloud saves.
42. [ ] Preview and roll back to a prior save snapshot.
43. [ ] Show a clear choice when devices have conflicting saves.
44. [ ] Add per-game save-sync toggles and sync status.
45. [ ] Back up compatible saves at the end of a play session.
46. [ ] Export/import supported saves as files.
47. [ ] Show save storage usage and quota controls.
48. [ ] Encrypt supported save data on the client before cloud sync.
49. [ ] Let users set snapshot-retention rules and prune old backups.
50. [ ] Explain per-game save compatibility and limitations.
51. [ ] Add named, color-coded tab groups inside workspaces.
52. [ ] Add split-view browsing.
53. [ ] Offer an optional vertical tab strip.
54. [ ] Add a simplified reader view for supported pages.
55. [ ] Add a notes panel attached to a workspace.
56. [ ] Organize bookmarks with folders, tags, and pins.
57. [ ] Add a per-site permissions center.
58. [ ] Let users suspend individual tabs to save memory.
59. [ ] Generate a QR code for the current page to open on another device.
60. [ ] Add auto-close timers for temporary tabs.

## Phase 4 — Accessibility, privacy, and security

61. [ ] Announce navigation changes and errors for screen readers.
62. [ ] Improve keyboard-only navigation and focus management.
63. [ ] Add a high-contrast theme.
64. [ ] Add adjustable interface font size.
65. [ ] Add a reduced-motion setting.
66. [ ] Make focus indicators configurable and more visible.
67. [ ] Offer color-vision-friendly palettes.
68. [ ] Let users choose larger touch targets.
69. [ ] Provide transcripts for help and onboarding media.
70. [ ] Support switch-accessible navigation.
71. [ ] Add passkey sign-in for supported accounts.
72. [ ] Show active sessions and let users revoke a device (admin session controls exist; user self-service is still needed).
73. [ ] Notify users of new sign-ins.
74. [ ] Add retention controls for history, telemetry, and saved data.
75. [ ] Add a one-click clear-data action for a specific site.
76. [ ] Offer a guest workspace that does not sync or retain history.
77. [ ] Show a privacy ledger of third-party requests and blocked trackers.
78. [ ] Add a security-header/CSP audit report for self-hosted deployments.
79. [ ] Add dependency vulnerability and license alerts.
80. [ ] Add a user-facing data export and account-deletion flow.

## Phase 5 — Media, cloud gaming, admin, and operations

81. [ ] Add a network-readiness check before launching a cloud game.
82. [ ] Let users configure input profiles for cloud-game sessions.
83. [ ] Show session connection status and recovery options.
84. [ ] Create custom radio-stream playlists.
85. [ ] Add a sleep timer for background audio.
86. [ ] Add radio presets grouped by mood or activity.
87. [ ] Add “Continue watching” for sources that expose playback progress.
88. [ ] Remember subtitle preferences where supported.
89. [ ] Queue media from multiple supported sources.
90. [ ] Offer a bandwidth and quality recommendation based on connection conditions.
91. [ ] Add a guided first-run tour.
92. [ ] Add an offline help center for common setup issues.
93. [ ] Generate a redacted diagnostics bundle for support.
94. [ ] Add screenshot-based visual regression tests for key pages.
95. [ ] Add a deployment preflight for environment variables, Supabase setup, and server connectivity.
96. [ ] Add staged feature flags with rollback.
97. [x] Admin configuration backup and restore already exist (`/api/admin/export` and import-state).
98. [ ] Add separate moderator and owner permissions.
99. [ ] Allow self-hosted instances to customize branding and colors.
100. [ ] Publish a lightweight status page for the server and game mirrors.

## Expansion backlog — 100 additional proposals (items 101–200)

This is a separate idea-only backlog, distinct from items 1–100. These proposals have not been approved, implemented, or scheduled; select and scope them before starting work.

### Phase 6 — Extension SDK and developer platform

101. [ ] Publish a versioned extension SDK with lifecycle hooks and compatibility guarantees.
102. [ ] Define a JSON manifest for extension routes, commands, settings, and declared capabilities.
103. [ ] Add a local extension development mode with safe hot reload.
104. [ ] Show a compatibility report when an extension targets an unsupported API version.
105. [ ] Require explicit per-extension grants for sensitive browser APIs.
106. [ ] Show a per-extension log of API access and blocked capability calls.
107. [ ] Add publisher identity and signed package metadata for extensions.
108. [ ] Support reproducible extension builds with verifiable package hashes.
109. [ ] Add stable, beta, and nightly extension release channels.
110. [ ] Allow an extension update to be rolled back to its prior version.
111. [ ] Detect incompatible extension dependencies and overlapping command bindings.
112. [ ] Give each extension an isolated, namespaced storage area and quota.
113. [ ] Add versioned extension-settings migrations with preview and rollback.
114. [ ] Expose resource budgets and lifecycle limits for background extensions.
115. [ ] Support self-hosted mirrors of the extension registry for offline deployments.
116. [ ] Let organizations maintain private extension registries with allowlists.
117. [ ] Scan extension packages for risky APIs and suspicious permissions in CI.
118. [ ] Add an extension-specific diagnostics page for crashes and errors.
119. [ ] Let extensions add small, permission-scoped widgets to approved browser surfaces.
120. [ ] Provide an in-browser extension test runner with mock tabs, storage, and network events.

### Phase 7 — Research and page tools

121. [ ] Create a research scrapbook that clips selected page text with source URL, title, and capture date.
122. [ ] Generate citations from captured metadata in APA, MLA, Chicago, and BibTeX formats.
123. [ ] Compare two saved captures of a page and highlight changed text.
124. [ ] Extract selected HTML tables into CSV or JSON.
125. [ ] Inspect structured page metadata (Open Graph, JSON-LD, and canonical links) in a readable panel.
126. [ ] Create reusable, local-only selectors to collect matching text or links from pages.
127. [ ] Annotate local PDF documents with highlights, comments, and stamps.
128. [ ] Add on-device OCR for screenshots and imported image/PDF scans.
129. [ ] Offer a temporary, searchable clipboard shelf with explicit clear controls.
130. [ ] Provide clipboard transforms for URL encoding, Base64, Markdown links, and whitespace cleanup.
131. [ ] Preview normalized URLs and flag deceptive Unicode or punycode before navigation.
132. [ ] Show redirect-chain destinations and warn about cross-domain jumps before opening.
133. [ ] Add a request/resource waterfall inspector for web-app troubleshooting.
134. [ ] Provide a page outline and accessibility-tree viewer with heading and landmark navigation.
135. [ ] Add a layout inspector showing element bounds, computed styles, and stacking context.
136. [ ] Preview pages at fixed responsive viewport presets without resizing the whole app.
137. [ ] Add temporary per-tab request-blocking rules that expire when the tab session closes.
138. [ ] Save reusable form-fill templates encrypted locally and ask before applying them.
139. [ ] Extract all links from the current page into a filterable, deduplicated list.
140. [ ] Import a CSV of URLs and process it as a cancellable open/check queue.

### Phase 8 — Team collaboration

141. [ ] Create a live shared workspace where the owner chooses exactly which tabs are shared.
142. [ ] Let participants follow a presenter’s active tab without taking over control.
143. [ ] Export a sanitized handoff bundle of shared tab titles, URLs, and selected notes.
144. [ ] Add comment threads attached to shared links and pages.
145. [ ] Anchor shared annotations to page text and detect when the quoted text changes.
146. [ ] Create named team spaces with membership separate from browser admin roles.
147. [ ] Define viewer, contributor, and manager permissions per team space.
148. [ ] Offer expiring, revocable shared-workspace links with optional passphrases.
149. [ ] Let a guest join a collaboration session without creating a persistent account.
150. [ ] Provide a shared task board scoped to a team workspace.
151. [ ] Publish curated team start pages from approved bookmarks and launch links.
152. [ ] Add a review queue for links submitted to a team space.
153. [ ] Let team moderators quarantine or remove shared items with an audit history.
154. [ ] Notify members about mentions and changes in subscribed team spaces.
155. [ ] Create pinned announcement posts for team spaces with optional expiration.
156. [ ] Show a team activity feed of additions, edits, and removals.
157. [ ] Add a collaborative whiteboard for notes, arrows, and links.
158. [ ] Support simultaneous note editing with conflict-free merging and edit attribution.
159. [ ] Show participant presence or away state in a shared workspace, opt-in.
160. [ ] Let the current host hand control to another participant without ending the session.

### Phase 9 — Interoperability and integrations

161. [ ] Import bookmarks and folder structure from Chrome, Firefox, Safari, and Edge export formats.
162. [ ] Export bookmarks in Netscape HTML, JSON, and CSV formats with tags preserved.
163. [ ] Import and export browser tab sessions using a documented JSON schema.
164. [ ] Add WebDAV as a user-selected sync or backup backend.
165. [ ] Support S3-compatible object storage as an encrypted backup target.
166. [ ] Configure a custom OIDC identity provider for self-hosted deployments.
167. [ ] Add SAML single sign-on and SCIM provisioning for managed organizations.
168. [ ] Connect two self-hosted Ibossbad instances for explicitly scoped data transfer.
169. [ ] Integrate calendar events as optional launch links on the New Tab page.
170. [ ] Send selected bookmarks or links to a configured task manager.
171. [ ] Add RSS/Atom subscriptions with grouping and unread-state sync.
172. [ ] Provide a mobile share target so other apps can send URLs into an Ibossbad workspace.
173. [ ] Register an OS “Open with Ibossbad” handler in a supported desktop wrapper for URLs and documents.
174. [ ] Add encrypted local-network peer-to-peer sync with explicit device pairing.
175. [ ] Let users choose which data classes sync (such as bookmarks, preferences, and sessions).
176. [ ] Add configurable sync windows and bandwidth caps for large transfers.
177. [ ] Import saved reading lists from Pocket/Instapaper-compatible exports.
178. [ ] Offer an expiring, token-free QR handoff for a selected multi-tab session.
179. [ ] Support user-configured protocol handlers for `mailto:`, `webcal:`, and document links with site allowlists.
180. [ ] Provide signed webhooks for user-selected events with replay protection.

### Phase 10 — Self-hosted operations and scale

181. [ ] Add a Redis-backed session store for deployments running multiple app replicas.
182. [ ] Publish a storage-adapter interface so deployments can use PostgreSQL without coupling to Supabase.
183. [ ] Broadcast presence, chat, and admin events across replicas through a message bus.
184. [ ] Add a shared content-addressed cache with quotas for static assets and mirror responses.
185. [ ] Emit structured JSON logs with request IDs and configurable redaction filters.
186. [ ] Support opt-in OpenTelemetry traces with a configurable export target.
187. [ ] Provide Prometheus-compatible metrics for latency, upstream failures, active sessions, and cache hits.
188. [ ] Split liveness and readiness probes, including dependency and shutdown state.
189. [ ] Gracefully drain active proxy streams and WebSockets during shutdown.
190. [ ] Add a deployment health gate that aborts a rollout when synthetic transactions fail.
191. [ ] Provide development, staging, and production configuration profiles with an explicit diff.
192. [ ] Integrate pluggable secret providers (such as Vault or KMS) alongside environment variables.
193. [ ] Display background-job status, retries, and durations in the admin operations UI.
194. [ ] Estimate server capacity and recommend worker/socket settings from observed workload.
195. [ ] Add circuit-breaker controls and status for upstream services.
196. [ ] Offer per-tenant usage quotas with role-based overrides.
197. [ ] Configure per-instance connection, media-session, and upload limits with graceful warnings.
198. [ ] Support blue/green releases with active-version health visibility.
199. [ ] Automate restore drills against a disposable staging environment and report recoverability.
200. [ ] Export immutable, signed admin audit events to an external log sink.

## Delivery notes

- Current implementation slice: catalog preflight (`npm run check:catalog`), exact duplicate-byte warnings, a per-game detail drawer with recorded cover attribution, and a local hide/unhide filter.
- The Treasure cover now uses game-specific title-card art from its Google Play listing instead of generic room art (rights remain unverified). The 207-cover directory still has only five source records; the remaining source and rights audit is open.
- The catalog already has a generic Request / Report flow and “Surprise Me”; extend those rather than creating parallel systems.
- Ship one phase at a time, validate existing deployments, and keep privacy/security changes opt-in or backward-compatible where practical.
