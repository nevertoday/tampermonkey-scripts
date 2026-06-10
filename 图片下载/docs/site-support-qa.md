# Site Support QA

Date: 2026-06-10

## Scope

Checked the Chrome extension support path for:

- 小红书
- Pinterest
- 微信公众号
- 500px
- 堆糖

## Automated Coverage

Commands:

```bash
node tests/adapter-smoke.test.js
node tests/manifest-routes.test.js
for f in extension/background.js extension/content/site-adapters.js extension/content/content.js extension/sidepanel/sidepanel.js tests/adapter-smoke.test.js tests/manifest-routes.test.js; do node --check "$f" || exit 1; done
node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8'))"
```

Covered behavior:

- Content script route matches for all supported page URLs.
- Host permissions match each site's main image CDN.
- Each site adapter detects a representative content image.
- Each site adapter extracts a usable original image URL.
- Each site adapter generates a stable selection key.
- Extension JavaScript parses successfully.
- Manifest JSON parses successfully.

## Per-Site Status

### 小红书

- Page match: `https://www.xiaohongshu.com/explore/{id}`
- CDN permission: `https://*.xhscdn.com/*`
- Adapter test: passed
- Notes: public unauthenticated curl access to generic pages returned 404-style responses, so live DOM validation needs a logged-in browser session.

### Pinterest

- Page match: `https://www.pinterest.com/pin/{id}/`
- CDN permission: `https://*.pinimg.com/*`
- Adapter test: passed
- Notes: public HTML is app-shell heavy; DOM validation is best done in a real browser after the feed renders.

### 微信公众号

- Page match: `https://mp.weixin.qq.com/s/*`
- CDN permission: `https://mmbiz.qpic.cn/*`
- Adapter test: passed
- Notes: adapter uses `#js_content` and `data-src`, which matches article image behavior.

### 500px

- Page match: `https://500px.com/photo/{id}/...`
- CDN permission: `https://*.500px.org/*`
- Adapter test: passed
- Notes: public homepage returns mostly app-shell HTML; photo page validation should be done in a real browser.

### 堆糖

- Page match: `https://www.duitang.com/blog/?id={id}`
- CDN permission: `https://*.dtstatic.com/*`
- Adapter test: passed
- Notes: public HTML returned `dtstatic.com` image URLs; adapter normalizes thumbnail suffixes.

## Fixes Applied During QA

- Side panel now listens for content-script status messages, so selected counts update when images are selected directly on the page.
- Side panel refreshes status when the active tab changes or finishes loading.
- Content script no longer monkey-patches `history.pushState` / `history.replaceState`; it uses scroll, resize, popstate, mutation observer, and a periodic lightweight scan instead.
- Added adapter smoke tests.
- Added manifest route tests.

## Remaining Manual Validation

Full end-to-end validation still needs Chrome remote debugging or manual extension loading:

1. Load `extension/` as an unpacked extension.
2. Open one representative page per supported site.
3. Confirm hover button appears on content images.
4. Select one image using the page button.
5. Confirm side panel count updates immediately.
6. Run `选择当前屏幕`, `清空选择`, `复制图片链接`, and each download mode.

