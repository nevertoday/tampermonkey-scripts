const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const rules = JSON.parse(fs.readFileSync(path.join(root, 'rules/referer.json'), 'utf8'));
const contentCss = fs.readFileSync(path.join(root, 'content/content.css'), 'utf8');
const contentJs = fs.readFileSync(path.join(root, 'content/content.js'), 'utf8');

// --- manifest wiring -------------------------------------------------------
assert.ok(manifest.permissions.includes('declarativeNetRequest'), 'manifest must request declarativeNetRequest for the anti-hotlink Referer rules');
const ruleset = manifest.declarative_net_request?.rule_resources?.find((item) => item.path === 'rules/referer.json');
assert.ok(ruleset, 'manifest must register rules/referer.json as a static ruleset');
assert.equal(ruleset.enabled, true, 'the Referer ruleset must be enabled by default');
assert.ok(fs.existsSync(path.join(root, ruleset.path)), 'the referenced ruleset file must exist');

// --- Referer rules: one per protected image CDN ----------------------------
// Each CDN that enforces hotlink protection needs the matching site Referer so
// the side-panel preview <img> and the background fetch (both third-party from
// the extension's perspective) are served instead of 403'd.
const expected = {
  'huaban.com': 'https://huaban.com/',
  'xhscdn.com': 'https://www.xiaohongshu.com/',
  'pinimg.com': 'https://www.pinterest.com/',
  'dtstatic.com': 'https://www.duitang.com/',
  'mmbiz.qpic.cn': 'https://mp.weixin.qq.com/'
};

const optionalHostPermissions = (manifest.optional_host_permissions || []).join(' ');
const seenIds = new Set();
for (const [cdn, referer] of Object.entries(expected)) {
  const rule = rules.find((item) => item.condition?.urlFilter === `||${cdn}`);
  assert.ok(rule, `referer.json must contain a rule for ${cdn}`);
  assert.equal(rule.action.type, 'modifyHeaders', `${cdn} rule must modify headers`);
  const header = rule.action.requestHeaders?.find((h) => h.header.toLowerCase() === 'referer');
  assert.ok(header, `${cdn} rule must set a referer header`);
  assert.equal(header.operation, 'set', `${cdn} referer must use the "set" operation`);
  assert.equal(header.value, referer, `${cdn} referer must point at the owning site`);
  assert.equal(rule.condition.domainType, 'thirdParty', `${cdn} rule must stay scoped to third-party (extension) requests so normal browsing is untouched`);
  assert.ok(rule.condition.resourceTypes.includes('image'), `${cdn} rule must cover <img> preview requests`);
  assert.ok(rule.condition.resourceTypes.includes('xmlhttprequest') || rule.condition.resourceTypes.includes('other'), `${cdn} rule must cover background fetch/download requests`);
  // Host access is still required for modifyHeaders to take effect, but it is
  // now granted only after the user enables that site.
  const cdnHostPattern = cdn.includes('.') && cdn.split('.').length > 2 ? cdn : `*.${cdn}`;
  assert.ok(optionalHostPermissions.includes(cdn), `manifest optional_host_permissions must be able to grant access to ${cdn} (pattern like ${cdnHostPattern})`);
}

// rule ids must be unique positive integers
for (const rule of rules) {
  assert.ok(Number.isInteger(rule.id) && rule.id > 0, 'each DNR rule needs a positive integer id');
  assert.ok(!seenIds.has(rule.id), `duplicate DNR rule id ${rule.id}`);
  seenIds.add(rule.id);
}

// --- floating "+" buttons must be hover-only, not always visible -----------
// Regression: Pinterest/huaban use body-level floating controls; they must be
// hidden until hovered (or selected), matching in-host buttons.
assert.match(
  contentCss,
  /\.idx-floating-select-btn\s*\{[^}]*display:\s*none\s*!important/s,
  'floating select buttons must default to display:none so they do not blanket every image'
);
assert.match(
  contentCss,
  /\.idx-floating-select-btn\.idx-floating-visible[^{]*,\s*\.idx-floating-select-btn\.idx-active\s*\{[^}]*display:\s*flex\s*!important/s,
  'floating buttons must appear when hovered (idx-floating-visible) or selected (idx-active)'
);
assert.match(
  contentCss,
  /\.idx-floating-select-btn\.idx-floating-hidden\s*\{[^}]*display:\s*none\s*!important/s,
  'off-screen floating buttons must stay hidden'
);

// content.js must compute hover visibility for the single image under the cursor
// (topmost via elementsFromPoint), not every image whose rect contains the pointer.
assert.match(contentJs, /function refreshFloatingHover/, 'content.js must define refreshFloatingHover');
assert.match(contentJs, /function floatingButtonAtPointer/, 'hover must resolve a single button via the pointer');
assert.match(contentJs, /elementsFromPoint/, 'hover hit-testing must use elementsFromPoint for the topmost image');
assert.match(contentJs, /showHoverButtons === false/, 'floating hover must respect the showHoverButtons setting');
assert.match(contentJs, /scheduleFloatingHover\(\)/, 'pointermove must refresh floating hover state');

console.log('referer + floating-hover tests ok');
