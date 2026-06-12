const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const downloads = [];
const historyWrites = [];
const tabMessages = [];

const context = {
  Blob,
  TextEncoder,
  Uint8Array,
  Uint32Array,
  DataView,
  Math,
  Date,
  URL,
  btoa,
  setTimeout,
  chrome: {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} }
    },
    tabs: {
      sendMessage: async (tabId, message) => {
        tabMessages.push({ tabId, message });
      }
    },
    sidePanel: {
      setPanelBehavior: async () => {}
    },
    action: {
      onClicked: { addListener() {} }
    },
    downloads: {
      download: async (item) => {
        downloads.push(item);
        return downloads.length;
      }
    },
    storage: {
      local: {
        get: async () => ({ downloadHistory: [] }),
        set: async (value) => {
          historyWrites.push(value);
        }
      }
    }
  },
  fetch: async (url) => {
    const body = url.endsWith('a.jpg') ? 'alpha-image' : 'beta-image';
    return new Response(new Blob([body], { type: 'image/jpeg' }), { status: 200 });
  }
};

vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8'),
  context,
  { filename: 'background.js' }
);

(async () => {
  assert.equal(typeof context.handleDownload, 'function', 'background should expose handleDownload in script context');
  const result = await context.handleDownload({
    mode: 'zip',
    prefix: 'unit',
    site: { id: 'unit-site', name: 'Unit' },
    entries: [
      { id: 'a', url: 'https://example.com/a.jpg' },
      { id: 'b', url: 'https://example.com/b.jpg' }
    ]
  }, { tab: { id: 42 } });

  assert.equal(result.count, 2);
  assert.equal(result.failed, 0);
  assert.equal(result.mode, 'zip');
  assert.equal(downloads.length, 1);
  assert.deepEqual(
    tabMessages.map((item) => item.message.payload && {
      phase: item.message.payload.phase,
      done: item.message.payload.done,
      total: item.message.payload.total,
      mode: item.message.payload.mode
    }),
    [
      { phase: 'fetching', done: 0, total: 2, mode: 'zip' },
      { phase: 'fetching', done: 1, total: 2, mode: 'zip' },
      { phase: 'fetching', done: 2, total: 2, mode: 'zip' },
      { phase: 'packing', done: 0, total: 2, mode: 'zip' },
      { phase: 'packing', done: 1, total: 2, mode: 'zip' },
      { phase: 'packing', done: 2, total: 2, mode: 'zip' },
      { phase: 'saving', done: 2, total: 2, mode: 'zip' },
      { phase: 'done', done: 2, total: 2, mode: 'zip' }
    ],
    'background should stream ZIP fetch, pack, and save progress back to the content Dock'
  );
  assert.match(downloads[0].filename, /^unit-[a-f0-9]{8}\.zip$/);
  assert.match(downloads[0].url, /^data:application\/zip;base64,/);
  assert.equal(historyWrites.length, 1);
  assert.equal(historyWrites[0].downloadHistory[0].siteId, 'unit-site');
  assert.equal(JSON.stringify(historyWrites[0].downloadHistory[0].entries), JSON.stringify([
    { id: 'a', url: 'https://example.com/a.jpg' },
    { id: 'b', url: 'https://example.com/b.jpg' }
  ]));

  const zipBytes = Buffer.from(downloads[0].url.split(',')[1], 'base64');
  const entries = listZipEntries(zipBytes);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((entry) => entry.name).sort(), [
    `${downloads[0].filename.replace(/\.zip$/, '')}/001.jpg`,
    `${downloads[0].filename.replace(/\.zip$/, '')}/002.jpg`
  ]);
  assert.deepEqual(entries.map((entry) => entry.body).sort(), ['alpha-image', 'beta-image']);
  console.log('background download tests ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function listZipEntries(bytes) {
  const entries = [];
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const flags = bytes.readUInt16LE(offset + 6);
    const method = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const filenameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + filenameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = bytes.subarray(nameStart, nameStart + filenameLength).toString(flags & 0x0800 ? 'utf8' : 'binary');
    const data = bytes.subarray(dataStart, dataEnd);
    entries.push({
      name,
      body: method === 8 ? zlib.inflateRawSync(data).toString() : data.toString()
    });
    offset = dataEnd;
  }
  return entries;
}
