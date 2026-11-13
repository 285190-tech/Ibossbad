# Product roadmap: 100 proposed additions

This is the approved backlog for the 100 feature ideas. Deliver it in phases rather than as one large release; retain existing behavior and add tests per phase. Items already present in the current code are marked complete so they are not duplicated. Status: `[ ]` pending, `[~]` partial, `[x]` implemented or already present.

## Phase 1 — Game catalog reliability and discovery

1. [ ] Nightly checks that flag games whose mirror URLs stop responding.
2. [ ] Show a per-game last-checked date and availability badge.
3. [x] Report a broken game from the Games hub (existing Request / Report flow).
4. [x] Admin inbox for game requests and broken-link reports (`gameRequests`).
5. [ ] Configure alternate mirrors and fall back when the primary fails.
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

## Delivery notes

- Current implementation slice: catalog preflight (`npm run check:catalog`), exact duplicate-byte warnings, a per-game detail drawer with recorded cover attribution, and a local hide/unhide filter.
- The Treasure cover now uses game-specific title-card art from its Google Play listing instead of generic room art (rights remain unverified). The 207-cover directory still has only five source records; the remaining source and rights audit is open.
- The catalog already has a generic Request / Report flow and “Surprise Me”; extend those rather than creating parallel systems.
- Ship one phase at a time, validate existing deployments, and keep privacy/security changes opt-in or backward-compatible where practical.
