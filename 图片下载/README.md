# 图拾 Dock

把散落在网页里的好图，一张张拾起来。

图拾 Dock 是一个面向图片收集、素材整理和视觉参考归档的 Chrome 扩展，也保留了对应站点的油猴脚本版本。它让你继续在原网站里浏览、判断和筛选，只把重复的动作收拢起来：选图、计数、复制链接、批量下载、历史回看、站点开关和文件名前缀。

它不是一个粗暴的“整页图片扒取器”。它更像一个贴在网页边上的选图工作台：尊重你的判断，只帮你把机械操作变轻。

## 适合谁

如果你经常做这些事，图拾 Dock 会很顺手：

- 从小红书、Pinterest、花瓣里收集选题参考和视觉灵感。
- 保存微信公众号文章里的配图，便于归档、拆解和复盘。
- 在 500px、堆糖等图片站里挑选少量真正有价值的图片。
- 给设计、运营、内容、研究、资料库整理图片素材。
- 需要先筛选，再下载，而不是把页面里的所有图片一股脑保存下来。
- 想把不同网站的脚本能力统一到一个更清晰的 Chrome 侧边栏里。

很多工具解决的是“下载”。图拾 Dock 更关注下载之前的那一步：判断哪些图片值得留下。

## 它解决的真实问题

图片网站通常擅长展示，却不一定擅长帮助你整理。

常见的低效来自这些细节：

- 右键保存太慢，连续保存几十张图会打断思路。
- 页面里头像、图标、二维码、表情、广告图混在一起，通用下载器容易误抓。
- 很多站点使用缩略图、懒加载、瀑布流和动态路由，手动找原图链接很麻烦。
- 不同站点脚本分散，开关、前缀、下载方式和快捷键不统一。
- 滚动几屏之后，很难记住自己刚刚选过哪些图片。
- 下载失败时，不清楚是网络、权限、图片过期，还是某个站点改版。

图拾 Dock 的方式是：每个站点单独适配，页面内轻量选择，后台统一下载。

## 核心能力

### 在原网页上选择

- 鼠标移到图片上时显示选择按钮。
- 选中的图片会保留可见状态，滚动页面也不会丢。
- 支持鼠标指向选图：鼠标停在哪张图片上，快捷键就作用于哪张。
- 页面右下角有迷你 Dock，随时显示已选数量。
- Dock 可以展开操作，也可以收起成一个安静的计数点。

### 在侧边栏里管理

- 点击浏览器工具栏图标，打开 Chrome 侧边栏。
- 侧边栏包含 `站点`、`历史`、`设置` 三个区域。
- 每个网站可以单独启用或停用。
- 每个网站可以设置独立文件名前缀。
- 设置、快捷键、默认下载方式统一保存。

### 三种导出方式

- `链接列表`：把已选原图 URL 保存为 `.txt`。
- `逐张下载`：逐张保存到浏览器下载目录。
- `ZIP 压缩包`：后台抓取图片并打包为 ZIP。

下载方式弹窗支持快捷键：

| 快捷键 | 下载方式 |
| --- | --- |
| `1` | 链接列表 |
| `2` | 逐张下载 |
| `3` | ZIP 压缩包 |

这些快捷键可以在设置页里修改。

### 历史记录

- 最近的复制和下载动作会记录在本地。
- 可以按站点筛选历史。
- 历史详情里可以查看图片链接和预览。
- 保存过的链接可以再次用于链接文本、逐张下载或重新打包。

## 支持的网站

| 网站 | 域名 | 当前能力 |
| --- | --- | --- |
| 小红书 | `xiaohongshu.com` | 识别笔记内容图，尽量过滤头像、评论区图标、二维码、验证码等干扰图片。 |
| Pinterest | `pinterest.com` | 识别 Pin 图片，优先提取更清晰的 `pinimg.com` 图片地址。 |
| 微信公众号 | `mp.weixin.qq.com` | 识别正文区域图片，优先读取 `data-src` 并清理常见临时参数。 |
| 500px | `500px.com` | 识别作品页和图片流里的主要内容图。 |
| 堆糖 | `duitang.com` | 识别内容图，并处理常见缩略图链接。 |
| 花瓣 | `huaban.com` | 识别发现页和 Pin 页内容图，过滤头像和站内小图，还原花瓣 CDN 原图链接。 |

站点适配逻辑集中在 [extension/content/site-adapters.js](extension/content/site-adapters.js)。如果某个网站改版导致识别不准，优先检查这里，而不是改通用下载流程。

## 扩展版和油猴脚本版

这个项目同时包含两类形态：

### Chrome 扩展版

主力形态，代码在 [extension](extension/)。

适合需要统一设置、侧边栏、历史记录、快捷键和多站点管理的用户。

### 独立油猴脚本

项目根目录保留了各站点的 `.user.js`：

- [小红书-图片选择器.user.js](小红书-图片选择器.user.js)
- [pinterest-图片选择器.user.js](pinterest-图片选择器.user.js)
- [微信公众号-图片选择器.user.js](微信公众号-图片选择器.user.js)
- [500px-图片选择器.user.js](500px-图片选择器.user.js)
- [堆糖-图片选择器.user.js](堆糖-图片选择器.user.js)
- [花瓣-图片选择器.user.js](花瓣-图片选择器.user.js)

适合只想在单个网站里使用轻量脚本，或者还没有加载 Chrome 扩展的场景。

## 安装 Chrome 扩展

当前项目是本地开发版扩展，暂未走 Chrome Web Store 发布流程。

1. 打开 Chrome。
2. 进入 `chrome://extensions`。
3. 打开右上角的“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择项目里的 [extension](extension/) 目录。
6. 浏览器工具栏会出现「图拾 Dock」图标。

修改代码、图标或 manifest 后，需要回到 `chrome://extensions`，点击扩展卡片上的刷新按钮。

## 基本使用流程

1. 打开支持的网站页面，例如小红书笔记、微信公众号文章、花瓣 Pin 页或 500px 作品页。
2. 点击浏览器工具栏里的「图拾 Dock」图标，打开侧边栏。
3. 在网页中移动鼠标到目标图片上。
4. 点击图片上的选择按钮，或按 `A` / `S` 切换鼠标下方图片的选择状态。
5. 观察页面右下角 Dock 或侧边栏里的已选数量。
6. 点击下载，选择 `链接列表`、`逐张下载` 或 `ZIP 压缩包`。
7. 如需快速选择下载方式，在弹窗里按 `1`、`2`、`3`。

如果你只是想把链接交给其它工具处理，选择 `链接列表` 或复制图片链接会更合适。

## 侧边栏说明

### 站点

这里用于管理支持的网站。

- 展开某个站点，可以设置文件名前缀。
- 关闭某个站点后，该站点页面不再注入选择按钮和 Dock。
- 每个站点使用自己的主题色和简称，方便扫读。

### 历史

这里记录最近的下载和复制动作。

每条记录包含：

- 来源站点。
- 操作类型。
- 图片数量。
- 操作时间。
- 失败数量。
- 可复用的图片链接记录。

历史记录保存在浏览器本地，可随时清空。

### 设置

这里控制全局行为。

- `网页快捷栏`：是否显示页面右下角 Dock。
- `快捷栏默认收起`：默认只显示计数点，需要时再展开。
- `图片选择按钮`：鼠标移到图片上时是否显示选择按钮。
- `键盘快捷键`：是否启用页面快捷键。
- `快捷键`：自定义选图、下载、新批次、清空和下载方式快捷键。
- `默认下载方式`：设置下载时默认使用 ZIP、逐张下载或链接文本。
- `打赏作者`：放在设置页底部，不干扰主要工作流。

## 快捷键

默认快捷键：

| 快捷键 | 作用 |
| --- | --- |
| `A` | 切换鼠标下方的图片 |
| `S` | 切换鼠标下方的图片 |
| `D` | 打开下载方式弹窗 |
| `N` | 新批次下载前设置前缀 |
| `C` | 清空当前选择 |
| `1` | 下载方式：链接列表 |
| `2` | 下载方式：逐张下载 |
| `3` | 下载方式：ZIP 压缩包 |

当光标在输入框、文本框或可编辑区域里时，快捷键不会抢占输入。

## 文件名和前缀

下载文件名会使用站点前缀和批次标识。

示例：

```text
xiaohongshu-a1b2c3d4.zip
wechat-4f8e2a11.txt
pinterest-9c8b7a6d-001.jpg
huaban-6e2f19aa.zip
```

你可以把默认前缀改成更贴近自己工作流的名字，例如：

- `redbook`
- `wechat-article`
- `pin-reference`
- `huaban-board`

## 隐私和数据

图拾 Dock 当前没有远程服务器。

数据保存在浏览器本地：

- 设置保存在 `chrome.storage.sync`。
- 选择状态和历史记录保存在 `chrome.storage.local`。
- 下载通过 Chrome 自带的 `downloads` API 完成。
- ZIP 打包在扩展后台 service worker 中完成。

它不会上传你的图片内容，也不会把浏览记录发送到外部服务。

## 常见问题

### 为什么页面上没有选择按钮？

先检查：

1. 当前页面是否属于支持的网站。
2. 侧边栏 `站点` 里该网站是否已启用。
3. 设置里的 `图片选择按钮` 是否开启。
4. 页面图片是否已经加载完成。
5. 当前图片是否被识别为头像、图标、二维码、验证码或装饰图。

动态瀑布流页面可以先滚动到图片附近，再尝试选图。

### 为什么有些图片没有被识别？

不同网站会使用懒加载、缩略图、动态路由、登录态内容和复杂 DOM。扩展会持续扫描页面变化，但不会把所有 `<img>` 都当成内容图。

这是有意的取舍：少抓错图，比多抓一堆无关小图更重要。

### 为什么 ZIP 下载有失败数量？

ZIP 模式需要后台获取图片文件。失败可能来自：

- 图片地址已过期。
- 网站临时拒绝跨上下文请求。
- 网络波动。
- 图片需要特殊登录态或页面上下文。
- 网站改版导致原图地址还原规则失效。

遇到这类情况，可以先试：

- `逐张下载`
- `链接列表`
- `复制图片链接`

这些方式更容易定位具体是哪张图片不可访问。

### 为什么修改后 Chrome 里还是旧版本？

本地扩展需要手动刷新。

进入 `chrome://extensions`，找到「图拾 Dock」，点击刷新按钮。

### 是否可以继续加新网站？

可以。

优先新增站点适配器，保持通用选择、存储、下载和侧边栏逻辑稳定。一个新站点通常需要定义：

- 域名匹配。
- 内容图片筛选规则。
- 原图 URL 还原规则。
- 稳定的图片 key。
- 选择按钮挂载位置。

## 项目结构

```text
extension/
  manifest.json                 Chrome MV3 配置
  background.js                  侧边栏打开、下载、ZIP 打包、历史写入
  content/
    site-adapters.js             各网站图片识别和 URL 还原
    content.js                   页面选图、状态、Dock、快捷键、弹窗
    content.css                  页面内按钮、Dock、弹窗样式
  sidepanel/
    index.html                   侧边栏结构
    sidepanel.js                 侧边栏交互、设置、历史、站点管理
    styles.css                   侧边栏视觉系统
  assets/
    icon.svg                     图标源文件
    icon-*.png                   Chrome 扩展图标
    donate-*.png                 打赏二维码

tests/
  adapter-smoke.test.js          站点适配器冒烟测试
  manifest-routes.test.js        manifest 路由和权限测试
  sidepanel-trigger.test.js      侧边栏、Dock、快捷键和设置结构测试
  background-download.test.js    后台下载和历史写入测试
  huaban-userscript.test.js      花瓣油猴脚本关键行为测试

*.user.js                        各站点独立油猴脚本
docs/site-support-qa.md          站点支持和浏览器验证记录
```

## 开发和验证

检查 JS 语法：

```bash
for f in extension/background.js extension/content/site-adapters.js extension/content/content.js extension/sidepanel/sidepanel.js tests/adapter-smoke.test.js tests/manifest-routes.test.js tests/sidepanel-trigger.test.js tests/background-download.test.js tests/huaban-userscript.test.js 花瓣-图片选择器.user.js; do
  node --check "$f" || exit 1
done
```

运行测试：

```bash
node tests/adapter-smoke.test.js
node tests/manifest-routes.test.js
node tests/sidepanel-trigger.test.js
node tests/background-download.test.js
node tests/huaban-userscript.test.js
```

检查 manifest：

```bash
node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8'))"
```

一次性验证：

```bash
node tests/adapter-smoke.test.js && node tests/manifest-routes.test.js && node tests/sidepanel-trigger.test.js && node tests/background-download.test.js && node tests/huaban-userscript.test.js && for f in extension/background.js extension/content/site-adapters.js extension/content/content.js extension/sidepanel/sidepanel.js tests/adapter-smoke.test.js tests/manifest-routes.test.js tests/sidepanel-trigger.test.js tests/background-download.test.js tests/huaban-userscript.test.js 花瓣-图片选择器.user.js; do node --check "$f" || exit 1; done && node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8'))"
```

## 设计取向

图拾 Dock 的界面目标不是“炫”，而是让重复劳动变轻。

它遵循几个原则：

- 不打断原网站浏览节奏。
- 选择动作尽量贴近鼠标当前关注点。
- 页面 Dock 足够轻，必要时可以收起。
- 侧边栏负责承载设置、历史和站点管理。
- 文案直接说明下一步，不用空泛提示。
- 每个站点独立适配，避免粗糙的通用规则误伤页面。

好的工具不应该让人记住它有多复杂。它应该让人更快回到真正重要的工作：判断、筛选、整理和创作。

## 当前状态

核心链路已经具备：

- 六个站点适配。
- Chrome MV3 侧边栏扩展。
- 页面选图和迷你 Dock。
- ZIP、逐张、链接文本三种导出。
- 可编辑快捷键。
- 历史记录和平台筛选。
- 本地设置保存。
- 自动化测试和站点 QA 记录。

仍需注意：

- 图片网站经常改版，站点适配器需要持续维护。
- 某些真实页面可能受登录态、地区、懒加载策略影响。
- ZIP 模式依赖后台抓取图片，遇到站点限制时可能出现失败数量。

## 一句话

图拾 Dock 想做的是一件朴素的事：让认真收集图片的人，少一点重复操作，多一点判断和创造的时间。
