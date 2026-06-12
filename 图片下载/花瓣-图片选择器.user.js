// ==UserScript==
// @name         花瓣图片选择器 (v1.0)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  花瓣图片选择下载。悬停显示选中按钮，A/S 键只切换鼠标下方图片，支持链接、逐张和 ZIP 打包。
// @author       You & Codex
// @match        https://huaban.com/*
// @match        https://www.huaban.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      gd-hbimg-edge.huaban.com
// @connect      gd-hbimg-other.huaban.com
// @connect      *.huaban.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const ACCENT = '#c95f68';
    const ACCENT_RGB = '201,95,104';
    const ACCENT_DARK = '#9e414d';
    const SK = { sel: 'hb_selected_v1', prefix: 'hb_prefix', dock: 'hb_dock_collapsed' };

    let selected = new Map();
    let prefix = load(SK.prefix, 'huaban');
    let collapsed = load(SK.dock, false) === true;
    let mx = -1, my = -1;
    let busy = false;
    let raf = null;

    function load(k, fb) {
        try { const v = GM_getValue(k, undefined); if (v !== undefined && !(v && v.then)) return v; } catch (_) {}
        try { const s = localStorage.getItem(k); if (s !== null) return JSON.parse(s); } catch (_) {}
        return fb;
    }
    function save(k, v) {
        try { GM_setValue(k, v); } catch (_) {}
        try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
    }
    function loadSel() {
        const data = load(SK.sel, []);
        selected.clear();
        if (Array.isArray(data)) data.forEach(([k, v]) => { if (k && v) selected.set(k, v); });
    }
    function saveSel() { save(SK.sel, [...selected.entries()]); }

    function parseSrcset(srcset) {
        if (!srcset) return '';
        const parts = srcset.split(',').map(item => item.trim().split(/\s+/)).filter(item => item[0]);
        parts.sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0));
        return parts[0]?.[0] || '';
    }
    function norm(url) {
        if (!url || /^blob:|^data:/i.test(url)) return '';
        let value = String(url).trim();
        if (value.startsWith('//')) value = `${location.protocol}${value}`;
        try { return new URL(value, location.href).href; } catch (_) { return ''; }
    }
    function stripHuabanSize(url) {
        const absolute = norm(url);
        if (!absolute) return '';
        try {
            const parsed = new URL(absolute);
            if (/gd-hbimg-(edge|other)\.huaban\.com$/i.test(parsed.hostname)) {
                parsed.pathname = parsed.pathname.replace('/small/', '/').replace(/_(?:fw|sq)\d+(?:webp)?$/i, '');
            }
            parsed.hash = '';
            return parsed.href;
        } catch (_) {
            return absolute;
        }
    }
    function bestUrl(img) {
        const raw = parseSrcset(img.getAttribute('srcset')) || img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
        return stripHuabanSize(raw);
    }
    function pinLink(img) {
        const link = img.closest('a[href*="/pins/"]');
        if (!link?.href) return null;
        try {
            const url = new URL(link.href, location.href);
            return /(^|\.)huaban\.com$/i.test(url.hostname) && /\/pins\/\d+/i.test(url.pathname) ? link : null;
        } catch (_) {
            return null;
        }
    }
    function pinId(img) {
        const fromLink = pinLink(img)?.href?.match(/\/pins\/(\d+)/)?.[1];
        const fromLocation = location.href.match(/\/pins\/(\d+)/)?.[1];
        return fromLink || fromLocation || null;
    }
    function isContent(img) {
        const url = bestUrl(img);
        if (!/gd-hbimg-(?:edge|other)\.huaban\.com/i.test(url)) return false;
        if (!pinLink(img) && !location.href.match(/\/pins\/\d+/)) return false;
        const mark = `${img.className || ''} ${img.id || ''} ${img.alt || ''}`.toLowerCase();
        if (/avatar|user|icon|logo|emoji|qrcode|qr-code|captcha|vip|subscribe/.test(mark)) return false;
        if (/(?:_sq\d+|_fw86)(?:webp)?(?:[?#]|$)/i.test(img.currentSrc || img.src || '')) return false;
        const rect = img.getBoundingClientRect();
        const w = img.naturalWidth || rect.width || Number(img.getAttribute('width')) || 0;
        const h = img.naturalHeight || rect.height || Number(img.getAttribute('height')) || 0;
        if (w && w < 80) return false;
        if (h && h < 80) return false;
        if (rect.width && rect.height && rect.width * rect.height < 6000) return false;
        return Boolean(url);
    }
    function contentImgs() {
        return Array.from(document.querySelectorAll('img')).filter(isContent);
    }

    function imgKey(img) {
        const url = bestUrl(img);
        if (!url) return null;
        const id = pinId(img);
        const h = hash(url).slice(0, 8);
        return { id: id ? `hb-${id}-${h}` : `hb-${h}`, url };
    }
    function getImgKey(img) {
        const info = imgKey(img);
        if (!info) return null;
        if (selected.has(info.id)) return { ...info, sel: true };
        for (const [k, v] of selected) {
            if (norm(v) === info.url) return { id: k, url: info.url, sel: true };
        }
        return { ...info, sel: false };
    }
    function toggleImg(img) {
        const info = getImgKey(img);
        if (!info) return false;
        info.sel ? selected.delete(info.id) : selected.set(info.id, info.url);
        saveSel();
        refreshAll();
        updateDock();
        toast(info.sel ? '已取消选择' : '已选择 1 张图片');
        return true;
    }

    function setup() {
        for (const img of contentImgs()) {
            const host = pinLink(img) || img.closest('[data-pin-id], [data-id]') || img.parentElement;
            if (!host) continue;
            if (host.querySelector(':scope > .hbps-sel-btn')) continue;
            if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
            host.classList.add('hbps-img-host');

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'hbps-sel-btn';
            btn.title = '选择这张图片';
            btn._hbpsImg = img;
            btn.addEventListener('pointerdown', block, true);
            btn.addEventListener('mousedown', block, true);
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                block(event);
                toggleImg(img);
            }, true);
            host.appendChild(btn);
            if (!img.complete) img.addEventListener('load', () => refreshBtn(btn, img), { once: true });
            refreshBtn(btn, img);
        }
    }
    function block(event) {
        event.stopPropagation();
        event.stopImmediatePropagation?.();
    }
    function refreshBtn(btn, img) {
        const info = getImgKey(img);
        if (!info) return;
        btn.classList.toggle('hbps-active', info.sel);
        btn.parentElement?.classList.toggle('hbps-img-on', info.sel);
    }
    function refreshAll() {
        document.querySelectorAll('.hbps-sel-btn').forEach(btn => {
            if (btn._hbpsImg) refreshBtn(btn, btn._hbpsImg);
        });
    }
    function scan() { setup(); refreshAll(); }
    function sched() {
        if (raf) return;
        const run = () => { raf = null; scan(); };
        raf = document.hidden ? setTimeout(run, 80) : requestAnimationFrame(run);
    }

    const CSS_TEXT = `
.hbps-sel-btn {
    position: absolute !important; top: 8px !important; left: 8px !important;
    width: 32px !important; height: 32px !important; border-radius: 14px !important;
    border: 1px solid rgba(70,60,58,0.16) !important; background: rgba(255,255,255,0.94) !important;
    box-shadow: 0 4px 16px rgba(74,56,52,0.12) !important; z-index: 999990 !important;
    cursor: pointer !important; display: none !important; align-items: center !important; justify-content: center !important;
    box-sizing: border-box !important; color: #5f5452 !important; transition: transform .14s, background .14s, box-shadow .14s !important;
}
.hbps-sel-btn::after { content: "+" !important; font: 400 21px/1 -apple-system, BlinkMacSystemFont, sans-serif !important; }
.hbps-img-host:hover > .hbps-sel-btn { display: flex !important; }
.hbps-sel-btn:hover { transform: translateY(-1px) scale(1.04) !important; box-shadow: 0 8px 22px rgba(74,56,52,0.16) !important; }
.hbps-sel-btn.hbps-active { display: flex !important; background: ${ACCENT} !important; border-color: rgba(255,255,255,0.84) !important; color: #fff !important; }
.hbps-sel-btn.hbps-active::after { content: "\\2713" !important; font: 700 15px/1 -apple-system, BlinkMacSystemFont, sans-serif !important; }
.hbps-img-on { outline: 3px solid ${ACCENT} !important; outline-offset: -3px !important; }
#hbps-dock {
    position: fixed !important; right: 16px !important; bottom: 16px !important; z-index: 2147483646 !important;
    font: 13px/1.3 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif !important;
    color: #2f2a28 !important; pointer-events: auto !important;
}
#hbps-dock .hbps-expanded {
    display: flex !important; align-items: center !important; gap: 5px !important; padding: 5px 6px 5px 5px !important;
    border-radius: 22px !important; background: rgba(249,247,243,0.94) !important; border: 1px solid rgba(92,76,72,0.14) !important;
    box-shadow: 0 10px 34px rgba(48,38,36,0.12) !important; backdrop-filter: blur(18px) saturate(1.25) !important;
    -webkit-backdrop-filter: blur(18px) saturate(1.25) !important;
}
#hbps-dock .hbps-badge {
    display: flex !important; align-items: center !important; justify-content: center !important;
    min-width: 42px !important; height: 38px !important; border-radius: 17px !important; background: rgba(${ACCENT_RGB},0.12) !important;
}
#hbps-dock .hbps-num { font-size: 17px !important; font-weight: 800 !important; color: ${ACCENT_DARK} !important; line-height: 1 !important; }
#hbps-dock button {
    all: unset !important; display: inline-flex !important; align-items: center !important; justify-content: center !important;
    height: 32px !important; padding: 0 10px !important; border-radius: 15px !important; font-size: 12px !important; font-weight: 650 !important;
    cursor: pointer !important; white-space: nowrap !important; user-select: none !important; transition: transform .12s, background .12s !important;
}
#hbps-dock button:hover:not(:disabled) { transform: translateY(-1px) !important; }
#hbps-dock button:active:not(:disabled) { transform: scale(.96) !important; }
#hbps-dock button:disabled { opacity: .36 !important; cursor: default !important; }
#hbps-dock kbd {
    display: inline-flex !important; align-items: center !important; justify-content: center !important; min-width: 14px !important; height: 14px !important;
    padding: 0 3px !important; margin-left: 4px !important; border-radius: 3px !important; font: 9px/1 ui-monospace, monospace !important; opacity: .56 !important;
}
.hbps-g { background: rgba(77,67,62,0.07) !important; color: #5a514e !important; }
.hbps-g:hover:not(:disabled) { background: rgba(77,67,62,0.12) !important; }
.hbps-r { background: ${ACCENT} !important; color: #fff !important; box-shadow: 0 5px 16px rgba(${ACCENT_RGB},0.22) !important; }
.hbps-r:hover:not(:disabled) { background: ${ACCENT_DARK} !important; }
.hbps-d { background: #2f2a28 !important; color: #fff !important; }
#hbps-dock .hbps-fold-btn { width: 26px !important; height: 26px !important; padding: 0 !important; border-radius: 12px !important; background: transparent !important; color: #9d918b !important; }
#hbps-dock .hbps-pill {
    width: 52px !important; height: 52px !important; border-radius: 21px !important; background: rgba(249,247,243,0.96) !important;
    border: 2px solid ${ACCENT} !important; box-shadow: 0 8px 26px rgba(${ACCENT_RGB},0.18) !important;
    display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important;
    cursor: pointer !important; transition: transform .15s, box-shadow .15s !important;
}
#hbps-dock .hbps-pill:hover { transform: scale(1.06) !important; }
.hbps-pill-n { font-size: 17px !important; font-weight: 800 !important; color: ${ACCENT_DARK} !important; line-height: 1 !important; }
.hbps-pill-l { font-size: 8px !important; color: ${ACCENT_DARK} !important; opacity: .62 !important; margin-top: 2px !important; }
.hbps-toast {
    position: fixed !important; right: 16px !important; bottom: 80px !important; z-index: 2147483647 !important;
    padding: 10px 14px !important; border-radius: 12px !important; background: rgba(47,42,40,0.92) !important; color: #fff !important;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, sans-serif !important; box-shadow: 0 10px 28px rgba(0,0,0,0.18) !important;
    opacity: 0 !important; transform: translateY(6px) !important; transition: opacity .15s, transform .15s !important; pointer-events: none !important;
}
.hbps-toast.hbps-show { opacity: 1 !important; transform: none !important; }
.hbps-modal-bg {
    position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; background: rgba(47,42,40,0.36) !important;
    backdrop-filter: blur(5px) !important; display: flex !important; align-items: center !important; justify-content: center !important;
    opacity: 0 !important; transition: opacity .16s !important; font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif !important;
}
.hbps-modal-bg.hbps-show { opacity: 1 !important; }
.hbps-modal-card {
    width: min(460px, calc(100vw - 32px)) !important; max-height: calc(100vh - 48px) !important; overflow-y: auto !important;
    padding: 22px !important; border-radius: 18px !important; background: #fbfaf7 !important; color: #2f2a28 !important;
    border: 1px solid rgba(92,76,72,0.13) !important; box-shadow: 0 26px 70px rgba(47,42,40,0.22) !important;
    transform: translateY(8px) scale(.98) !important; transition: transform .18s cubic-bezier(.4,0,.2,1) !important;
}
.hbps-modal-bg.hbps-show .hbps-modal-card { transform: none !important; }
.hbps-modal-card h3 { margin: 0 0 8px !important; font-size: 17px !important; font-weight: 750 !important; }
.hbps-modal-card p { margin: 0 0 14px !important; font-size: 13px !important; color: #7c716c !important; }
.hbps-modal-card input, .hbps-modal-card textarea {
    width: 100% !important; box-sizing: border-box !important; border: 1px solid rgba(92,76,72,0.18) !important; border-radius: 12px !important;
    background: #fff !important; color: #2f2a28 !important; outline: none !important;
}
.hbps-modal-card input { height: 40px !important; padding: 0 12px !important; font-size: 14px !important; }
.hbps-modal-card textarea { min-height: 140px !important; padding: 10px 12px !important; font: 12px/1.5 ui-monospace, monospace !important; resize: vertical !important; }
.hbps-modal-card input:focus, .hbps-modal-card textarea:focus { border-color: ${ACCENT} !important; box-shadow: 0 0 0 3px rgba(${ACCENT_RGB},0.13) !important; }
.hbps-modal-foot { display: flex !important; justify-content: flex-end !important; gap: 8px !important; margin-top: 14px !important; }
.hbps-modal-foot button {
    all: unset !important; display: inline-flex !important; align-items: center !important; height: 36px !important; padding: 0 14px !important;
    border-radius: 15px !important; font-size: 13px !important; font-weight: 680 !important; cursor: pointer !important;
}
.hbps-m-cancel { background: rgba(77,67,62,0.08) !important; color: #5a514e !important; }
.hbps-m-ok { background: ${ACCENT} !important; color: #fff !important; }
.hbps-dl-list { display: flex !important; flex-direction: column !important; gap: 7px !important; }
.hbps-dl-item {
    all: unset !important; display: flex !important; flex-direction: column !important; padding: 11px 14px !important; border-radius: 13px !important;
    cursor: pointer !important; background: rgba(77,67,62,0.06) !important; border: 1px solid rgba(92,76,72,0.09) !important;
    font-size: 13px !important; font-weight: 700 !important;
}
.hbps-dl-item:hover { background: #fff !important; border-color: rgba(${ACCENT_RGB},0.26) !important; }
.hbps-dl-item small { font-size: 11px !important; font-weight: 400 !important; color: #8a807b !important; margin-top: 3px !important; }
`;
    function injectCSS() {
        if (document.getElementById('hbps-css')) return;
        const style = document.createElement('style');
        style.id = 'hbps-css';
        style.textContent = CSS_TEXT;
        (document.head || document.documentElement).appendChild(style);
    }

    function createDock() {
        if (document.getElementById('hbps-dock')) return;
        const dock = document.createElement('div');
        dock.id = 'hbps-dock';
        document.body.appendChild(dock);
        renderDock();
    }
    function renderDock() {
        const dock = document.getElementById('hbps-dock');
        if (!dock) return;
        const n = selected.size;
        dock.innerHTML = '';
        if (collapsed) {
            const pill = document.createElement('div');
            pill.className = 'hbps-pill';
            pill.innerHTML = `<span class="hbps-pill-n">${busy ? '...' : n}</span><span class="hbps-pill-l">${busy ? '下载中' : '已选'}</span>`;
            pill.onclick = () => { collapsed = false; save(SK.dock, false); renderDock(); };
            dock.appendChild(pill);
            return;
        }
        const bar = document.createElement('div');
        bar.className = 'hbps-expanded';
        bar.innerHTML = `
            <div class="hbps-badge"><span class="hbps-num">${n}</span></div>
            <button class="hbps-g" data-a="select">选图<kbd>A</kbd></button>
            <button class="hbps-g" data-a="clear">清空<kbd>C</kbd></button>
            <button class="hbps-g" data-a="links">链接</button>
            <button class="hbps-g" data-a="prefix">前缀</button>
            <button class="hbps-r" data-a="dl" ${n === 0 || busy ? 'disabled' : ''}>下载<kbd>D</kbd></button>
            <button class="hbps-d" data-a="dl-new" ${n === 0 || busy ? 'disabled' : ''}>新批次<kbd>N</kbd></button>
            <button class="hbps-fold-btn" data-a="fold" title="收起">›</button>`;
        dock.appendChild(bar);
        dock.querySelectorAll('[data-a]').forEach(btn => {
            btn.addEventListener('click', event => {
                event.stopPropagation();
                const action = btn.dataset.a;
                if (action === 'select') selectPointedImage();
                if (action === 'clear') clearSel();
                if (action === 'links') linksModal();
                if (action === 'prefix') prefixModal();
                if (action === 'dl') startDl(false);
                if (action === 'dl-new') startDl(true);
                if (action === 'fold') { collapsed = true; save(SK.dock, true); renderDock(); }
            });
        });
    }
    function updateDock() {
        const dock = document.getElementById('hbps-dock');
        if (!dock) return;
        const n = selected.size;
        const num = dock.querySelector('.hbps-num') || dock.querySelector('.hbps-pill-n');
        if (num) num.textContent = busy && collapsed ? '...' : String(n);
        dock.querySelectorAll('[data-a="dl"], [data-a="dl-new"]').forEach(btn => { btn.disabled = n === 0 || busy; });
    }

    function setupEvents() {
        document.addEventListener('pointermove', event => { mx = event.clientX; my = event.clientY; }, { passive: true, capture: true });
        document.addEventListener('keydown', event => {
            const t = event.target;
            if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
            if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
            const key = String(event.key || '').toLowerCase();
            if (event.repeat && ['a', 's', 'd', 'n', 'c'].includes(key)) return;
            if (key === 'a' || key === 's') {
                event.preventDefault();
                selectPointedImage();
            } else if (key === 'd' && selected.size > 0 && !busy) {
                event.preventDefault();
                startDl(false);
            } else if (key === 'n' && selected.size > 0 && !busy) {
                event.preventDefault();
                startDl(true);
            } else if (key === 'c') {
                event.preventDefault();
                clearSel();
            }
        }, true);
        window.addEventListener('scroll', sched, { passive: true });
        window.addEventListener('resize', sched, { passive: true });
        new MutationObserver(sched).observe(document.body, { childList: true, subtree: true });
    }
    function imgAt(x, y) {
        for (const el of document.elementsFromPoint(x, y)) {
            if (el._hbpsImg) return el._hbpsImg;
            if (el.tagName === 'IMG' && isContent(el)) return el;
            const host = el.closest?.('.hbps-img-host');
            const img = host?.querySelector?.('img');
            if (img && isContent(img)) return img;
        }
        return contentImgs().find(img => {
            const r = img.getBoundingClientRect();
            return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        }) || null;
    }
    function selectPointedImage() {
        if (mx < 0 || my < 0) {
            toast('请把鼠标移到图片上');
            return;
        }
        const img = imgAt(mx, my);
        if (!img) {
            toast('当前图片不可选择');
            return;
        }
        setup();
        toggleImg(img);
    }
    function clearSel() {
        selected.clear();
        saveSel();
        refreshAll();
        updateDock();
        toast('已清空');
    }

    function startDl(isNew) {
        if (!selected.size || busy) return;
        if (isNew) prefixModal(() => dlModal());
        else dlModal();
    }
    function dlModal() {
        const modal = showModal(`
            <h3>下载方式</h3><p>共 ${selected.size} 张图片</p>
            <div class="hbps-dl-list">
                <button class="hbps-dl-item" data-m="links">链接列表<small>保存全部原图 URL 到 .txt</small></button>
                <button class="hbps-dl-item" data-m="direct">逐张下载<small>直接保存到本地</small></button>
                <button class="hbps-dl-item" data-m="zip">ZIP 压缩包<small>抓取图片后打包下载</small></button>
            </div>`);
        modal.querySelectorAll('[data-m]').forEach(btn => {
            btn.onclick = () => { closeModal(modal); execDl(btn.dataset.m); };
        });
    }
    async function execDl(mode) {
        const entries = [...selected.entries()];
        const name = `${prefix}-${hash(entries.map(item => item[1]).join('\n')).slice(0, 8)}`;
        if (mode === 'links') {
            dlBlob(new Blob([entries.map(item => item[1]).join('\n')], { type: 'text/plain;charset=utf-8' }), `${name}.txt`);
            clearSel();
            toast('链接已下载');
            return;
        }
        busy = true;
        renderDock();
        if (mode === 'direct') {
            let ok = 0, fail = 0;
            for (let i = 0; i < entries.length; i++) {
                try {
                    await dlSingle(entries[i][1], `${name}-${String(i + 1).padStart(3, '0')}.${ext(entries[i][1])}`);
                    ok++;
                } catch (error) {
                    fail++;
                    console.warn('[Huaban Selector] 下载失败:', error);
                }
                setProgress(`${i + 1}/${entries.length}`);
                if (i < entries.length - 1) await delay(500);
            }
            busy = false;
            clearSel();
            renderDock();
            toast(fail ? `完成 ${ok} 张，失败 ${fail} 张` : '下载完成');
            return;
        }
        let done = 0;
        const files = [];
        await parallel(entries, 4, async ([, url], i) => {
            try {
                const blob = await fetchImg(url);
                files.push({ name: `${name}/${String(i + 1).padStart(3, '0')}.${ext(url, blob.type)}`, blob });
            } catch (error) {
                console.warn('[Huaban Selector] 抓取失败:', error);
            }
            setProgress(`${++done}/${entries.length}`);
        });
        if (files.length) {
            setProgress('打包中');
            dlBlob(await makeZip(files), `${name}.zip`);
            busy = false;
            clearSel();
            renderDock();
            toast('ZIP 已下载');
        } else {
            busy = false;
            renderDock();
            toast('无可用图片');
        }
    }
    function setProgress(text) {
        const dock = document.getElementById('hbps-dock');
        const dl = dock?.querySelector('[data-a="dl"]');
        if (dl) dl.textContent = text;
        const n = dock?.querySelector('.hbps-pill-n');
        const l = dock?.querySelector('.hbps-pill-l');
        if (n) n.textContent = text;
        if (l) l.textContent = '下载中';
    }

    function fetchImg(url) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                fetch(url, { credentials: 'omit' }).then(r => r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))).then(resolve, reject);
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                timeout: 20000,
                onload(res) { res.status < 300 && res.response ? resolve(res.response) : reject(new Error(`HTTP ${res.status}`)); },
                onerror() { reject(new Error('network')); },
                ontimeout() { reject(new Error('timeout')); }
            });
        });
    }
    function dlSingle(url, filename) {
        return new Promise((resolve, reject) => {
            if (typeof GM_download === 'function') {
                GM_download({
                    url,
                    name: filename,
                    saveAs: false,
                    onload: resolve,
                    onerror() { fetchImg(url).then(blob => { dlBlob(blob, filename); resolve(); }).catch(reject); },
                    ontimeout() { fetchImg(url).then(blob => { dlBlob(blob, filename); resolve(); }).catch(reject); }
                });
            } else {
                fetchImg(url).then(blob => { dlBlob(blob, filename); resolve(); }).catch(reject);
            }
        });
    }

    async function makeZip(files) {
        const enc = new TextEncoder();
        const locals = [], centrals = [];
        let off = 0;
        for (const file of files) {
            const nb = enc.encode(file.name);
            const data = new Uint8Array(await file.blob.arrayBuffer());
            const crc = crc32(data);
            const lh = new Uint8Array(30 + nb.length);
            const lv = new DataView(lh.buffer);
            lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
            lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
            lv.setUint16(26, nb.length, true); lh.set(nb, 30);
            const ch = new Uint8Array(46 + nb.length);
            const cv = new DataView(ch.buffer);
            cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
            cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
            cv.setUint16(28, nb.length, true); cv.setUint32(42, off, true); ch.set(nb, 46);
            locals.push(lh, data);
            centrals.push(ch);
            off += lh.length + data.length;
        }
        const cs = centrals.reduce((sum, item) => sum + item.length, 0);
        const end = new Uint8Array(22);
        const ev = new DataView(end.buffer);
        ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
        ev.setUint32(12, cs, true); ev.setUint32(16, off, true);
        return new Blob([...locals, ...centrals, end], { type: 'application/zip' });
    }
    const CRC_T = (() => {
        const t = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            t[i] = c >>> 0;
        }
        return t;
    })();
    function crc32(buf) {
        let c = ~0;
        for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
        return (~c) >>> 0;
    }

    function showModal(html) {
        const bg = document.createElement('div');
        bg.className = 'hbps-modal-bg';
        bg.innerHTML = `<div class="hbps-modal-card">${html}<div class="hbps-modal-foot"><button class="hbps-m-cancel">取消</button></div></div>`;
        document.body.appendChild(bg);
        bg.querySelector('.hbps-m-cancel').onclick = () => closeModal(bg);
        bg.addEventListener('click', event => { if (event.target === bg) closeModal(bg); });
        const onKey = event => { if (event.key === 'Escape') closeModal(bg); };
        document.addEventListener('keydown', onKey);
        bg._onKey = onKey;
        requestAnimationFrame(() => bg.classList.add('hbps-show'));
        return bg;
    }
    function closeModal(bg) {
        if (bg?._onKey) document.removeEventListener('keydown', bg._onKey);
        bg?.classList.remove('hbps-show');
        setTimeout(() => bg?.remove(), 200);
    }
    function prefixModal(callback) {
        const modal = showModal(`<h3>下载前缀</h3><p>文件名使用此前缀区分不同批次</p><input id="hbps-prefix" value="${esc(prefix)}">`);
        const input = modal.querySelector('#hbps-prefix');
        const ok = document.createElement('button');
        ok.className = 'hbps-m-ok';
        ok.textContent = '确认';
        ok.onclick = () => {
            const value = input.value.trim();
            if (value) { prefix = value; save(SK.prefix, value); }
            closeModal(modal);
            if (callback) callback();
        };
        modal.querySelector('.hbps-modal-foot').appendChild(ok);
        input.focus();
        input.select();
        input.addEventListener('keydown', event => { if (event.key === 'Enter') ok.click(); });
    }
    function linksModal() {
        if (selected.size) {
            const body = [...selected.values()].join('\n');
            const modal = showModal(`<h3>图片链接</h3><p>复制或保存当前已选原图链接</p><textarea readonly>${esc(body)}</textarea>`);
            const saveBtn = document.createElement('button');
            saveBtn.className = 'hbps-m-ok';
            saveBtn.textContent = '保存文本';
            saveBtn.onclick = () => {
                dlBlob(new Blob([body], { type: 'text/plain;charset=utf-8' }), `${prefix}-${hash(body).slice(0, 8)}.txt`);
                closeModal(modal);
            };
            modal.querySelector('.hbps-modal-foot').appendChild(saveBtn);
            const textarea = modal.querySelector('textarea');
            textarea.focus();
            textarea.select();
            return;
        }
        const modal = showModal(`<h3>链接打包</h3><p>粘贴图片链接，一行一个</p><textarea placeholder="https://gd-hbimg-edge.huaban.com/..."></textarea>`);
        const textarea = modal.querySelector('textarea');
        const ok = document.createElement('button');
        ok.className = 'hbps-m-ok';
        ok.textContent = '打包下载';
        ok.onclick = async () => {
            const urls = [...new Set((textarea.value.match(/https?:\/\/[^\s,]+/gi) || []).map(stripHuabanSize).filter(Boolean))];
            if (!urls.length) { toast('未找到链接'); return; }
            ok.disabled = true;
            const files = [];
            let done = 0;
            await parallel(urls.map((url, i) => [i, url]), 4, async ([i, url]) => {
                try {
                    const blob = await fetchImg(url);
                    files.push({ name: `links/${String(i + 1).padStart(3, '0')}.${ext(url, blob.type)}`, blob });
                } catch (_) {}
                ok.textContent = `${++done}/${urls.length}`;
            });
            if (files.length) {
                dlBlob(await makeZip(files), `链接打包-${prefix}.zip`);
                toast('ZIP 已下载');
                closeModal(modal);
            } else {
                ok.disabled = false;
                ok.textContent = '打包下载';
                toast('抓取失败');
            }
        };
        modal.querySelector('.hbps-modal-foot').appendChild(ok);
        textarea.focus();
    }

    let toastT = 0;
    function toast(msg) {
        let el = document.querySelector('.hbps-toast');
        if (!el) {
            el = document.createElement('div');
            el.className = 'hbps-toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add('hbps-show');
        clearTimeout(toastT);
        toastT = setTimeout(() => el.classList.remove('hbps-show'), 2600);
    }

    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function dlBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        dlUrl(url, filename);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    function dlUrl(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 200);
    }
    function ext(url, mime) {
        if (mime) {
            const fromMime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[String(mime).toLowerCase()];
            if (fromMime) return fromMime;
        }
        const match = String(url).split('?')[0].match(/\.(jpe?g|png|webp|gif|avif)$/i);
        return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
    }
    function esc(value) {
        return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }
    function hash(input) {
        let value = 0x811c9dc5;
        for (let i = 0; i < input.length; i++) {
            value ^= input.charCodeAt(i);
            value = Math.imul(value, 0x01000193);
        }
        return (value >>> 0).toString(16).padStart(8, '0');
    }
    async function parallel(items, limit, fn) {
        let index = 0;
        await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (index < items.length) {
                const current = index++;
                await fn(items[current], current);
            }
        }));
    }

    function init() {
        loadSel();
        injectCSS();
        createDock();
        setupEvents();
        scan();
        setTimeout(scan, 1000);
        setTimeout(scan, 3000);
        setInterval(() => { scan(); updateDock(); }, 4000);
        console.log(`[Huaban Selector] v1.0 ready, ${selected.size} saved, ${contentImgs().length} images found`);
    }

    init();
})();
