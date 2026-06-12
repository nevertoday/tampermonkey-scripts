const assert = require('node:assert/strict');
const fs = require('node:fs');

const scriptPath = '花瓣-图片选择器.user.js';
assert.ok(fs.existsSync(scriptPath), 'Huaban userscript file should exist');

const source = fs.readFileSync(scriptPath, 'utf8');

assert.match(source, /@name\s+花瓣图片选择器/, 'userscript should be named for Huaban');
assert.match(source, /@match\s+https:\/\/huaban\.com\/\*/, 'userscript should match huaban.com');
assert.match(source, /@match\s+https:\/\/www\.huaban\.com\/\*/, 'userscript should match www.huaban.com');
assert.match(source, /@connect\s+gd-hbimg-edge\.huaban\.com/, 'userscript should allow Huaban image CDN requests');
assert.match(source, /function bestUrl\(img\)/, 'userscript should extract a best image URL');
assert.match(source, /stripHuabanSize/, 'userscript should restore original Huaban CDN URLs');
assert.match(source, /a\[href\*="\/pins\/"\]/, 'userscript should scope content images to pin links');
assert.match(source, /function imgAt\(x, y\)/, 'userscript should support pointer-based single-image shortcuts');
assert.match(source, /document\.hidden[\s\S]{0,180}setTimeout/, 'userscript scanning should keep working when requestAnimationFrame is throttled in background tabs');
assert.doesNotMatch(source, /全选<kbd>A<\/kbd>/, 'A key should not be presented as bulk select in the userscript dock');
assert.match(source, /选图<kbd>A<\/kbd>/, 'A key should be presented as selecting the pointed image');

console.log('huaban userscript tests ok');
