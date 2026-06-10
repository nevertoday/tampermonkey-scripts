# Image Downloader Chrome Extension Design

## Goal

Turn the five standalone Tampermonkey image selector scripts into one Chrome MV3 extension with a browser side panel. The extension keeps the current page-level selection workflow while centralizing site switches, settings, downloads, and donation content in one sidebar.

## Product Shape

The extension has three top-level side panel tabs:

- `网站`: list supported websites, show whether the current tab is supported, and let each site be enabled or disabled independently.
- `设置`: configure global behavior and per-site defaults, including filename prefix, page mini panel visibility, hover select buttons, keyboard shortcuts, and download mode.
- `打赏`: show a simple support/donation page that does not affect core behavior.

On supported pages, the content script injects a small image selection control onto detected content images. Selected images keep a persistent outline. A compact page mini panel shows the selected count and quick actions; it can be hidden from settings.

Visual system:

- Black, white, and neutral grays only. Site brand colors are not used in the interface.
- No rounded-corner UI. Buttons, cards, inputs, counters, page controls, selected outlines, toasts, and placeholders use square corners.
- Borders, contrast, and spacing carry hierarchy instead of color accents, shadows, gradients, or glass effects.

Copy system:

- Buttons use explicit actions, such as `选择当前屏幕`, `复制图片链接`, and `开始下载`.
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
- 微信公众号: `mp.weixin.qq.com`
- 500px: `500px.com`
- 堆糖: `duitang.com`

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
4. Side panel sends commands to the content script for select all, clear, copy links, and download.
5. Downloads are delegated to the background service worker so host permissions and `chrome.downloads` are centralized.

## Storage

`chrome.storage.sync`:

- `settings.sites[siteId].enabled`
- `settings.sites[siteId].prefix`
- `settings.showMiniPanel`
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
