const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the cache lib in a self-like context (no indexedDB needed for the pure helpers).
const ctx = { self: {} };
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '../extension/lib/image-cache.js'), 'utf8'),
  ctx,
  { filename: 'image-cache.js' }
);

const ImageCache = ctx.self.ImageCache;
assert.ok(ImageCache, 'image-cache must expose a global ImageCache');
for (const fn of ['put', 'getBlob', 'has', 'evict', 'clear', 'keyFor', 'planEviction']) {
  assert.equal(typeof ImageCache[fn], 'function', `ImageCache.${fn} must exist`);
}

// keyFor strips the fragment so the same image with/without #hash hits one entry.
assert.equal(ImageCache.keyFor('https://cdn/x.jpg#thumb'), 'https://cdn/x.jpg');
assert.equal(ImageCache.keyFor(undefined), '');

// planEviction: drop the oldest entries first, only until back under budget.
const records = [
  { key: 'a', size: 100, createdAt: 1 },
  { key: 'b', size: 100, createdAt: 2 },
  { key: 'c', size: 100, createdAt: 3 }
];
// Spread results into the test realm (vm arrays have a different Array prototype).
const plan = (budget) => [...ImageCache.planEviction(records, budget)];
assert.deepEqual(plan(1000), [], 'under budget evicts nothing');
assert.deepEqual(plan(250), ['a'], 'evicts just the oldest to fit');
assert.deepEqual(plan(150), ['a', 'b'], 'evicts oldest-first until under budget');
assert.deepEqual(plan(0), ['a', 'b', 'c'], 'zero budget clears all, oldest first');

assert.ok(ImageCache.MAX_BYTES > 0, 'a positive byte cap must be defined');

console.log('image-cache tests ok');
