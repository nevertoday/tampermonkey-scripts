# Site Support QA

Date: 2026-06-12

## Scope

Checked the Chrome extension support path for:

- 小红书
- Pinterest
- 微信公众号
- 500px
- 堆糖
- 花瓣

## Automated Coverage

Commands:

```bash
node tests/adapter-smoke.test.js
node tests/manifest-routes.test.js
node tests/sidepanel-trigger.test.js
node tests/background-download.test.js
node tests/huaban-userscript.test.js
for f in extension/background.js extension/content/site-adapters.js extension/content/content.js extension/sidepanel/sidepanel.js tests/adapter-smoke.test.js tests/manifest-routes.test.js tests/sidepanel-trigger.test.js tests/background-download.test.js tests/huaban-userscript.test.js 花瓣-图片选择器.user.js; do node --check "$f" || exit 1; done
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
- Side panel action behavior, fallback open behavior, and mini panel collapsed setting are covered.

## Real Browser E2E

Command:

```bash
node tmp/load-extension-pipe.mjs
EXTENSION_ID=amdccejfafhdpjbbgiddmeojkamjgehl node tmp/e2e-extension.mjs
```

Chrome 137+ no longer reliably accepts `--load-extension` in this environment, so the E2E harness starts Chrome with `--remote-debugging-pipe --enable-unsafe-extension-debugging` and loads the unpacked extension through CDP `Extensions.loadUnpacked`.

Result:

- `tmp/e2e-results/summary.json`: `failed: []`
- Screenshots saved under `tmp/e2e-results/*-live.png`, `*-fixture.png`, and `*-sidepanel.png`.

Covered behavior per supported site:

- Content script injects on the real supported URL.
- The correct site adapter is selected in the content-script isolated world.
- The bottom mini panel renders on live pages.
- A same-origin representative image fixture is detected.
- `选图` selects one image at a time.
- `复制图片链接` command path returns a normalized image URL.
- Fold button collapses the mini panel.
- Count click expands the mini panel.
- `清空选择` resets selection count to 0.
- Side panel renders `站点` / `历史` / `设置`, shows all six site cards, and opens donation QR images from the settings tab modal.

## Per-Site Status

### 小红书

- Page match: `https://www.xiaohongshu.com/explore/{id}`
- CDN permission: `https://*.xhscdn.com/*`
- Adapter test: passed
- Real browser E2E: passed.
- Live page evidence: unauthenticated page redirected to `/explore`, but content script injected; adapter detected 36 content images and 22 selection buttons.
- Same-origin fixture command path: select, links, fold, expand, and clear passed.

### Pinterest

- Page match: `https://www.pinterest.com/pin/{id}/`
- CDN permission: `https://*.pinimg.com/*`
- Adapter test: passed
- Real browser E2E: passed.
- Live page evidence: unauthenticated page showed login UI with no content images, but content script injected and mini panel rendered.
- Same-origin fixture command path: select, original URL normalization, links, fold, expand, and clear passed.

### 微信公众号

- Page match: `https://mp.weixin.qq.com/s/*`
- CDN permission: `https://mmbiz.qpic.cn/*`
- Adapter test: passed
- Real browser E2E: passed.
- Live page evidence: test article URL returned `参数错误`, but content script injected and mini panel rendered.
- Same-origin fixture command path: `#js_content` image detection, `data-src` normalization, links, fold, expand, and clear passed.

### 500px

- Page match: `https://500px.com/photo/{id}/...`
- CDN permission: `https://*.500px.org/*`
- Adapter test: passed
- Real browser E2E: passed.
- Live page evidence: public photo page loaded; adapter detected 8 content images and 8 selection buttons.
- Same-origin fixture command path: select, links, fold, expand, and clear passed.

### 堆糖

- Page match: `https://www.duitang.com/blog/?id={id}`
- CDN permission: `https://*.dtstatic.com/*`
- Adapter test: passed
- Real browser E2E: passed.
- Live page evidence: public search page loaded; adapter detected 24 content images and 4 in-viewport selection buttons.
- Same-origin fixture command path: select, thumbnail URL normalization, links, fold, expand, and clear passed.

### 花瓣

- Page match: `https://huaban.com/pins/{id}` and `https://huaban.com/discovery`
- CDN permission: `https://*.huaban.com/*`
- Adapter test: passed.
- Userscript test: passed.
- Real browser evidence: current Chrome page inspection showed content images under `a[href*="/pins/"]` using `gd-hbimg-edge.huaban.com`, while avatars also use the same CDN but are small `_sq75` / `_fw86` assets under `/user/` links.
- URL evidence: `_fw240webp` / `_fw480webp` image URLs can be restored to the original CDN object by removing the size suffix and preserving `auth_key`; range requests returned `206 image/jpeg`.
- Live extension verification: passed after reloading local extension in current Chrome.
- Hidden-tab scan fallback: passed; a background Huaban tab rendered the Dock and 38 selection buttons with 0 avatar buttons.
- Selection path: passed; clicking one select button changed count to 1 with one active host, clicking again returned count to 0.
- Content command path: passed; `links` returned one normalized original URL without `_fw240webp` / `_fw480webp`, preserving `auth_key`.

## Fixes Applied During QA

- Side panel now listens for content-script status messages, so selected counts update when images are selected directly on the page.
- Side panel refreshes status when the active tab changes or finishes loading.
- Content script no longer monkey-patches `history.pushState` / `history.replaceState`; it uses scroll, resize, popstate, mutation observer, and a periodic lightweight scan instead.
- Mini panel now recovers if the host page replaces/removes `document.body` content after injection.
- `选图` handles images that are detectable by adapter metadata but have a transient zero layout box.
- Added background-tab scan fallback for Chrome tabs where `requestAnimationFrame` is throttled.
- Added adapter smoke tests.
- Added manifest route tests.
- Added side panel trigger tests.

## Known E2E Limits

- Pinterest and 微信公众号 public URLs used in automated E2E did not expose real article/pin image content without a valid page/login state; their command paths were verified with same-origin representative DOM fixtures.
- The E2E verifies link extraction and command routing, but avoids mass downloading files from live sites.
