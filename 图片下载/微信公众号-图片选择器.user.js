// ==UserScript==
// @name         微信公众号图片选择器 (v1.0)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  微信公众号文章图片批量选择下载。悬停显示选中按钮，S 键快捷选中，支持 ZIP 打包。
// @author       You & Claude
// @match        https://mp.weixin.qq.com/s/*
// @match        https://mp.weixin.qq.com/s?*
// @match        https://mp.weixin.qq.com/mp/appmsg/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      mmbiz.qpic.cn
// @connect      mmbiz.qlogo.cn
// @connect      *.qq.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // === 配置 ===
    const CONTENT_SEL = '#js_content';
    const SK = { sel: 'wx_selected_v1', prefix: 'wx_prefix', dock: 'wx_dock_collapsed' };
    const ACCENT = '#07C160';
    const ACCENT_RGB = '7,193,96';

    // === 状态 ===
    let selected = new Map();
    let prefix = load(SK.prefix, 'wechat');
    let collapsed = false;
    let mx = -1, my = -1;
    let busy = false;
    let raf = null;

    // === 存储 ===
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
        const d = load(SK.sel, []);
        selected.clear();
        if (Array.isArray(d)) d.forEach(([k, v]) => { if (k && v) selected.set(k, v); });
    }
    function saveSel() { save(SK.sel, [...selected.entries()]); }

    // === 图片工具 ===
    function norm(url) {
        if (!url || url.startsWith('blob:') || url.startsWith('data:')) return '';
        let u = String(url).trim();
        if (u.startsWith('//')) u = 'https:' + u;
        try {
            const obj = new URL(u, location.href);
            // 移除追踪参数，保留图片关键参数
            for (const p of ['from', 'wxfrom', 'wx_lazy', 'wx_co', 'token', 'tp', 'scene']) {
                obj.searchParams.delete(p);
            }
            return obj.href;
        } catch (_) { return u; }
    }
    function bestUrl(img) {
        const ds = img.getAttribute('data-src');
        const src = img.currentSrc || img.src || '';
        let url = ds || src;
        if (!url) return '';
        // 去掉 tp=webp 以获取原始格式
        url = url.replace(/[&?]tp=webp[^&]*/g, '');
        url = url.replace(/\?&/, '?').replace(/[?&]$/, '');
        return url;
    }
    function isContent(img) {
        if (!img.closest(CONTENT_SEL)) return false;
        const cls = (img.className || '').toLowerCase();
        const alt = (img.alt || '').toLowerCase();
        if (/emoji|icon|logo|qrcode/.test(cls)) return false;
        if (/emoji/.test(alt)) return false;
        // 尺寸过滤（利用 data-w / data-ratio 兜底未加载图片）
        const r = img.getBoundingClientRect();
        const dw = +img.getAttribute('data-w') || 0;
        const dr = +img.getAttribute('data-ratio') || 0;
        const dh = dw && dr ? Math.round(dw * dr) : 0;
        const w = img.naturalWidth || r.width || dw || 0;
        const h = img.naturalHeight || r.height || dh || 0;
        if (w > 0 && w < 60) return false;
        if (h > 0 && h < 60) return false;
        if (r.width > 0 && r.height > 0 && r.width * r.height < 4000) return false;
        // 必须有图片地址
        if (!bestUrl(img)) return false;
        return true;
    }
    function contentImgs() {
        const root = document.querySelector(CONTENT_SEL);
        if (!root) return [];
        return Array.from(root.querySelectorAll('img')).filter(isContent);
    }
    function articleTitle() {
        const el = document.getElementById('activity-name');
        if (el) return el.textContent.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
        return document.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'wechat';
    }

    // === 选中逻辑 ===
    function imgKey(img) {
        const url = norm(bestUrl(img));
        if (!url) return null;
        const h = hash(url).slice(0, 8);
        return { id: `wx-${h}`, url };
    }
    function getImgKey(img) {
        const info = imgKey(img);
        if (!info) return null;
        if (selected.has(info.id)) return { ...info, sel: true };
        for (const [k, v] of selected) { if (norm(v) === info.url) return { id: k, url: info.url, sel: true }; }
        return { ...info, sel: false };
    }
    function toggleImg(img) {
        const info = getImgKey(img);
        if (!info) return;
        info.sel ? selected.delete(info.id) : selected.set(info.id, info.url);
        saveSel(); refreshAll(); updateDock();
    }

    // === DOM ===
    function setup() {
        const imgs = contentImgs();
        for (const img of imgs) {
            // 宿主：图片的直接父级
            const host = img.parentElement;
            if (!host) continue;
            if (host.querySelector(':scope > .ps-sel-btn')) continue;
            if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
            host.classList.add('ps-img-host');

            const btn = document.createElement('div');
            btn.className = 'ps-sel-btn';
            btn._psImg = img;
            btn.addEventListener('pointerdown', e => {
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                toggleImg(img);
            }, true);
            btn.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            }, true);
            host.appendChild(btn);
            if (!img.complete && !img.getAttribute('data-src')) {
                img.addEventListener('load', () => refreshBtn(btn, img), { once: true });
            }
            refreshBtn(btn, img);
        }
    }
    function refreshBtn(btn, img) {
        const info = getImgKey(img);
        if (!info) return;
        btn.classList.toggle('ps-active', info.sel);
        const host = btn.parentElement;
        if (host) host.classList.toggle('ps-img-on', info.sel);
    }
    function refreshAll() {
        document.querySelectorAll('.ps-sel-btn').forEach(btn => {
            const img = btn._psImg;
            if (!img) return;
            refreshBtn(btn, img);
        });
    }
    function scan() {
        setup();
        refreshAll();
    }
    function sched() { if (!raf) raf = requestAnimationFrame(() => { raf = null; scan(); }); }

    // === 样式 ===
    function injectCSS() {
        if (document.getElementById('ps-css')) return;
        const s = document.createElement('style');
        s.id = 'ps-css';
        s.textContent = CSS_TEXT;
        try { (document.head || document.documentElement).appendChild(s); } catch (_) { document.documentElement.appendChild(s); }
    }

    const CSS_TEXT = `
/* 选择按钮 — 默认隐藏 */
.ps-sel-btn {
    position: absolute !important;
    top: 8px !important; left: 8px !important;
    width: 34px !important; height: 34px !important;
    border-radius: 50% !important;
    background: rgba(255,255,255,0.95) !important;
    border: 1.5px solid rgba(0,0,0,0.1) !important;
    box-shadow: 0 1px 5px rgba(0,0,0,0.12) !important;
    z-index: 999990 !important;
    cursor: pointer !important;
    display: none !important;
    align-items: center !important; justify-content: center !important;
    box-sizing: border-box !important;
    -webkit-tap-highlight-color: transparent !important;
    user-select: none !important;
    transition: transform 0.15s, background 0.15s, box-shadow 0.15s !important;
}
.ps-sel-btn::after {
    content: '+' !important;
    font: 300 22px/1 -apple-system, sans-serif !important;
    color: #555 !important;
}
.ps-img-host:hover > .ps-sel-btn {
    display: flex !important;
}
.ps-sel-btn:hover {
    transform: scale(1.1) !important;
    box-shadow: 0 2px 10px rgba(0,0,0,0.18) !important;
}
/* 选中态 */
.ps-sel-btn.ps-active {
    display: flex !important;
    background: ${ACCENT} !important;
    border-color: #fff !important;
    box-shadow: 0 0 0 2px rgba(255,255,255,0.8), 0 2px 10px rgba(${ACCENT_RGB},0.3) !important;
}
.ps-sel-btn.ps-active::after {
    content: '\\2713' !important;
    font: 600 16px/1 -apple-system, sans-serif !important;
    color: #fff !important;
}
.ps-img-on {
    outline: 3px solid ${ACCENT} !important;
    outline-offset: -2px !important;
    border-radius: 4px !important;
}

/* ========== Dock ========== */
#ps-dock {
    position: fixed !important; bottom: 16px !important; right: 16px !important;
    z-index: 2147483646 !important;
    font: 13px/1.3 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif !important;
    color: #1a1a1a !important;
    pointer-events: auto !important;
}

/* 展开态 */
#ps-dock .ps-expanded {
    display: flex !important;
    align-items: center !important;
    gap: 5px !important;
    padding: 5px 6px 5px 5px !important;
    border-radius: 26px !important;
    background: rgba(255,255,255,0.92) !important;
    border: 1px solid rgba(0,0,0,0.06) !important;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 12px 48px rgba(0,0,0,0.04) !important;
    backdrop-filter: blur(20px) saturate(1.4) !important;
    -webkit-backdrop-filter: blur(20px) saturate(1.4) !important;
}
#ps-dock .ps-badge {
    display: flex !important; align-items: center !important; justify-content: center !important;
    min-width: 40px !important; height: 40px !important; border-radius: 50% !important;
    background: rgba(${ACCENT_RGB},0.08) !important; flex-shrink: 0 !important;
}
#ps-dock .ps-num {
    font-size: 17px !important; font-weight: 800 !important; color: ${ACCENT} !important; line-height: 1 !important;
}
#ps-dock .ps-expanded button {
    all: unset !important;
    display: inline-flex !important; align-items: center !important; justify-content: center !important;
    height: 32px !important; padding: 0 11px !important; border-radius: 16px !important;
    font-size: 12px !important; font-weight: 600 !important;
    cursor: pointer !important; white-space: nowrap !important;
    user-select: none !important; transition: transform 0.12s, background 0.12s !important;
}
#ps-dock .ps-expanded button:hover:not(:disabled) { transform: translateY(-1px) !important; }
#ps-dock .ps-expanded button:active:not(:disabled) { transform: scale(0.96) !important; }
#ps-dock .ps-expanded button:disabled { opacity: 0.3 !important; cursor: default !important; }
#ps-dock .ps-expanded button kbd {
    display: inline-flex !important; align-items: center !important; justify-content: center !important;
    min-width: 14px !important; height: 14px !important; padding: 0 3px !important; margin-left: 4px !important;
    border-radius: 3px !important; font: 9px/1 ui-monospace, monospace !important; opacity: 0.5 !important;
}
.ps-g { background: rgba(0,0,0,0.04) !important; color: #555 !important; }
.ps-g:hover:not(:disabled) { background: rgba(0,0,0,0.09) !important; }
.ps-g kbd { background: rgba(0,0,0,0.06) !important; color: #888 !important; }
.ps-r { background: ${ACCENT} !important; color: #fff !important; box-shadow: 0 2px 8px rgba(${ACCENT_RGB},0.2) !important; }
.ps-r:hover:not(:disabled) { background: #06ae56 !important; }
.ps-r kbd { background: rgba(255,255,255,0.25) !important; color: inherit !important; }
.ps-d { background: #1a1a1a !important; color: #fff !important; }
.ps-d:hover:not(:disabled) { background: #000 !important; }
.ps-d kbd { background: rgba(255,255,255,0.18) !important; color: inherit !important; }
#ps-dock .ps-fold-btn {
    width: 26px !important; height: 26px !important; padding: 0 !important;
    border-radius: 50% !important; background: transparent !important;
    color: #ccc !important; font-size: 15px !important; flex-shrink: 0 !important; margin-left: 1px !important;
}
#ps-dock .ps-fold-btn:hover:not(:disabled) { color: #888 !important; transform: none !important; background: rgba(0,0,0,0.04) !important; }

/* 折叠态 */
#ps-dock .ps-pill {
    width: 52px !important; height: 52px !important; border-radius: 50% !important;
    background: #fff !important; border: 2px solid ${ACCENT} !important;
    box-shadow: 0 2px 12px rgba(${ACCENT_RGB},0.18), 0 4px 20px rgba(0,0,0,0.08) !important;
    display: flex !important; flex-direction: column !important;
    align-items: center !important; justify-content: center !important;
    cursor: pointer !important; transition: transform 0.15s, box-shadow 0.15s !important;
}
#ps-dock .ps-pill:hover { transform: scale(1.08) !important; box-shadow: 0 4px 18px rgba(${ACCENT_RGB},0.25), 0 6px 28px rgba(0,0,0,0.1) !important; }
#ps-dock .ps-pill:active { transform: scale(0.94) !important; }
#ps-dock .ps-pill-n { font-size: 17px !important; font-weight: 800 !important; color: ${ACCENT} !important; line-height: 1 !important; }
#ps-dock .ps-pill-l { font-size: 8px !important; color: ${ACCENT} !important; opacity: 0.6 !important; margin-top: 2px !important; }
#ps-dock .ps-pill.ps-busy { animation: ps-pulse 1.2s ease-in-out infinite !important; border-color: #ff6b00 !important; }
#ps-dock .ps-pill.ps-busy .ps-pill-n { font-size: 13px !important; color: #ff6b00 !important; }
#ps-dock .ps-pill.ps-busy .ps-pill-l { color: #ff6b00 !important; }
@keyframes ps-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255,107,0,0.3), 0 2px 12px rgba(255,107,0,0.15); }
    50% { box-shadow: 0 0 0 6px rgba(255,107,0,0), 0 2px 12px rgba(255,107,0,0.25); }
}

/* Toast */
.ps-toast {
    position: fixed !important; bottom: 80px !important; right: 16px !important;
    z-index: 2147483647 !important; padding: 10px 16px !important; border-radius: 12px !important;
    background: rgba(20,20,20,0.92) !important; color: #fff !important;
    font: 13px/1.4 -apple-system, sans-serif !important;
    box-shadow: 0 6px 20px rgba(0,0,0,0.18) !important; backdrop-filter: blur(10px) !important;
    transform: translateY(6px) !important; opacity: 0 !important;
    transition: opacity 0.15s, transform 0.15s !important; pointer-events: none !important;
}
.ps-toast.ps-show { opacity: 1 !important; transform: none !important; }

/* Modal */
.ps-modal-bg {
    position: fixed !important; inset: 0 !important; z-index: 2147483647 !important;
    background: rgba(0,0,0,0.4) !important; backdrop-filter: blur(4px) !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
    opacity: 0 !important; transition: opacity 0.15s !important;
    font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif !important;
}
.ps-modal-bg.ps-show { opacity: 1 !important; }
.ps-modal-card {
    width: min(460px, calc(100vw - 32px)) !important; max-height: calc(100vh - 48px) !important;
    overflow-y: auto !important; padding: 24px !important; border-radius: 16px !important;
    background: #fff !important; box-shadow: 0 24px 64px rgba(0,0,0,0.2) !important;
    transform: translateY(8px) scale(0.97) !important; transition: transform 0.18s cubic-bezier(.4,0,.2,1) !important;
}
.ps-modal-bg.ps-show .ps-modal-card { transform: none !important; }
.ps-modal-card h3 { margin: 0 0 8px !important; font-size: 17px !important; font-weight: 700 !important; color: #111 !important; }
.ps-modal-card p { margin: 0 0 14px !important; font-size: 13px !important; color: #777 !important; }
.ps-modal-card input {
    width: 100% !important; box-sizing: border-box !important; height: 40px !important;
    padding: 0 12px !important; border: 1px solid #ddd !important; border-radius: 10px !important;
    font-size: 14px !important; outline: none !important; margin-bottom: 14px !important;
}
.ps-modal-card input:focus { border-color: ${ACCENT} !important; box-shadow: 0 0 0 2px rgba(${ACCENT_RGB},0.12) !important; }
.ps-modal-card textarea {
    width: 100% !important; box-sizing: border-box !important; min-height: 140px !important;
    padding: 10px 12px !important; border: 1px solid #ddd !important; border-radius: 10px !important;
    font: 12px/1.5 ui-monospace, monospace !important; outline: none !important; resize: vertical !important;
}
.ps-modal-card textarea:focus { border-color: ${ACCENT} !important; }
.ps-modal-foot { display: flex !important; justify-content: flex-end !important; gap: 8px !important; margin-top: 14px !important; }
.ps-modal-foot button {
    all: unset !important; display: inline-flex !important; align-items: center !important;
    height: 36px !important; padding: 0 14px !important; border-radius: 18px !important;
    font-size: 13px !important; font-weight: 650 !important; cursor: pointer !important;
}
.ps-m-cancel { background: #f0f0f0 !important; color: #555 !important; }
.ps-m-ok { background: ${ACCENT} !important; color: #fff !important; }
.ps-dl-list { display: flex !important; flex-direction: column !important; gap: 6px !important; }
.ps-dl-item {
    all: unset !important; display: flex !important; flex-direction: column !important;
    padding: 10px 14px !important; border-radius: 10px !important; cursor: pointer !important;
    background: #f8f8f8 !important; border: 1px solid rgba(0,0,0,0.05) !important;
    font-size: 13px !important; font-weight: 600 !important; color: #222 !important;
}
.ps-dl-item:hover { background: #fff !important; border-color: rgba(${ACCENT_RGB},0.25) !important; }
.ps-dl-item small { font-size: 11px !important; font-weight: 400 !important; color: #999 !important; margin-top: 2px !important; }
`;

    // === Dock ===
    function createDock() {
        if (document.getElementById('ps-dock')) return;
        const d = document.createElement('div');
        d.id = 'ps-dock';
        d.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483646;font:13px/1.3 -apple-system,sans-serif;color:#1a1a1a;pointer-events:auto;';
        document.body.appendChild(d);
        renderDock();
    }

    function renderDock() {
        const d = document.getElementById('ps-dock');
        if (!d) return;
        const n = selected.size;

        if (collapsed) {
            d.innerHTML = '';
            const pill = document.createElement('div');
            pill.className = 'ps-pill';
            pill.style.cssText = `width:52px;height:52px;border-radius:50%;background:#fff;border:2px solid ${ACCENT};box-shadow:0 2px 12px rgba(${ACCENT_RGB},0.18);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;`;
            pill.innerHTML = `<span class="ps-pill-n" style="font-size:17px;font-weight:800;color:${ACCENT};line-height:1">${n}</span><span class="ps-pill-l" style="font-size:8px;color:${ACCENT};opacity:0.6;margin-top:2px">${busy ? '下载中' : '已选'}</span>`;
            if (busy) pill.classList.add('ps-busy');
            pill.onclick = () => { collapsed = false; save(SK.dock, false); renderDock(); };
            d.appendChild(pill);
        } else {
            d.innerHTML = '';
            const bar = document.createElement('div');
            bar.className = 'ps-expanded';
            bar.style.cssText = 'display:flex;align-items:center;gap:5px;padding:5px 6px 5px 5px;border-radius:26px;background:rgba(255,255,255,0.92);border:1px solid rgba(0,0,0,0.06);box-shadow:0 4px 24px rgba(0,0,0,0.08);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);';
            bar.innerHTML = `
                <div class="ps-badge" style="display:flex;align-items:center;justify-content:center;min-width:40px;height:40px;border-radius:50%;background:rgba(${ACCENT_RGB},0.08)"><span class="ps-num" style="font-size:17px;font-weight:800;color:${ACCENT}">${n}</span></div>
                <button class="ps-g" data-a="all">全选<kbd>A</kbd></button>
                <button class="ps-g" data-a="clear">清空</button>
                <button class="ps-g" data-a="links">链接</button>
                <button class="ps-g" data-a="prefix">前缀</button>
                <button class="ps-r" data-a="dl" ${n === 0 || busy ? 'disabled' : ''}>下载<kbd>D</kbd></button>
                <button class="ps-d" data-a="dl-new" ${n === 0 || busy ? 'disabled' : ''}>新批次<kbd>N</kbd></button>
                <button class="ps-fold-btn" data-a="fold" title="收起面板">&#x203A;</button>`;
            d.appendChild(bar);
            d.querySelectorAll('[data-a]').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const a = btn.dataset.a;
                    if (a === 'fold') { collapsed = true; save(SK.dock, true); renderDock(); }
                    else if (a === 'all') selAll();
                    else if (a === 'clear') clearSel();
                    else if (a === 'links') linksModal();
                    else if (a === 'prefix') prefixModal();
                    else if (a === 'dl') startDl(false);
                    else if (a === 'dl-new') startDl(true);
                });
            });
        }
    }

    function updateDock() {
        const d = document.getElementById('ps-dock');
        if (!d) return;
        const n = selected.size;
        const num = d.querySelector('.ps-num') || d.querySelector('.ps-pill-n');
        if (num) num.textContent = n;
        const dlBtn = d.querySelector('[data-a="dl"]');
        const dlNewBtn = d.querySelector('[data-a="dl-new"]');
        if (dlBtn) dlBtn.disabled = n === 0 || busy;
        if (dlNewBtn) dlNewBtn.disabled = n === 0 || busy;
    }

    // === 事件 ===
    function setupEvents() {
        document.addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; }, { passive: true, capture: true });

        document.addEventListener('keydown', e => {
            const t = e.target.tagName;
            if (t === 'INPUT' || t === 'TEXTAREA' || e.target.isContentEditable) return;
            if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
            const k = (e.key || '').toLowerCase();
            if ((k === 's' || k === 'a') && mx >= 0) {
                const img = imgAt(mx, my);
                if (img) { e.preventDefault(); e.stopPropagation(); toggleImg(img); }
            } else if (k === 'd' && !busy && selected.size > 0) {
                e.preventDefault(); startDl(false);
            } else if (k === 'n' && !busy && selected.size > 0) {
                e.preventDefault(); startDl(true);
            }
        }, true);

        window.addEventListener('scroll', sched, { passive: true });
        window.addEventListener('resize', sched, { passive: true });

        // 监听 DOM 变化（微信懒加载图片时触发）
        const root = document.querySelector(CONTENT_SEL);
        if (root) {
            new MutationObserver(sched).observe(root, {
                childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-src']
            });
        }
    }

    function imgAt(x, y) {
        for (const el of document.elementsFromPoint(x, y)) {
            if (el.tagName === 'IMG' && isContent(el)) return el;
            // 也检查是否悬停在按钮上，找到关联的图片
            if (el.classList.contains('ps-sel-btn') && el._psImg) return el._psImg;
        }
        return null;
    }

    // === 选择操作 ===
    function selAll() {
        let n = 0;
        setup(); // 确保所有可见图片都被处理
        for (const img of contentImgs()) {
            const info = getImgKey(img);
            if (!info || info.sel) continue;
            selected.set(info.id, info.url); n++;
        }
        if (n > 0) { saveSel(); refreshAll(); updateDock(); }
        toast(`已选 ${n} 张`);
    }

    function clearSel() {
        selected.clear(); saveSel(); refreshAll(); updateDock();
        toast('已清空');
    }

    // === 下载 ===
    function startDl(isNew) {
        if (selected.size === 0 || busy) return;
        if (isNew) prefixModal(() => dlModal(true));
        else dlModal(false);
    }

    function dlModal(isNew) {
        const modal = showModal(`
            <h3>下载方式</h3><p>共 ${selected.size} 张图片</p>
            <div class="ps-dl-list">
                <button class="ps-dl-item" data-m="list">链接列表<small>保存全部原图 URL 到 .txt</small></button>
                <button class="ps-dl-item" data-m="direct">逐张下载<small>直接保存到本地</small></button>
                <button class="ps-dl-item" data-m="zip">ZIP 压缩包<small>抓取图片打包下载</small></button>
            </div>`);
        modal.querySelectorAll('[data-m]').forEach(b => {
            b.onclick = () => { closeModal(modal); execDl(b.dataset.m, isNew); };
        });
    }

    async function execDl(mode, isNew) {
        const entries = [...selected.entries()];
        const title = articleTitle();
        const h = hash(entries.map(e => e[1]).join('\n')).slice(0, 8);
        const name = `${prefix}-${title}-${h}`;

        if (mode === 'list') {
            dlBlob(new Blob([entries.map(e => e[1]).join('\n')], { type: 'text/plain' }), `${name}.txt`);
            clearSel(); toast('链接已下载');
        } else if (mode === 'direct') {
            busy = true; renderDock();
            let ok = 0, fail = 0;
            for (let i = 0; i < entries.length; i++) {
                const url = entries[i][1];
                const fn = `${name}-${String(i + 1).padStart(3, '0')}.${ext(url)}`;
                try {
                    await dlSingle(url, fn);
                    ok++;
                } catch (e) {
                    fail++;
                    console.warn('[WX] 下载失败:', fn, e);
                }
                setProgress(isNew, `${i + 1}/${entries.length}`);
                if (i < entries.length - 1) await delay(600);
            }
            busy = false; clearSel(); renderDock();
            toast(fail ? `完成 ${ok} 张，失败 ${fail} 张` : '下载完成');
        } else if (mode === 'zip') {
            busy = true; renderDock();
            let done = 0;
            const files = [];
            await parallel(entries, 4, async ([, url], i) => {
                try {
                    const b = await fetchImg(url);
                    files.push({ name: `${name}/${String(i + 1).padStart(3, '0')}.${ext(url, b.type)}`, blob: b });
                } catch (_) {}
                setProgress(isNew, `${++done}/${entries.length}`);
            });
            if (files.length) {
                setProgress(isNew, '打包中');
                dlBlob(await makeZip(files), `${name}.zip`);
                busy = false; clearSel(); renderDock(); toast('ZIP 已下载');
            } else {
                busy = false; renderDock(); toast('无可用图片');
            }
        }
    }

    function setProgress(isNew, txt) {
        const d = document.getElementById('ps-dock');
        if (!d) return;
        const b = d.querySelector(`[data-a="${isNew ? 'dl-new' : 'dl'}"]`);
        if (b) b.textContent = txt;
        const pill = d.querySelector('.ps-pill');
        const pillN = d.querySelector('.ps-pill-n');
        const pillL = d.querySelector('.ps-pill-l');
        if (pill) pill.classList.add('ps-busy');
        if (pillN) pillN.textContent = txt;
        if (pillL) pillL.textContent = '下载中';
    }

    // === 网络 ===
    function fetchImg(url) {
        return new Promise((ok, no) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                fetch(url, { credentials: 'omit' }).then(r => r.ok ? r.blob() : Promise.reject()).then(ok, no);
                return;
            }
            const t = setTimeout(() => no(new Error('timeout')), 20000);
            GM_xmlhttpRequest({
                method: 'GET', url, responseType: 'blob', timeout: 18000,
                onload(r) { clearTimeout(t); r.status < 300 && r.response ? ok(r.response) : no(); },
                onerror() { clearTimeout(t); no(); },
                ontimeout() { clearTimeout(t); no(); }
            });
        });
    }
    // === ZIP ===
    async function makeZip(files) {
        const enc = new TextEncoder();
        const locals = [], centrals = [];
        let off = 0;
        for (const f of files) {
            const nb = enc.encode(f.name);
            const data = new Uint8Array(await f.blob.arrayBuffer());
            const crc = crc32(data);
            const lh = new Uint8Array(30 + nb.length);
            const lv = new DataView(lh.buffer);
            lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
            lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
            lv.setUint16(26, nb.length, true); lh.set(nb, 30);
            const ch = new Uint8Array(46 + nb.length);
            const cv = new DataView(ch.buffer);
            cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
            cv.setUint16(8, 0x0800, true); cv.setUint32(16, crc, true);
            cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
            cv.setUint16(28, nb.length, true); cv.setUint32(42, off, true); ch.set(nb, 46);
            locals.push(lh, data); centrals.push(ch);
            off += lh.length + data.length;
        }
        const cs = centrals.reduce((s, c) => s + c.length, 0);
        const end = new Uint8Array(22);
        const ev = new DataView(end.buffer);
        ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true);
        ev.setUint16(10, files.length, true); ev.setUint32(12, cs, true); ev.setUint32(16, off, true);
        return new Blob([...locals, ...centrals, end], { type: 'application/zip' });
    }
    const CRC_T = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
    function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (~c) >>> 0; }

    // === UI ===
    function showModal(html) {
        const bg = document.createElement('div');
        bg.className = 'ps-modal-bg';
        bg.innerHTML = `<div class="ps-modal-card">${html}<div class="ps-modal-foot"><button class="ps-m-cancel">取消</button></div></div>`;
        document.body.appendChild(bg);
        bg.querySelector('.ps-m-cancel').onclick = () => closeModal(bg);
        bg.addEventListener('click', e => { if (e.target === bg) closeModal(bg); });
        const onK = e => { if (e.key === 'Escape') closeModal(bg); };
        document.addEventListener('keydown', onK);
        bg._k = onK;
        requestAnimationFrame(() => bg.classList.add('ps-show'));
        return bg;
    }
    function closeModal(bg) {
        if (bg._k) document.removeEventListener('keydown', bg._k);
        bg.classList.remove('ps-show');
        setTimeout(() => bg.remove(), 200);
    }
    function prefixModal(cb) {
        const m = showModal(`<h3>下载前缀</h3><p>文件名使用此前缀区分不同批次</p><input id="ps-pf" value="${esc(prefix)}">`);
        const inp = m.querySelector('#ps-pf');
        const ok = document.createElement('button');
        ok.className = 'ps-m-ok'; ok.textContent = '确认';
        ok.onclick = () => { const v = inp.value.trim(); if (v) { prefix = v; save(SK.prefix, v); } closeModal(m); if (cb) cb(); };
        m.querySelector('.ps-modal-foot').appendChild(ok);
        inp.focus(); inp.select();
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); });
    }
    function linksModal() {
        const m = showModal(`<h3>链接打包</h3><p>粘贴图片链接，一行一个</p><textarea placeholder="https://mmbiz.qpic.cn/..."></textarea>`);
        const ta = m.querySelector('textarea');
        const ok = document.createElement('button');
        ok.className = 'ps-m-ok'; ok.textContent = '打包下载';
        ok.onclick = async () => {
            const urls = [...new Set((ta.value.match(/https?:\/\/[^\s,]+/gi) || []).map(u => norm(u)).filter(Boolean))];
            if (!urls.length) { toast('未找到链接'); return; }
            ok.disabled = true; ok.textContent = '处理中...';
            const files = []; let done = 0;
            await parallel(urls.map((u, i) => [i, u]), 4, async ([i, url]) => {
                try { const b = await fetchImg(url); files.push({ name: `links/${String(i + 1).padStart(3, '0')}.${ext(url, b.type)}`, blob: b }); } catch (_) {}
                ok.textContent = `${++done}/${urls.length}`;
            });
            if (files.length) { dlBlob(await makeZip(files), `链接打包-${prefix}.zip`); toast('ZIP 已下载'); closeModal(m); }
            else { ok.textContent = '打包下载'; ok.disabled = false; toast('抓取失败'); }
        };
        m.querySelector('.ps-modal-foot').appendChild(ok);
        ta.focus();
    }

    let toastT;
    function toast(msg) {
        let el = document.querySelector('.ps-toast');
        if (!el) { el = document.createElement('div'); el.className = 'ps-toast'; document.body.appendChild(el); }
        el.textContent = msg; el.classList.add('ps-show');
        clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('ps-show'), 3000);
    }

    // === 通用 ===
    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
    function dlSingle(url, filename) {
        return new Promise((ok, no) => {
            if (typeof GM_download === 'function') {
                GM_download({
                    url, name: filename, saveAs: false,
                    onload: ok,
                    onerror(e) {
                        console.warn('[WX] GM_download 失败, 回退 fetch:', e);
                        fetchImg(url).then(b => { dlBlob(b, filename); ok(); }).catch(no);
                    },
                    ontimeout() {
                        console.warn('[WX] GM_download 超时, 回退 fetch');
                        fetchImg(url).then(b => { dlBlob(b, filename); ok(); }).catch(no);
                    }
                });
            } else {
                fetchImg(url).then(b => { dlBlob(b, filename); ok(); }).catch(no);
            }
        });
    }
    function dlBlob(b, n) { const u = URL.createObjectURL(b); dlUrl(u, n); setTimeout(() => URL.revokeObjectURL(u), 60000); }
    function dlUrl(u, n) { const a = document.createElement('a'); a.href = u; a.download = n; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 200); }
    function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
    function ext(url, mime) { if (mime) { const m = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime]; if (m) return m; } const x = url.split('?')[0].match(/\.(\w{3,5})$/); if (x) return x[1].toLowerCase(); const fm = url.match(/wx_fmt=(\w+)/); if (fm) return fm[1]; return 'jpg'; }
    function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
    async function parallel(items, lim, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(lim, items.length) }, async () => { while (i < items.length) { const c = i++; await fn(items[c], c); } })); }

    // === 启动 ===
    function init() {
        // 等待文章内容和图片都加载到 DOM
        const waitContent = () => {
            const root = document.querySelector(CONTENT_SEL);
            if (root && root.querySelector('img[data-src], img[src*="mmbiz"]')) {
                loadSel();
                injectCSS();
                createDock();
                setupEvents();
                scan();
                setTimeout(scan, 1000);
                setTimeout(scan, 3000);
                setInterval(() => { scan(); updateDock(); }, 4000);
                save(SK.dock, false);
                console.log(`[WX Selector] v1.0 ready, ${selected.size} saved, ${contentImgs().length} images found`);
            } else {
                setTimeout(waitContent, 500);
            }
        };
        waitContent();
    }

    init();
})();
