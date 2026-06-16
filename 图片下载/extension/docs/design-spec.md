# Image Downloader Chrome Extension Design

## Goal

Turn the standalone Tampermonkey image selector scripts into one Chrome MV3 extension with a browser side panel. The extension keeps the current page-level selection workflow while centralizing site switches, settings, downloads, and donation content in one sidebar.

## Product Shape

The extension has three top-level side panel tabs:

- `网站`: list supported websites, show whether the current tab is supported, and let each site be enabled or disabled independently.
- `设置`: configure global behavior and per-site defaults, including filename prefix, page mini panel visibility, hover select buttons, keyboard shortcuts, and download mode.
- `打赏`: show a simple support/donation page that does not affect core behavior.

On supported pages, the content script injects a small image selection control onto detected content images. Selected images keep a persistent outline. A compact page mini panel shows the selected count and quick actions; it can be hidden from settings.

Sidebar and mini-panel behavior:

- Clicking the browser extension icon opens the Chrome side panel through `chrome.sidePanel`.
- The web page mini panel can be expanded or collapsed from the panel itself.
- The collapsed mini panel keeps the selected count visible and hides quick action buttons.
- Mini panel collapse state is saved in `chrome.storage.sync`.

Visual system:

- Warm ivory surfaces with a single restrained red accent. Keep the interface clean and light; borders, contrast, spacing, and subtle color temperature carry hierarchy instead of loud brand colors or heavy shadows.
- The side panel (`sidepanel/styles.css`) and the injected page UI (`content/content.css`) are separate CSS contexts but MUST share one token scale. Side-panel tokens are unprefixed; content tokens use the `--idx-` prefix. Identically-named concepts MUST hold identical values across both files.

Color tokens (keep both files in sync):

- `accent` `#ff2442` — base red: fills, dots, active pills, checked switches.
- `accent-hover` `#e6002e` — darker red for hover/press on a solid red fill.
- `accent-ink` (`--idx-accent-dark`) `#d81e38` — red used as text/icon on a light tint; never use the bright `accent` for red text.
- `ink` `#25211d` — primary text. `muted` `#746d64` — secondary text (solid, not alpha, so it stays stable over arbitrary host pages).
- `line` `rgba(62,52,42,.1)`, `line-strong` `rgba(62,52,42,.16)` — borders.
- `soft` `rgba(62,52,42,.045)`, `soft-hover` `rgba(62,52,42,.08)` — neutral control fills.
- `surface` `rgba(255,254,250,.92)` (warm white), `surface-strong` `#fffefa` — card/panel backgrounds.

Scale tokens:

- Font weight ramp — use only `500 / 600 / 700 / 800 / 900`. 500 captions, 600 buttons/labels, 700 strong body, 800 headings & emphasis, 900 reserved (shortcut keys). The thin `300` is allowed only for the `+` glyph on the select button.
- Control height — `30` compact (dock pills), `34` standard (buttons, selects, inputs), `40` large (modal inputs). Round counters (`38/42/52/54`) are decorative and context-specific.
- Radius — `10` small inputs, `14` chips/list items, `18` cards & modals, `999` pills. Modal titles are `18px / 800`.
- Motion — `--motion-fast 120ms`, `--motion-med 150ms`; longer dock transitions live in `content.css` only.

Copy system:

- Buttons use explicit actions, such as `选图`, `复制图片链接`, and `开始下载`.
- Status messages explain the current state or next step instead of using generic words like `失败` or `处理中`.
- Settings labels describe the user-visible behavior, not implementation details.

Donation tab:

- Use an author/support layout modeled after the referenced GitHub Pages project: author copy, a support panel, and two QR figures.
- QR images are local extension assets: `extension/assets/donate-wechat.png` and `extension/assets/donate-compute.png`.
- Missing QR images show a clear filename placeholder instead of a broken image.

## Supported Sites

Initial adapters:

- 小红书: `xiaohongshu.com`
- Pinterest: `pinterest.com`
- X: `x.com`, `twitter.com`
- 微信公众号: `mp.weixin.qq.com`
- 500px: `500px.com`
- 堆糖: `duitang.com`
- 花瓣: `huaban.com`

Each adapter owns its image filtering and URL normalization rules. Shared code owns storage, selection state, UI injection, download messaging, keyboard handling, and side panel communication.

## Architecture

Chrome extension files live under `extension/`:

- `manifest.json`: MV3 permissions, host matches, side panel registration.
- `background.js`: receives download requests, performs direct/list/ZIP downloads through `chrome.downloads`, and enables the side panel.
- `content/site-adapters.js`: site definitions and image extraction helpers.
- `content/content.js`: page runtime, selection state, mini panel, keyboard shortcuts, storage sync, and messages from the side panel.
- `content/content.css`: injected page UI styles.
- `sidepanel/index.html`, `sidepanel/styles.css`, `sidepanel/sidepanel.js`: sidebar UI, tab navigation, settings persistence, current-tab commands.

Data flow:

1. Side panel reads `chrome.storage.sync` settings and active tab status.
2. Content script detects the site adapter and reads settings.
3. Content script scans page images, injects select buttons, and stores selected URLs in `chrome.storage.local`.
4. Side panel sends commands to the content script for pointer-based image selection, clear, copy links, and download.
5. Downloads are delegated to the background service worker so host permissions and `chrome.downloads` are centralized.

## Storage

`chrome.storage.sync`:

- `settings.sites[siteId].enabled`
- `settings.sites[siteId].prefix`
- `settings.showMiniPanel`
- `settings.miniPanelCollapsed`
- `settings.showHoverButtons`
- `settings.enableShortcuts`
- `settings.defaultDownloadMode`

`chrome.storage.local`:

- `selected.<siteId>` as an array of `[id, url]`

## Download Behavior

Download modes:

- `links`: save selected URLs as a text file.
- `direct`: download each image URL as a separate file.
- `zip`: fetch images in the background, build a ZIP without external libraries, and download it.

ZIP uses the existing no-dependency ZIP approach from the user scripts, adapted for the background service worker.

## Error Handling

- Unsupported sites show a disabled side panel state.
- Disabled sites remove injected controls and stop scanning.
- Failed image fetches are counted and reported in page/side panel status.
- Download commands return structured success/failure messages.

## Testing

Verification for this first conversion:

- Static syntax check for all extension JavaScript files with `node --check`.
- Manifest JSON parse check.
- Manual install path documented in final response.
