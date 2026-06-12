const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../小红书-图片选择器.user.js'), 'utf8');

assert.match(source, /@match\s+https:\/\/www\.xiaohongshu\.com\/\*/, 'userscript should match xiaohongshu');
assert.match(source, /data-k="1"[\s\S]*data-m="list"/, 'download modal should show shortcut 1 for links');
assert.match(source, /data-k="2"[\s\S]*data-m="direct"/, 'download modal should show shortcut 2 for direct downloads');
assert.match(source, /data-k="3"[\s\S]*data-m="zip"/, 'download modal should show shortcut 3 for ZIP');
assert.match(source, /function downloadModeForKey/, 'download modal should resolve numeric shortcuts through a helper');
assert.match(source, /let progress = null/, 'dock should track download progress separately from selected count');
assert.match(source, /makeZip\(files,\s*async\s*\(packed\)/, 'ZIP packing should report per-file progress from makeZip');
assert.match(source, /async function makeZip\(files,\s*onProgress\)/, 'makeZip should accept a progress callback');
assert.match(source, /if \(onProgress\) await onProgress\(packed\)/, 'makeZip should call the progress callback after each packed file');
assert.match(source, /--ps-progress/, 'dock should expose progress as a CSS variable for the progress ring');

console.log('xiaohongshu userscript tests ok');
