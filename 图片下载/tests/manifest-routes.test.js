const assert = require('node:assert/strict');
const fs = require('node:fs');

const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));
const contentMatches = manifest.content_scripts.flatMap((script) => script.matches || []);
const hostPermissions = manifest.host_permissions || [];

const pageUrls = [
  'https://www.xiaohongshu.com/explore/abc123',
  'https://www.pinterest.com/pin/987654321/',
  'https://mp.weixin.qq.com/s/demo',
  'https://500px.com/photo/123456/demo',
  'https://www.duitang.com/blog/?id=2468'
];

const imageUrls = [
  'https://sns-img-qc.xhscdn.com/image.jpg',
  'https://i.pinimg.com/originals/a/b/c/photo.jpg',
  'https://mmbiz.qpic.cn/mmbiz_png/demo/640?wx_fmt=png',
  'https://drscdn.500px.org/photo/123456/demo.jpg',
  'https://c-ssl.dtstatic.com/uploads/item/demo.png'
];

for (const url of pageUrls) {
  assert.ok(
    contentMatches.some((pattern) => chromeMatch(pattern, url)),
    `content script should match ${url}`
  );
}

for (const url of imageUrls) {
  assert.ok(
    hostPermissions.some((pattern) => chromeMatch(pattern, url)),
    `host permission should match ${url}`
  );
}

function chromeMatch(pattern, rawUrl) {
  const url = new URL(rawUrl);
  const match = pattern.match(/^(\*|http|https):\/\/([^/]+)(\/.*)$/);
  if (!match) return false;

  const [, scheme, hostPattern, pathPattern] = match;
  if (scheme !== '*' && scheme !== url.protocol.slice(0, -1)) return false;
  if (!hostMatches(hostPattern, url.hostname)) return false;
  return globToRegExp(pathPattern).test(`${url.pathname}${url.search}`);
}

function hostMatches(pattern, host) {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return pattern === host;
}

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

console.log('manifest route tests ok');
