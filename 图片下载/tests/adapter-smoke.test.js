const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
  const images = adapter.images(rootWith(image));
  assert.equal(images.length, 1, `${siteId} should detect one content image`);
  const url = adapter.url(image);
  assert.match(url, expectUrlIncludes);
  assert.match(adapter.key(image, url), expectKeyPrefix);
}

const xhsHost = new FakeElement({ dataset: { noteId: 'abc123' } });
const xhsImg = new FakeElement({
  src: 'https://sns-img-qc.xhscdn.com/image.jpg',
  closestElement: xhsHost,
  naturalWidth: 640,
  naturalHeight: 800
});
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
const pinImg = new FakeElement({
  src: 'https://i.pinimg.com/236x/a/b/c/photo.jpg',
  attrs: { srcset: 'https://i.pinimg.com/236x/a/b/c/photo.jpg 1x, https://i.pinimg.com/originals/a/b/c/photo.jpg 2x' },
  closestElement: pinHost,
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

console.log('adapter smoke tests ok');
