const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../pinterest-图片选择器.user.js'), 'utf8');

assert.match(source, /@match\s+https:\/\/www\.pinterest\.com\/\*/, 'userscript should match Pinterest');
assert.match(source, /data-k="1"[\s\S]*data-m="list"/, 'download modal should show shortcut 1 for links');
assert.match(source, /data-k="2"[\s\S]*data-m="direct"/, 'download modal should show shortcut 2 for direct downloads');
assert.match(source, /data-k="3"[\s\S]*data-m="zip"/, 'download modal should show shortcut 3 for ZIP');
assert.match(source, /function downloadModeForKey/, 'download modal should resolve numeric shortcuts through a helper');
assert.match(source, /downloadModeForKey\(e\.key\)[\s\S]{0,260}execDl\(mode, isNew\)/, 'pressing 1/2/3 in the modal should trigger the chosen download mode');
assert.match(source, /let progress = null/, 'dock should track download progress separately from selected count');
assert.match(source, /setProgress\([^)]*'fetching'[\s\S]*done[\s\S]*entries\.length/, 'ZIP fetching should update numeric progress');
assert.match(source, /setProgress\([^)]*'packing'[\s\S]*0[\s\S]*files\.length/, 'ZIP packing should start a numeric progress stage');
assert.match(source, /makeZip\(files,\s*async\s*\(packed\)/, 'ZIP packing should report per-file progress from makeZip');
assert.match(source, /async function makeZip\(files,\s*onProgress\)/, 'makeZip should accept a progress callback');
assert.match(source, /if \(onProgress\) await onProgress\(packed\)/, 'makeZip should call the progress callback after each packed file');
assert.match(source, /--ps-progress/, 'dock should expose progress as a CSS variable for the progress ring');

console.log('pinterest userscript tests ok');
