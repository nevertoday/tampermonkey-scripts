// Shared local image-byte cache (IndexedDB).
//
// Image CDNs for huaban / xiaohongshu sign their URLs with an expiring token, so
// a history record's links go dead after a while — previews break and re-download
// 403s. To stay resilient without uploading anything to a third party, we keep the
// actual image bytes locally: cached on first download, served back for previews
// and re-downloads even after the original link expires.
//
// Loaded in both the service worker (importScripts) and the side panel (<script>);
// both run on the same chrome-extension origin and therefore share one database.
(function (global) {
  'use strict';

  const DB_NAME = 'idx-image-cache';
  const STORE = 'images'; // { key, url, blob, type, size, createdAt }
  const META = 'meta'; // { key, size, createdAt } — lightweight, avoids loading blobs to evict
  const VERSION = 1;
  const MAX_BYTES = 300 * 1024 * 1024; // soft cap; oldest entries evicted past this

  let dbPromise = null;
  let evicting = false;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, VERSION);
      } catch (error) {
        reject(error);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function keyFor(url) {
    return String(url || '').split('#')[0];
  }

  function asPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  // Pure helper (exported for tests): pick the oldest keys to drop until under budget.
  function planEviction(records, maxBytes) {
    let total = records.reduce((sum, record) => sum + (Number(record.size) || 0), 0);
    if (total <= maxBytes) return [];
    const victims = [];
    for (const record of [...records].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
      if (total <= maxBytes) break;
      victims.push(record.key);
      total -= Number(record.size) || 0;
    }
    return victims;
  }

  async function put(url, blob, options = {}) {
    if (!blob || !blob.size) return false;
    try {
      const db = await openDb();
      const key = keyFor(url);
      const createdAt = Date.now();
      const tx = db.transaction([STORE, META], 'readwrite');
      tx.objectStore(STORE).put({ key, url, blob, type: blob.type || '', size: blob.size, createdAt });
      tx.objectStore(META).put({ key, size: blob.size, createdAt });
      await txDone(tx);
      if (!options.skipEvict) scheduleEvict();
      return true;
    } catch (_) {
      return false;
    }
  }

  async function getBlob(url) {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE, 'readonly');
      const record = await asPromise(tx.objectStore(STORE).get(keyFor(url)));
      return record?.blob || null;
    } catch (_) {
      return null;
    }
  }

  async function has(url) {
    try {
      const db = await openDb();
      const tx = db.transaction(META, 'readonly');
      const record = await asPromise(tx.objectStore(META).get(keyFor(url)));
      return Boolean(record);
    } catch (_) {
      return false;
    }
  }

  function scheduleEvict() {
    if (evicting) return;
    evicting = true;
    evict().catch(() => {}).finally(() => { evicting = false; });
  }

  async function evict() {
    const db = await openDb();
    const meta = await asPromise(db.transaction(META, 'readonly').objectStore(META).getAll());
    const victims = planEviction(meta || [], MAX_BYTES);
    if (!victims.length) return;
    const tx = db.transaction([STORE, META], 'readwrite');
    const store = tx.objectStore(STORE);
    const metaStore = tx.objectStore(META);
    for (const key of victims) {
      store.delete(key);
      metaStore.delete(key);
    }
    await txDone(tx);
  }

  async function clear() {
    try {
      const db = await openDb();
      const tx = db.transaction([STORE, META], 'readwrite');
      tx.objectStore(STORE).clear();
      tx.objectStore(META).clear();
      await txDone(tx);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Lightweight usage readout (count + total bytes) from the META store, so the
  // settings UI can show how much the cache holds without loading any blobs.
  async function stats() {
    try {
      const db = await openDb();
      const meta = await asPromise(db.transaction(META, 'readonly').objectStore(META).getAll());
      const list = Array.isArray(meta) ? meta : [];
      return { count: list.length, bytes: list.reduce((sum, record) => sum + (Number(record.size) || 0), 0) };
    } catch (_) {
      return { count: 0, bytes: 0 };
    }
  }

  async function remove(url) {
    try {
      const db = await openDb();
      const key = keyFor(url);
      const tx = db.transaction([STORE, META], 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.objectStore(META).delete(key);
      await txDone(tx);
      return true;
    } catch (_) {
      return false;
    }
  }

  global.ImageCache = { put, getBlob, has, evict, clear, remove, stats, keyFor, planEviction, MAX_BYTES };
})(typeof self !== 'undefined' ? self : globalThis);
