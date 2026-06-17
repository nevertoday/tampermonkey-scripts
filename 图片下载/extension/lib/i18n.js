// Shared i18n dictionary for both the side panel and the on-page content script.
// Each entry is [zh, en]; zh is the default. Use {name} style placeholders.
(function () {
  'use strict';

  const M = {
    // Tabs + leads
    tab_sites: ['站点', 'Sites'],
    tab_links: ['链接', 'Links'],
    tab_history: ['历史', 'History'],
    tab_settings: ['设置', 'Settings'],
    lead_sites: ['悬停图片即可拾取，批量下载原图', 'Hover an image to grab it, then batch-download originals'],
    lead_links: ['粘贴图片直链，无需打开网页', 'Paste direct image links — no page needed'],

    // Links tab
    links_placeholder: [
      '每行一个图片直链\nhttps://example.com/a.jpg\nhttps://example.com/b.png\nhttps://example.com/c.webp',
      'One direct image link per line\nhttps://example.com/a.jpg\nhttps://example.com/b.png\nhttps://example.com/c.webp'
    ],
    prefix: ['前缀', 'Prefix'],
    link_count: ['{n} 条链接', '{n} links'],
    link_count_pending: ['{n} 条链接待下载', '{n} links ready'],
    links_empty_hint: ['粘贴图片直链即可下载', 'Paste direct image links to download'],
    btn_links_text: ['链接文本', 'Link list'],
    btn_direct: ['逐张下载', 'Save each'],
    btn_zip: ['ZIP 打包', 'ZIP'],
    link_download: ['链接下载', 'Link download'],

    // History tab
    history_title: ['历史', 'History'],
    history_sub: ['最近的下载记录', 'Recent downloads'],
    clear: ['清空', 'Clear'],
    history_hint: ['点任意记录可预览或重新下载', 'Tap a record to preview or re-download'],
    history_empty: ['还没有历史记录', 'No history yet'],
    history_empty_filtered: ['这个平台还没有历史记录', 'No history for this site yet'],
    filter_all: ['全部', 'All'],

    // Settings
    set_language: ['语言', 'Language'],
    set_minipanel: ['网页快捷栏', 'On-page toolbar'],
    set_minipanel_sub: ['右下角显示已选数量和下载按钮', 'Shows the selected count and download buttons at the bottom-right'],
    set_collapsed: ['快捷栏默认收起', 'Collapse toolbar by default'],
    set_collapsed_sub: ['只显示数量，点击再展开', 'Shows only the count; tap to expand'],
    set_hover: ['图片选择按钮', 'Image select button'],
    set_hover_sub: ['悬停图片时显示选择按钮', 'Shows a select button when hovering an image'],
    set_shortcuts: ['键盘快捷键', 'Keyboard shortcuts'],
    set_shortcuts_sub: ['用快捷键选图、下载', 'Use keys to select and download'],
    shortcuts_title: ['快捷键', 'Shortcuts'],
    shortcuts_sub: ['字母或数字，保存即同步', 'A letter or digit; saves instantly'],
    reset: ['重置', 'Reset'],
    sc_select: ['选图', 'Select'],
    sc_alt: ['备用选图', 'Select (alt)'],
    sc_download: ['下载', 'Download'],
    sc_newbatch: ['新批次', 'New batch'],
    sc_clear: ['清空', 'Clear'],
    sc_links: ['链接列表', 'Link list'],
    sc_direct: ['逐张下载', 'Save each'],
    sc_zip: ['ZIP 压缩包', 'ZIP file'],
    set_dockposition: ['网页快捷栏位置', 'On-page toolbar position'],
    pos_right: ['右下角', 'Bottom-right'],
    pos_left: ['左下角', 'Bottom-left'],
    cache_title: ['图片缓存', 'Image cache'],
    cache_sub: ['保留已下载图片，便于在历史中重新下载', 'Keeps downloaded images so you can re-download them from History'],
    cache_clear: ['清除', 'Clear'],
    cache_usage: ['已缓存 {count} 张 · {size}', '{count} cached · {size}'],
    cache_empty: ['暂无缓存', 'Empty'],
    cache_cleared: ['图片缓存已清除', 'Image cache cleared'],
    set_defaultmode: ['默认下载方式', 'Default download mode'],
    mode_zip: ['打包为 ZIP', 'Package as ZIP'],
    mode_direct: ['逐张下载原图', 'Save originals one by one'],
    mode_links: ['保存链接文本', 'Save link list'],
    support_kicker: ['支持作者', 'Support'],
    support_title: ['打赏作者', 'Tip the author'],
    support_desc: ['觉得好用，扫码请作者喝杯咖啡。', 'If it helps, scan to buy the author a coffee.'],
    donate_wechat: ['微信', 'WeChat'],
    donate_wechat_sub: ['日常支持', 'Everyday support'],
    donate_alipay: ['支付宝', 'Alipay'],
    donate_alipay_sub: ['快捷打赏', 'Quick tip'],
    donate_compute: ['银联赞赏', 'UnionPay'],
    donate_compute_sub: ['支持持续适配', 'Support ongoing updates'],
    scan: ['扫码', 'Scan'],

    // Footer / status (side panel)
    status_default: ['等待选择图片', 'Waiting for image selection'],
    status_settings: ['设置即时保存并同步到网页', 'Settings save and sync to pages instantly'],
    status_can_select: ['可以选择图片', 'Ready to select images'],
    status_site_disabled: ['此网站已停用。可在“站点”中开启。', 'This site is off. Enable it under "Sites".'],
    unsupported_page: ['此页面不支持。请打开已启用的网站。', "This page isn't supported. Open an enabled site."],
    unsupported_short: ['此页面不支持', 'Unsupported page'],
    permission_needed_title: ['启用当前网站', 'Enable this site'],
    permission_needed_desc: ['拾图需要你授权 {name} 及其图片域名，才能在当前页面选图、打包和下载。授权只在你点击此按钮后触发。', 'Grant access to {name} and its image hosts so Image Picker can select, package, and download images on this page. Access is requested only after you click this button.'],
    permission_button: ['授权并启用', 'Grant access'],
    permission_retry: ['刚才没有完成授权。可再次点击“授权并启用”。', 'Access was not granted. Click "Grant access" again to retry.'],
    permission_granted: ['已启用 {name}', '{name} enabled'],
    permission_grant_failed: ['无法完成授权，请重试。', 'Could not grant access. Try again.'],
    permission_site_status_on: ['已授权', 'Granted'],
    permission_site_status_off: ['待授权', 'Needs access'],
    permission_site_button: ['授权', 'Grant'],
    no_tab: ['未找到当前标签页。请先打开一个网页。', 'No active tab. Open a web page first.'],
    tab_not_ready: ['此页面还不能使用。请刷新页面，或打开支持的网站。', "This page isn't ready. Refresh it, or open a supported site."],
    op_failed: ['操作失败，请重试。', 'Action failed. Try again.'],

    // Site card
    expand_settings: ['展开设置', 'Settings'],
    collapse_settings: ['收起设置', 'Hide'],
    filename_prefix: ['文件名前缀', 'Filename prefix'],
    site_disabled_suffix: ['{name} 已停用', '{name} off'],

    // Shortcut edit messages
    sc_only_alnum: ['快捷键只支持单个字母或数字', 'Shortcuts must be a single letter or digit'],
    sc_in_use: ['{key} 已用于{action}', '{key} is already used by {action}'],
    sc_updated: ['快捷键已更新：{action} {key}', 'Shortcut updated: {action} {key}'],
    sc_reset: ['快捷键已重置', 'Shortcuts reset'],
    sc_other: ['其他操作', 'another action'],

    // Download flow (shared)
    processing: ['处理中', 'Working…'],
    no_valid_links: ['没有识别到有效的图片链接', 'No valid image links found'],
    download_failed: ['下载失败', 'Download failed'],
    download_failed_retry: ['下载失败，请重试', 'Download failed. Try again.'],
    zip_empty: ['没有抓取到图片。可以改用“保存链接文本”。', 'No images fetched. Try "Save link list" instead.'],
    download_prepare_failed: ['无法准备下载文件。请重试。', 'Could not prepare the download. Try again.'],
    res_zip: ['ZIP 已保存 {count} 张', 'Saved {count} images to ZIP'],
    res_zip_failed: ['ZIP 已保存 {count} 张，失败 {failed} 张', 'Saved {count} to ZIP, {failed} failed'],
    res_direct: ['已下载 {count} 张', 'Downloaded {count} images'],
    res_direct_failed: ['已下载 {count} 张，失败 {failed} 张', 'Downloaded {count}, {failed} failed'],
    res_links: ['链接已保存 {count} 条', 'Saved {count} links'],
    res_generic: ['已处理 {count} 张', 'Processed {count} images'],
    res_generic_failed: ['已处理 {count} 张，失败 {failed} 张', 'Processed {count}, {failed} failed'],

    // History records
    type_copy: ['复制', 'Copy'],
    type_zip: ['ZIP', 'ZIP'],
    type_direct: ['逐张', 'Each'],
    type_links: ['链接', 'Links'],
    type_download: ['下载', 'Download'],
    images_word: ['图片', 'Images'],
    n_images: ['{n} 张', '{n} images'],
    n_links: ['{n} 条链接', '{n} links'],
    just_now: ['刚刚', 'just now'],
    history_record: ['历史记录', 'History'],
    history_no_links: ['这条历史没有可下载链接', 'This record has no downloadable links'],
    history_preview_empty: ['这条旧记录没有保存图片链接，无法预览或重新下载。', 'This old record has no saved links to preview or re-download.'],
    failed_suffix: ['，失败 {failed}', ', {failed} failed'],
    history_image: ['历史图片', 'History images'],
    btn_repack: ['重新打包', 'Re-pack'],
    preview_grid_label: ['历史图片预览', 'History image preview'],
    qr_caption: ['请使用 {label} 扫码', 'Scan with {label}'],
    donate_detail: ['用 {label} 扫码支持作者。', 'Scan with {label} to support the author.'],
    paste_links_title: ['粘贴图片链接', 'Paste image links'],
    close: ['关闭', 'Close'],
    close_dialog: ['关闭弹窗', 'Close dialog'],

    // Content: mini panel
    mp_select: ['选图', 'Select'],
    mp_clear: ['清空', 'Clear'],
    mp_links: ['链接', 'Links'],
    mp_prefix: ['前缀', 'Prefix'],
    mp_download: ['下载', 'Download'],
    mp_newbatch: ['新批次', 'New batch'],
    mp_fold: ['收起', 'Collapse'],
    mp_expand: ['展开', 'Expand'],
    mp_fold_aria: ['收起网页快捷栏', 'Collapse the on-page toolbar'],
    mp_expand_aria: ['展开网页快捷栏', 'Expand the on-page toolbar'],
    mp_collapsed_aria: ['已选择 {n} 张图片，点击展开网页快捷栏', '{n} images selected — tap to expand the toolbar'],
    mp_toolbar_aria: ['网页图片选择快捷栏', 'On-page image-select toolbar'],
    select_this: ['选择这张图片', 'Select this image'],

    // Content: toasts
    toast_hover: ['请把鼠标移到图片上', 'Move the cursor onto an image'],
    toast_cant_select: ['当前图片不可选择', "This image can't be selected"],
    toast_selected_one: ['已选择 1 张图片', 'Selected 1 image'],
    toast_deselected: ['已取消选择', 'Deselected'],
    toast_cleared: ['已清空选择', 'Selection cleared'],
    toast_none_selected: ['还没有选择图片。请先在页面上选择图片。', 'No images selected. Select some on the page first.'],
    toast_busy: ['正在下载，请稍后再试。', 'Downloading — please wait.'],
    toast_prefix_updated: ['前缀已更新', 'Prefix updated'],
    toast_copied: ['已复制 {n} 个链接', 'Copied {n} links'],
    toast_links_copied: ['链接已复制', 'Links copied'],
    toast_no_selection: ['还没有选择图片', 'No images selected'],
    site_disabled_panel: ['此网站已停用。请在侧边栏开启。', 'This site is off. Enable it in the side panel.'],
    cmd_unknown: ['无法执行此操作：{type}', "Can't run: {type}"],

    // Content: download phases + progress
    phase_fetching: ['正在抓取图片，请稍候…', 'Fetching images…'],
    phase_packing: ['图片抓取完成，正在打包 ZIP…', 'Fetched — packing ZIP…'],
    phase_saving: ['打包完成，正在保存到下载…', 'Packed — saving to downloads…'],
    phase_direct: ['正在逐张下载，请稍候…', 'Downloading one by one…'],
    prog_fetch: ['抓取', 'Fetch'],
    prog_pack: ['打包', 'Pack'],
    prog_save: ['保存', 'Save'],
    prog_download: ['下载', 'Download'],
    prog_process: ['处理', 'Process'],
    prog_fetching_n: ['正在抓取图片 {done}/{total}', 'Fetching {done}/{total}'],
    prog_packing: ['正在打包 ZIP…', 'Packing ZIP…'],
    prog_saving: ['正在保存文件…', 'Saving file…'],
    prog_done: ['即将完成…', 'Finishing…'],
    prog_direct_n: ['正在逐张下载 {done}/{total}', 'Downloading {done}/{total}'],
    prog_processing: ['正在处理…', 'Processing…'],
    selected_n_images: ['{n} 张已选图片', '{n} images selected'],

    // Content: modals
    dl_method: ['下载方式', 'Download method'],
    dl_total: ['共 {n} 张图片', '{n} images'],
    dl_prefix_title: ['下载前缀', 'Download prefix'],
    dl_prefix_desc: ['文件名使用此前缀区分不同站点和批次', 'The prefix distinguishes sites and batches in filenames'],
    confirm: ['确认', 'OK'],
    cancel: ['取消', 'Cancel'],
    image_links: ['图片链接', 'Image links'],
    image_links_desc: ['复制下面的链接，或保存为链接文本', 'Copy the links below, or save them as text'],
    copy: ['复制', 'Copy'],
    mode_links_title: ['链接列表', 'Link list'],
    mode_links_detail: ['保存全部原图 URL 到 .txt', 'Save all original URLs to a .txt'],
    mode_direct_title: ['逐张下载', 'Save each'],
    mode_direct_detail: ['直接保存到本地', 'Save directly to disk'],
    mode_zip_title: ['ZIP 压缩包', 'ZIP file'],
    mode_zip_detail: ['抓取图片打包下载', 'Fetch and package the images'],

    // Localized site names / badges (only ones that differ in English)
    siteName_xiaohongshu: ['小红书', 'Xiaohongshu'],
    siteBadge_xiaohongshu: ['小红书', 'RED'],
    siteName_wechat: ['微信公众号', 'WeChat'],
    siteBadge_wechat: ['微信', 'WeChat'],
    siteName_duitang: ['堆糖', 'Duitang'],
    siteBadge_duitang: ['堆糖', 'Duitang'],
    siteName_huaban: ['花瓣', 'Huaban'],
    siteBadge_huaban: ['花瓣', 'Huaban']
  };

  let lang = 'zh';

  function setLang(value) {
    lang = value === 'en' ? 'en' : 'zh';
  }

  function t(key, vars) {
    const pair = M[key];
    let str = pair ? (lang === 'en' ? pair[1] : pair[0]) : key;
    if (vars) {
      for (const name of Object.keys(vars)) {
        str = str.replace(new RegExp(`\\{${name}\\}`, 'g'), String(vars[name]));
      }
    }
    return str;
  }

  // Localized site name/badge by id; falls back to the supplied default when the
  // site has no translation (Pinterest, X, 500px, Dribbble, Instagram).
  function siteName(id, fallback) {
    const pair = M[`siteName_${id}`];
    return pair ? t(`siteName_${id}`) : (fallback || id);
  }

  function siteBadge(id, fallback) {
    const pair = M[`siteBadge_${id}`];
    return pair ? t(`siteBadge_${id}`) : (fallback || id);
  }

  // Attach to globalThis so this works both on pages (window) and in the
  // background service worker (self), which has no `window`.
  globalThis.ImageDownloaderI18n = { setLang, t, siteName, siteBadge, get lang() { return lang; } };
})();
