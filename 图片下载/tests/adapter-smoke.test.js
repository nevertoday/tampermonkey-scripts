const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const contentCss = fs.readFileSync(path.join(__dirname, '../extension/content/content.css'), 'utf8');
assert.match(contentCss, /\.idx-image-host\s*\{[^}]*pointer-events:\s*auto\s*!important/s, 'image host must remain clickable on WeChat articles that set pointer-events: none');
assert.match(contentCss, /\.idx-select-btn\s*\{[^}]*pointer-events:\s*auto\s*!important/s, 'select button must receive pointer events even inside hostile article styles');

class FakeElement {
  constructor(attrs = {}) {
    Object.assign(this, attrs);
    this.attrs = attrs.attrs || {};
    this.dataset = attrs.dataset || {};
    this.parentElement = attrs.parentElement || null;
    this.naturalWidth = attrs.naturalWidth || 320;
    this.naturalHeight = attrs.naturalHeight || 240;
    this.width = attrs.width || this.naturalWidth;
    this.height = attrs.height || this.naturalHeight;
    this.className = attrs.className || '';
    this.id = attrs.id || '';
    this.alt = attrs.alt || '';
    this.href = attrs.href || '';
    this.src = attrs.src || '';
    this.currentSrc = attrs.currentSrc || '';
  }

  getAttribute(name) {
    return this.attrs[name] || null;
  }

  getBoundingClientRect() {
    return {
      width: this.width,
      height: this.height,
      top: 0,
      bottom: this.height
    };
  }

  closest() {
    if (this.closestMap && arguments.length) {
      const selector = arguments[0];
      for (const [pattern, element] of this.closestMap) {
        if (selector.includes(pattern)) return element;
      }
      return null;
    }
    return this.closestElement || this.parentElement || null;
  }

  matches() {
    return false;
  }

  querySelector(selector) {
    if (selector.includes('/pin/')) return this.pinLink || null;
    if (selector.includes('/explore/') || selector.includes('/discovery/item/')) return this.noteLink || null;
    if (selector.includes('[data-test-pin-id]')) return this.pinIdElement || null;
    return this.queryResult || null;
  }

  querySelectorAll() {
    return this.children || [];
  }
}

function loadAdapters(location) {
  const context = {
    URL,
    location,
    document: {
      querySelector: () => null,
      querySelectorAll: () => []
    },
    window: {}
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../extension/content/site-adapters.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'site-adapters.js' });
  return { bridge: context.window.ImageDownloaderAdapters, context };
}

function rootWith(...images) {
  return { querySelectorAll: () => images };
}

function runCase({ host, href, siteId, image, expectUrlIncludes, expectKeyPrefix, documentRoot }) {
  const { bridge, context } = loadAdapters({ hostname: host, href });
  if (documentRoot) {
    context.document.querySelector = (selector) => selector === '#js_content' ? documentRoot : null;
  }
  const adapter = bridge.currentAdapter();
  assert.equal(adapter.id, siteId);
  assert.ok(adapter.theme?.accent, `${siteId} should define a visible site accent color`);
  assert.ok(adapter.theme?.rgb, `${siteId} should define RGB values for CSS rgba usage`);
  assert.ok(adapter.theme?.dark, `${siteId} should define a darker hover/accent color`);
  assert.ok(adapter.theme?.badge, `${siteId} should define a compact Dock badge`);
  const images = adapter.images(rootWith(image));
  assert.equal(images.length, 1, `${siteId} should detect one content image`);
  const url = adapter.url(image);
  assert.match(url, expectUrlIncludes);
  assert.match(adapter.key(image, url), expectKeyPrefix);
}

{
  const { bridge } = loadAdapters({ hostname: 'www.xiaohongshu.com', href: 'https://www.xiaohongshu.com/explore/abc123' });
  const expectedThemes = {
    xiaohongshu: '#ff2442',
    pinterest: '#bd081c',
    wechat: '#07c160',
    '500px': '#0099e5',
    duitang: '#e86f8f',
    huaban: '#c95f68'
  };
  for (const adapter of bridge.adapters) {
    assert.equal(adapter.theme.accent, expectedThemes[adapter.id], `${adapter.id} should keep its own recognizable site color`);
  }
}

const xhsHost = new FakeElement({ dataset: { noteId: 'abc123' } });
const xhsImageParent = new FakeElement();
const xhsImg = new FakeElement({
  src: 'https://sns-img-qc.xhscdn.com/image.jpg',
  parentElement: xhsImageParent,
  closestMap: [
    ['swiper-slide', null],
    ['note-item', xhsHost]
  ],
  naturalWidth: 640,
  naturalHeight: 800
});
{
const { bridge } = loadAdapters({ hostname: 'www.xiaohongshu.com', href: 'https://www.xiaohongshu.com/explore/abc123' });
const adapter = bridge.currentAdapter();
assert.equal(adapter.hostFor(xhsImg), xhsImageParent, 'xiaohongshu should attach controls to the image parent instead of the note card');
}
runCase({
  host: 'www.xiaohongshu.com',
  href: 'https://www.xiaohongshu.com/explore/abc123',
  siteId: 'xiaohongshu',
  image: xhsImg,
  expectUrlIncludes: /xhscdn\.com\/image\.jpg/,
  expectKeyPrefix: /^abc123-/
});

const pinHost = new FakeElement();
pinHost.pinIdElement = { getAttribute: () => '987654321' };
const pinCloseupHost = new FakeElement({ attrs: { 'data-test-id': 'closeup-visual-container' } });
const pinImg = new FakeElement({
  src: 'https://i.pinimg.com/236x/a/b/c/photo.jpg',
  attrs: { srcset: 'https://i.pinimg.com/236x/a/b/c/photo.jpg 1x, https://i.pinimg.com/originals/a/b/c/photo.jpg 2x' },
  closestMap: [
    ['closeup-visual-container', null],
    ['data-grid-item', pinHost]
  ],
  naturalWidth: 320,
  naturalHeight: 480
});
runCase({
  host: 'www.pinterest.com',
  href: 'https://www.pinterest.com/pin/987654321/',
  siteId: 'pinterest',
  image: pinImg,
  expectUrlIncludes: /\/originals\/a\/b\/c\/photo\.jpg$/,
  expectKeyPrefix: /^987654321$/
});
{
  const { bridge } = loadAdapters({ hostname: 'www.pinterest.com', href: 'https://www.pinterest.com/pin/987654321/' });
  const adapter = bridge.currentAdapter();
  const closeupImg = new FakeElement({
    src: 'https://i.pinimg.com/1200x/a/b/c/photo.jpg',
    closestMap: [
      ['closeup-visual-container', pinCloseupHost]
    ],
    naturalWidth: 1200,
    naturalHeight: 1600
  });
  assert.equal(adapter.usesFloatingControls(closeupImg), true, 'Pinterest closeup images should use body-level floating controls');
  assert.equal(adapter.usesFloatingControls(pinImg), true, 'Pinterest feed/grid images should use body-level floating controls so card links cannot intercept clicks');
}

const wxImg = new FakeElement({
  attrs: {
    'data-src': 'https://mmbiz.qpic.cn/mmbiz_png/demo/640?wx_fmt=png&tp=webp&wxfrom=5',
    'data-w': '640',
    'data-ratio': '0.75'
  },
  naturalWidth: 0,
  naturalHeight: 0,
  width: 640,
  height: 480
});
const wxRoot = rootWith(wxImg);
runCase({
  host: 'mp.weixin.qq.com',
  href: 'https://mp.weixin.qq.com/s/demo',
  siteId: 'wechat',
  image: wxImg,
  documentRoot: wxRoot,
  expectUrlIncludes: /mmbiz\.qpic\.cn\/mmbiz_png\/demo\/640\?wx_fmt=png$/,
  expectKeyPrefix: /^wx-/
});

const pxImg = new FakeElement({
  src: 'https://drscdn.500px.org/photo/123456/q%3D80_m%3D2000/v2?sig=abc',
  naturalWidth: 800,
  naturalHeight: 600
});
runCase({
  host: '500px.com',
  href: 'https://500px.com/photo/123456/demo',
  siteId: '500px',
  image: pxImg,
  expectUrlIncludes: /drscdn\.500px\.org\/photo\/123456/,
  expectKeyPrefix: /^px5-123456$/
});

const dtImg = new FakeElement({
  src: 'https://c-ssl.dtstatic.com/uploads/item/demo.thumb.400_0_webp',
  attrs: { 'data-src': 'https://c-ssl.dtstatic.com/uploads/item/demo.thumb.400_0_webp' },
  naturalWidth: 600,
  naturalHeight: 600
});
runCase({
  host: 'www.duitang.com',
  href: 'https://www.duitang.com/blog/?id=2468',
  siteId: 'duitang',
  image: dtImg,
  expectUrlIncludes: /dtstatic\.com\/uploads\/item\/demo$/,
  expectKeyPrefix: /^dt-2468-/
});

const hbHost = new FakeElement({
  href: 'https://huaban.com/pins/5172677444',
  naturalWidth: 0,
  naturalHeight: 0
});
const hbImg = new FakeElement({
  src: 'https://gd-hbimg-edge.huaban.com/small/bb2938123d6fdaaa26d7f9c0d69c0f9834b648251a060-DZeFcW_fw240webp?auth_key=demo',
  currentSrc: 'https://gd-hbimg-edge.huaban.com/small/bb2938123d6fdaaa26d7f9c0d69c0f9834b648251a060-DZeFcW_fw240webp?auth_key=demo',
  attrs: {
    srcset: 'https://gd-hbimg-edge.huaban.com/small/bb2938123d6fdaaa26d7f9c0d69c0f9834b648251a060-DZeFcW_fw480webp?auth_key=demo 2x'
  },
  className: 'transparent-img-bg hb-image',
  closestMap: [
    ['/pins/', hbHost]
  ],
  parentElement: hbHost,
  naturalWidth: 240,
  naturalHeight: 145
});
const hbAvatar = new FakeElement({
  src: 'https://gd-hbimg-edge.huaban.com/f73c1a23b659c506105906fcb4138a5c248d13cc181d-Rxv2dm_sq75webp?auth_key=demo',
  className: 'P9HW8y2_ D0Yvsg4Q hb-image',
  alt: '用户头像',
  href: 'https://huaban.com/user/demo',
  naturalWidth: 32,
  naturalHeight: 32,
  width: 32,
  height: 32
});
{
  const { bridge } = loadAdapters({ hostname: 'huaban.com', href: 'https://huaban.com/pins/5172677444' });
  const adapter = bridge.currentAdapter();
  assert.equal(adapter.id, 'huaban');
  const images = adapter.images(rootWith(hbImg, hbAvatar));
  assert.equal(images.length, 1, 'huaban should detect pin content images and ignore avatars from the same CDN');
  assert.equal(images[0], hbImg, 'huaban should return the pin content image');
  assert.equal(adapter.hostFor(hbImg), hbHost, 'huaban should still resolve the pin link/card host for selection keys and metadata');
  assert.equal(adapter.usesFloatingControls(hbImg), true, 'huaban waterfall cards should use body-level floating controls so pin links cannot intercept clicks');
  const url = adapter.url(hbImg);
  assert.match(url, /gd-hbimg-edge\.huaban\.com\/bb2938123d6fdaaa26d7f9c0d69c0f9834b648251a060-DZeFcW\?auth_key=demo$/, 'huaban should restore the original CDN image URL and keep auth_key');
  assert.match(adapter.key(hbImg, url), /^hb-5172677444-/, 'huaban should key selections by pin id plus URL hash');
}

console.log('adapter smoke tests ok');
