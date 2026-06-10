const DEFAULT_CONCURRENCY = 4;

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'image-downloader-background') return false;

  if (message.type === 'download') {
    handleDownload(message.payload || {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  return false;
});

async function handleDownload(payload) {
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  if (!entries.length) throw new Error('还没有选择图片。请先在页面上选择图片。');

  const mode = payload.mode || 'zip';
  const prefix = sanitizeFilename(payload.prefix || 'images');
  const batch = hash(entries.map((entry) => entry.url).join('\n')).slice(0, 8);
  const baseName = `${prefix}-${batch}`;

  if (mode === 'links') {
    const body = entries.map((entry) => entry.url).join('\n');
    await downloadDataUrl(textDataUrl(body), `${baseName}.txt`);
    return { count: entries.length, failed: 0, mode };
  }

  if (mode === 'direct') {
    let failed = 0;
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const filename = `${baseName}-${String(index + 1).padStart(3, '0')}.${ext(entry.url)}`;
      try {
        await chrome.downloads.download({
          url: entry.url,
          filename,
          saveAs: false,
          conflictAction: 'uniquify'
        });
      } catch (_) {
        failed += 1;
      }
      await delay(250);
    }
    return { count: entries.length - failed, failed, mode };
  }

  const files = [];
  let failed = 0;
  await parallel(entries, DEFAULT_CONCURRENCY, async (entry, index) => {
    try {
      const response = await fetch(entry.url, { credentials: 'omit', cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      files.push({
        name: `${baseName}/${String(index + 1).padStart(3, '0')}.${ext(entry.url, blob.type)}`,
        blob
      });
    } catch (_) {
      failed += 1;
    }
  });

  if (!files.length) throw new Error('没有抓取到图片。可以改用“保存链接文本”。');
  const zip = await makeZip(files);
  await downloadDataUrl(await blobToDataUrl(zip), `${baseName}.zip`);
  return { count: files.length, failed, mode: 'zip' };
}

function textDataUrl(text) {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
}

async function downloadDataUrl(url, filename) {
  return chrome.downloads.download({
    url,
    filename,
    saveAs: false,
    conflictAction: 'uniquify'
  });
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

async function makeZip(files) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let off = 0;

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
