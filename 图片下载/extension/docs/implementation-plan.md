# Image Downloader Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome MV3 extension version of the existing multi-site image downloader with a side panel for site switches, settings, and donation content.

**Architecture:** Use a no-build `extension/` directory with native JavaScript modules split by responsibility. Content scripts handle page detection and selection UI; the background worker handles downloads; the side panel handles settings and commands.

**Tech Stack:** Chrome MV3 extension APIs, plain JavaScript, plain CSS, no new dependencies.

---

### Task 1: Extension Shell

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/background.js`

- [x] Create MV3 manifest with `storage`, `downloads`, `activeTab`, `sidePanel`, host permissions, side panel path, and content script matches.
- [x] Create background command handlers for download requests and side panel registration.
- [x] Verify manifest parses as JSON and background passes `node --check`.

### Task 2: Site Adapters

**Files:**
- Create: `extension/content/site-adapters.js`

- [x] Define adapters for 小红书, Pinterest, 微信公众号, 500px, and 堆糖.
- [x] Port URL normalization and content-image filters from existing scripts.
- [x] Expose `window.ImageDownloaderAdapters`.
- [x] Verify syntax with `node --check`.

### Task 3: Content Runtime

**Files:**
- Create: `extension/content/content.js`
- Create: `extension/content/content.css`

- [x] Load settings and selected state.
- [x] Detect current adapter, scan images, inject per-image selection buttons, and keep selected outlines.
- [x] Add mini panel with selected count and quick actions.
- [x] Add side panel command handling.
- [x] Add keyboard shortcuts for select-hovered, select visible, download, and clear.
- [x] Verify syntax with `node --check`.

### Task 4: Side Panel UI

**Files:**
- Create: `extension/sidepanel/index.html`
- Create: `extension/sidepanel/styles.css`
- Create: `extension/sidepanel/sidepanel.js`

- [x] Build three tabs: websites, settings, donation.
- [x] Add per-site enable switches and prefix inputs.
- [x] Add global settings controls.
- [x] Add current-tab commands for select all, clear, copy links, and downloads.
- [x] Verify syntax with `node --check`.

### Task 5: Verification

**Files:**
- No new files.

- [x] Run JSON parse check for `extension/manifest.json`.
- [x] Run `node --check` for all extension JavaScript files.
- [x] Confirm no old user scripts were modified.

