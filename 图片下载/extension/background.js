importScripts('lib/image-cache.js', 'lib/i18n.js');

const I18n = self.ImageDownloaderI18n;
const t = (key, vars) => I18n.t(key, vars);
// Keep the worker's language in sync with the saved setting.
chrome.storage.sync.get('settings').then((stored) => I18n.setLang(stored?.settings?.language)).catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) I18n.setLang(changes.settings.newValue?.language);
});

const DEFAULT_CONCURRENCY = 4;
const HISTORY_KEY = 'downloadHistory';
const HISTORY_LIMIT = 50;
const pendingDownloadNames = new Map();
const TRANSIENT_DOWNLOAD_PREFIX = 'idx-transient-download:';

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  prunePendingDownloadNames();
  const filename = consumePendingDownloadName(item.url) || consumePendingDownloadName(item.finalUrl);
  if (!filename) return;
  suggest({ filename, conflictAction: 'uniquify' });
});

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (!chrome.sidePanel?.open || !tab?.id) return;
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'image-downloader-background') return false;

  if (message.type === 'download') {
    handleDownload(message.payload || {}, sender)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message.type === 'cache-entries') {
    cacheEntries(message.payload?.entries || [])
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message.type === 'clear-image-cache') {
    ImageCache.clear()
      .then((ok) => sendResponse({ ok }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  return false;
});

// Best-effort: silently fetch and store image bytes so a record stays usable after
// its CDN links expire. Skips anything already cached. Never throws to the caller.
async function cacheEntries(entries) {
  const list = Array.isArray(entries) ? entries.filter((entry) => /^https?:\/\//i.test(entry?.url || '')) : [];
  if (!list.length) return;
  await parallel(list, DEFAULT_CONCURRENCY, async (entry) => {
    try {
      if (await ImageCache.has(entry.url)) return;
      const response = await fetch(entry.url, { credentials: 'omit', cache: 'force-cache' });
      if (!response.ok) return;
      await ImageCache.put(entry.url, await response.blob());
    } catch (_) {
      // best-effort
    }
  });
}

async function handleDownload(payload, sender = {}) {
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  if (!entries.length) throw new Error(t('toast_none_selected'));

  const mode = payload.mode || 'zip';
  const progress = downloadProgressReporter(sender, mode, entries.length);
  const prefix = sanitizeFilename(payload.prefix || 'images');
  const batch = hash(entries.map((entry) => entry.url).join('\n')).slice(0, 8);
  const baseName = `${prefix}-${batch}`;

  if (mode === 'links') {
    const body = entries.map((entry) => entry.url).join('\n');
    await downloadBlob(new Blob([body], { type: 'text/plain;charset=utf-8' }), `${baseName}.txt`);
    const result = { count: entries.length, failed: 0, mode };
    await recordHistory(payload, result);
    cacheEntries(entries).catch(() => {}); // silently keep bytes so links survive expiry
    return result;
  }

  if (mode === 'direct') {
    let failed = 0;
    await progress(0);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      try {
        // Prefer cached bytes: survives expired CDN links and avoids hotlink 403s.
        const cached = await ImageCache.getBlob(entry.url);
        const filename = `${baseName}-${String(index + 1).padStart(3, '0')}.${ext(entry.url, cached?.type)}`;
        if (cached) {
          await downloadBlob(cached, filename);
        } else {
          await downloadUrl(entry.url, filename);
        }
      } catch (_) {
        failed += 1;
      }
      await progress(index + 1);
      await delay(250);
    }
    const result = { count: entries.length - failed, failed, mode };
    await progress({ phase: 'done', done: entries.length });
    await recordHistory(payload, result);
    cacheEntries(entries).catch(() => {}); // backfill any not-yet-cached bytes
    return result;
  }

  const files = [];
  let failed = 0;
  let processed = 0;
  await progress({ phase: 'fetching', done: 0 });
  await parallel(entries, DEFAULT_CONCURRENCY, async (entry, index) => {
    try {
      // Cache-first so re-packing works even after the original link expires.
      let blob = await ImageCache.getBlob(entry.url);
      if (!blob) {
        const response = await fetch(entry.url, { credentials: 'omit', cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        blob = await response.blob();
        ImageCache.put(entry.url, blob).catch(() => {});
      }
      files.push({
        name: `${baseName}/${String(index + 1).padStart(3, '0')}.${ext(entry.url, blob.type)}`,
        blob
      });
    } catch (_) {
      failed += 1;
    } finally {
      processed += 1;
      await progress({ phase: 'fetching', done: processed });
    }
  });

  if (!files.length) throw new Error(t('zip_empty'));
  await progress({ phase: 'packing', done: 0, total: files.length });
  const zip = await makeZip(files, async (done) => {
    await progress({ phase: 'packing', done, total: files.length });
  });
  await progress({ phase: 'saving', done: files.length, total: files.length });
  await downloadBlob(zip, `${baseName}.zip`);
  const result = { count: files.length, failed, mode: 'zip' };
  await progress({ phase: 'done', done: files.length, total: files.length });
  await recordHistory(payload, result);
  return result;
}

function downloadProgressReporter(sender, mode, total) {
  const tabId = sender?.tab?.id;
  return async (value) => {
    if (!tabId || !chrome.tabs?.sendMessage) return;
    const payload = typeof value === 'object' && value !== null
      ? value
      : { done: value };
    await chrome.tabs.sendMessage(tabId, {
      target: 'image-downloader-content',
      type: 'download-progress',
      payload: {
        mode,
        phase: payload.phase || 'active',
        done: payload.done,
        total: payload.total || total
      }
    }).catch(() => {});
  };
}

async function recordHistory(payload, result) {
  try {
    await addHistory(payload, result);
  } catch (_) {
    // History is best-effort; a storage failure should not make a completed download look failed.
  }
}

async function addHistory(payload, result) {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  const history = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
  history.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: 'download',
    siteId: payload.site?.id || payload.siteId || '',
    siteName: payload.site?.name || payload.siteName || payload.prefix || t('images_word'),
    prefix: payload.prefix || 'images',
    mode: result.mode,
    count: result.count || 0,
    failed: result.failed || 0,
    entries: normalizeHistoryEntries(payload.entries),
    createdAt: Date.now()
  });
  await chrome.storage.local.set({ [HISTORY_KEY]: history.slice(0, HISTORY_LIMIT) });
}

function normalizeHistoryEntries(entries) {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  return entries
    .map((entry, index) => ({
      id: String(entry?.id || `entry-${index}`),
      url: String(entry?.url || '').trim()
    }))
    .filter((entry) => {
      if (!/^https?:\/\//i.test(entry.url) || seen.has(entry.url)) return false;
      seen.add(entry.url);
      return true;
    });
}

async function downloadUrl(url, filename) {
  rememberDownloadName(url, filename);
  return chrome.downloads.download({
    url,
    filename,
    saveAs: false,
    conflictAction: 'uniquify'
  });
}

async function downloadBlob(blob, filename) {
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const safeFilename = sanitizeFilename(filename);
  const key = `${TRANSIENT_DOWNLOAD_PREFIX}${token}`;
  const stored = await ImageCache.put(key, blob, { skipEvict: true });
  if (!stored) throw new Error(t('download_prepare_failed'));
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`download/download.html?token=${encodeURIComponent(token)}&filename=${encodeURIComponent(safeFilename)}`),
    active: false
  });
  return 0;
}

function rememberDownloadName(url, filename) {
  if (!url || !filename) return;
  const key = String(url);
  const queue = pendingDownloadNames.get(key) || [];
  queue.push({ filename, expiresAt: Date.now() + 60000 });
  pendingDownloadNames.set(key, queue);
}

function consumePendingDownloadName(url) {
  if (!url) return '';
  const key = String(url);
  const queue = pendingDownloadNames.get(key);
  if (!queue?.length) return '';
  const item = queue.shift();
  if (!queue.length) pendingDownloadNames.delete(key);
  return item?.filename || '';
}

function prunePendingDownloadNames() {
  const now = Date.now();
  for (const [key, queue] of pendingDownloadNames.entries()) {
    const live = queue.filter((item) => item.expiresAt > now);
    if (live.length) pendingDownloadNames.set(key, live);
    else pendingDownloadNames.delete(key);
  }
}

async function makeZip(files, onProgress) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let off = 0;
  let packed = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, off, true);
    centralHeader.set(nameBytes, 46);

    locals.push(localHeader, data);
    centrals.push(centralHeader);
    off += localHeader.length + data.length;
    packed += 1;
    if (onProgress) await onProgress(packed);
  }

  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, off, true);
  return new Blob([...locals, ...centrals, end], { type: 'application/zip' });
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = ~0;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (~crc) >>> 0;
}

function ext(url, mime) {
  if (mime) {
    const fromMime = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/avif': 'avif'
    }[mime.toLowerCase()];
    if (fromMime) return fromMime;
  }
  const match = String(url).split('?')[0].match(/\.(jpe?g|png|webp|gif|avif)$/i);
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

function sanitizeFilename(value) {
  return String(value).trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'images';
}

function hash(input) {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, '0');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parallel(items, limit, fn) {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const current = index;
        index += 1;
        await fn(items[current], current);
      }
    })
  );
}
