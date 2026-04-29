# CS2DemoPlayer：cs2lens.com 前端设计提炼与迁移参考（2026-04-28）

## 1. 文档目的

本文件把 `www.cs2lens.com` 的前端视觉语言提炼成一份可落地的设计参考，供 CS2DemoPlayer 后续界面改造使用。

目标不是复制 cs2lens 的页面，而是吸收它适合 CS2 Demo 工具的部分：暗色电竞 HUD、紧凑信息密度、以地图 / 时间轴 / 队伍状态为核心的回放控制台感。

## 2. 参考页面与观察范围

参考页面：

- `https://www.cs2lens.com/`：比赛列表 / 筛选 / Replay 入口。
- `https://www.cs2lens.com/about`：品牌、订阅表格、暗色内容页排版。
- `https://www.cs2lens.com/filter`：多条件回合筛选器、分段按钮、结果行。
- `https://www.cs2lens.com/upload-cs2`：拖拽上传区、极简空页面。
- `https://www.cs2lens.com/match/<match-id>`：回放主界面，中心地图 + 两侧队伍 + 底部时间轴。

观察结论以实际页面渲染和 CSS 资源为准；源码只作为解释视觉 token 的辅助。

## 3. 一句话设计方向

> **CS2 专业回放控制台：深色、紧凑、高密度，以地图和时间轴为视觉中心，用少量青蓝 / 橙黄强调阵营和关键动作。**

对应到 CS2DemoPlayer：

- Demo 库、HLTV、Library、Playbook 继续保持工作台效率。
- Replay 页应成为视觉中心：地图最大、左右 HUD 面板稳定、底部时间轴专业化。
- 视觉上从“普通 Electron 工具”升级为“CS2 分析 cockpit”。

## 4. 设计 DNA

### 4.1 暗色基底

cs2lens 几乎所有页面都建立在近黑 / 炭灰背景上：

- 顶栏：`#181818` 附近。
- 页面背景：`#1f1f1f` / `#222222` 附近。
- 表格分隔：`#2e2e2e` / `#444444`。
- 弱文本：`#555555`、`#666666`、`#777777`。
- 主文本：`#b1b1b1`、`#dddddd`、`#ffffff`。

效果：页面不会像游戏 UI 那样花，但长期观看不刺眼，适合分析工具。

### 4.2 少量高亮色

高亮色只服务功能语义，不做大面积装饰：

| 语义 | 参考色 | 用途 |
| --- | --- | --- |
| Brand / Lens | `#aceeff` | Logo、少量品牌高亮 |
| CT / 信息 | `#47cbff`、`#1e556b` | CT 阵营、蓝色状态、玩家血条背景 |
| T / 热点 | `#ffaf47`、`#ffbb62`、`#704d1e` | T 阵营、火 / 投掷物 / 暖色状态 |
| Replay 主操作 | `#2f5f8f` 到 `#3f75a8` | 播放、打开回放 |
| Analyse / Playbook | `#c28119` | 分析、咖啡杯、投掷物 / 战术动作 |
| 成功 / 已完成 | `#67c467`、`#2e8b57` | 上传完成、可用状态 |
| 语音 / 特殊能力 | `#f783ff`、`#cb7cd1` | Voice Comms 类高级功能 |

迁移建议：CS2DemoPlayer 不要同时引入过多 accent。首轮固定 4 个核心色即可：`brand-cyan`、`ct-blue`、`t-amber`、`action-blue`。

### 4.3 细线、虚线、阴影

cs2lens 很多容器不是厚卡片，而是靠细线和 drop-shadow 划分：

- 顶栏 / 底栏使用 `1px dashed #444`。
- Dropdown / Modal 用 `1px solid #747474` 和深色阴影。
- 表格行用低对比底线，行间距非常小。
- 地图、图标、武器 SVG 常加轻微 `drop-shadow`。

迁移建议：CS2DemoPlayer 的大卡片阴影要减少，改成“暗面板 + 细边界 + 微光高亮”。

## 5. 页面结构提炼

### 5.1 全局 App Shell

cs2lens 的 shell 很克制：

- 顶栏固定高度约 `50px`。
- 左侧是 logo + 少量导航。
- 右侧是 Sign Up / Login 或账户菜单。
- 中间可放反馈、告警或一次性公告。
- 顶栏底部虚线分隔，暗色阴影压住内容区。

CS2DemoPlayer 可采用：

- 顶栏高度固定 `48px` 或 `50px`。
- 左侧保留产品名 `CS2 DEMO PLAYER` 或更短 `CS2DP`。
- 中部不常驻说明，只在有后台任务时显示状态 chip。
- 右侧保留 `Import`、`Refresh`、`Settings` 之类高频动作。

### 5.2 列表 / Library 页面

cs2lens 首页比赛列表特点：

- 容器最大宽度约 `1024px`，顶部距导航约 `75px`。
- 筛选按钮在列表上方横向排布。
- 表格行高度小，文字偏灰，hover 后变亮。
- 主要信息按“日期 / 时间 / 队伍 A / 队伍 B / 比分 / Replay / Analyse / 地图”排列。
- 重要行通过更亮队名和 text-shadow 提权，而不是增加大卡片。

CS2DemoPlayer 的 Demo / HLTV / Library 页面可采用：

- 用紧凑 table/list 替代大卡片堆叠。
- 主行只显示：赛事 / 队伍 / 地图 / 时间 / 状态 / 主要动作。
- 次级信息收进 hover、展开行或右侧小 badge。
- 删除“解释页面用途”的长文案，让列表成为首屏主体。

### 5.3 Filter / Playbook 筛选页面

cs2lens filter 页的价值在于“成组按钮”：

- 阵营：`T / CT`。
- 经济：`Eco / Eco+ / Semi / Full`。
- 结果：`W / L`。
- 来源：`HLTV / ESEA / Upload`。
- 地图：`Ancient / Anubis / Dust2 ...`。
- 时间：`1 Month / 3 Months / All time`。

特点：

- 按钮宽度统一，形成控制面板感。
- 未选中态非常暗，选中态才亮。
- 不使用复杂图标，直接用文本 + 色块表达筛选。

CS2DemoPlayer 的 Playbook 可采用：

- 投掷物类型：`Smoke / Flash / Molotov / HE`。
- 阵营：`T / CT`。
- 地图：地图名 segmented group。
- 来源：`Current demo / Library / Manual`。
- 用途：`Execute / Retake / Default / Fake / Utility clear`。

### 5.4 Upload / Import 页面

cs2lens 上传页极简：

- 页面中间只有一个宽大的 dashed dropzone。
- 文案短：`Drag 'n' drop .dem, .bz2, .gz, .zst or .zip file here`。
- 下方只有反馈入口。
- 没有多余说明、引导卡片和营销信息。

CS2DemoPlayer 的 Import Demo 可采用：

- 首屏一个中心 dropzone，支持 click / drag。
- 文件类型和状态写在同一行。
- 解析进度用细进度条，不用大 modal。
- 错误信息贴近 dropzone，避免全局 toast 堆积。

### 5.5 Replay 主界面

这是最值得迁移的部分。

cs2lens Replay 页布局：

```text
┌──────────────── fixed top nav ────────────────┐
│ logo / about                         account  │
├───────────────────────────────────────────────┤
│          small timer badge: 01:55             │
│                                               │
│ team A HUD     large map canvas     team B HUD│
│ player rows     radar/map view      player rows│
│                                               │
├──────────────── bottom timeline ──────────────┤
│ map icons | round buttons | controls | actions│
└───────────────────────────────────────────────┘
```

关键视觉：

- 地图占最大面积，灰度 / 低亮度，避免喧宾夺主。
- 两侧队伍面板窄而稳定，玩家行紧凑。
- 时间显示是顶部中间的小 badge，不是大标题。
- 底部时间轴占满宽度，控制按钮靠下，形成专业播放器感。
- Round 号码用 CT / T 颜色区分胜方或阵营。

CS2DemoPlayer Replay 页建议：

- 地图区域设为绝对中心，优先占用 `min(60vw, availableWidth)`。
- 左右队伍面板宽度固定区间：`220px ~ 340px`。
- 底部控制条固定 `56px ~ 72px`。
- Round 列表从侧边/散乱区域迁移到时间轴附近。
- Play / speed / seek / round jump / note / paint / search 统一放入底栏。

## 6. 设计 Token 草案

建议先建立一组项目级 CSS 变量，不直接复制 cs2lens class：

```css
:root {
  --c2-bg-page: #1f1f1f;
  --c2-bg-shell: #181818;
  --c2-bg-panel: #222222;
  --c2-bg-panel-soft: rgba(34, 34, 34, 0.72);
  --c2-bg-panel-raised: #2b2b2b;

  --c2-border-muted: #303030;
  --c2-border: #444444;
  --c2-border-strong: #555555;
  --c2-border-dashed: 1px dashed #444444;

  --c2-text-main: #dddddd;
  --c2-text-soft: #b1b1b1;
  --c2-text-muted: #777777;
  --c2-text-faint: #555555;

  --c2-brand-cyan: #aceeff;
  --c2-ct: #47cbff;
  --c2-ct-dim: #1e556b;
  --c2-t: #ffaf47;
  --c2-t-dim: #704d1e;
  --c2-action-blue: #3f75a8;
  --c2-action-amber: #c28119;
  --c2-success: #67c467;
  --c2-danger: #e03939;

  --c2-topbar-h: 50px;
  --c2-footer-h: 60px;
  --c2-radius-sm: 4px;
  --c2-radius-md: 6px;
  --c2-shadow-shell: 0 0 20px rgba(0, 0, 0, 0.55);
  --c2-shadow-icon: drop-shadow(1px 1px 1px rgba(0, 0, 0, 0.85));
}
```

## 7. 字体与排版建议

cs2lens logo 使用 `Saira Semi Condensed`，正文仍接近系统 sans。它的效果是：品牌有电竞感，正文不抢戏。

CS2DemoPlayer 可选：

- Logo / 数字 / HUD：`Saira Semi Condensed`、`Rajdhani`、`Barlow Condensed` 三选一。
- 中文正文：`Noto Sans SC` 或系统中文字体兜底。
- 数字 / 时间 / tick：可用 `JetBrains Mono` 或 `IBM Plex Mono`，但只用于计时、tick、比分。

字号建议：

| 场景 | 字号 | 说明 |
| --- | --- | --- |
| 顶栏 logo | `18px` | 紧凑，不做大标题 |
| 页面标题 | `20px ~ 24px` | 只在内容页使用 |
| 列表主行 | `14px ~ 16px` | 高密度浏览 |
| 列表次级 | `11px ~ 13px` | 时间、来源、状态 |
| HUD 玩家名 | `13px ~ 15px` | 根据面板高度压缩 |
| 时间轴 round | `11px ~ 12px` | 不抢地图 |

## 8. 组件规格

### 8.1 顶栏

- 高度：`50px`。
- 背景：`--c2-bg-shell`。
- 底边：`--c2-border-dashed`。
- 左：logo / 当前页面短标签。
- 中：后台任务状态 chip，仅有任务时显示。
- 右：主要操作按钮和设置。

验收：顶栏不出现长说明，不占用内容注意力。

### 8.2 按钮

按钮分 4 类：

| 类型 | 颜色 | 用途 |
| --- | --- | --- |
| Primary blue | `--c2-action-blue` | Replay、Open、Play |
| Amber | `--c2-action-amber` | Analyse、Import to Playbook、Utility |
| Ghost | transparent + border | 筛选、次级操作 |
| Danger ghost | 暗红边框 | 删除、清空缓存 |

按钮尺寸：

- 列表按钮：`height: 30px ~ 34px`。
- 底栏 icon button：`32px` 正方形。
- 顶栏按钮：`30px` 左右。

### 8.3 表格 / 列表行

- 行背景默认透明或 `rgba(255,255,255,0.01)`。
- 行底边：`1px solid #2e2e2e`。
- hover：主文本提亮，操作图标出现。
- selected：左侧用 `2px` accent bar，不整行大面积变色。
- 重要状态用 badge，不用整行彩色。

### 8.4 队伍 / 玩家 HUD

队伍面板：

- 背景：半透明深灰。
- 队名：白 / 浅灰，比分在右。
- 阵营色只用于血条、边线、少量文字。

玩家行：

- 高度控制在 `28px ~ 42px`。
- HP 用横向条，不用大数字块。
- 钱、甲、武器图标靠右。
- dead 状态整体降到 `#464646`，但布局不跳动。

### 8.5 地图区域

- 地图保持视觉中心。
- 默认地图低饱和、低亮度；事件 / player / grenade 才使用高亮色。
- 地图背景不要放大面积网格或花纹，避免干扰战术判断。
- 可考虑 `drop-shadow(3px 3px 3px #1f1f1f)` 提升层次。

### 8.6 时间轴 / 底栏

底栏是 Replay 页的“专业感来源”：

- 高度：`60px` 左右。
- 上层：地图 / round 列表。
- 下层：播放速度、play/pause、seekbar、当前时间、工具按钮。
- seekbar 轨道非常细，thumb 清晰。
- round 号码按阵营 / 胜方轻微上色。

### 8.7 Dropzone

- 宽度：内容区 `70% ~ 85%`，最大约 `850px`。
- 高度：`80px ~ 110px`。
- 边框：`2px dashed #555`。
- active：边框改青色，背景略偏蓝灰。
- disabled：文字和边框降到 `#444`。

## 9. CS2DemoPlayer 页面映射

### 9.1 Demo 页

从“文件管理页”变成“本地 demo 控制台”：

- 顶部只保留 `Demo`、`Import demo`、`Refresh`。
- 列表主行：文件名 / 地图 / 回合数 / 最近打开 / 状态 / Replay。
- 解析状态用小 badge + 细进度条。

### 9.2 HLTV 页

从“抓取工具页”变成“比赛发现列表”：

- 搜索和 Refresh 在顶部。
- 结果行紧凑显示：队伍 A、比分、队伍 B、赛事、BO、地图、Demo 可用性。
- `加入本地游戏库` 用 amber ghost，下载 demo 用 blue。

### 9.3 Library 页

从“资料面板”变成“本地资料索引”：

- `Matches / Teams / Players` tab 低调显示。
- 重要动作靠右，危险动作弱化。
- 队标、地图、缓存状态作为辅助视觉。

### 9.4 Playbook 页

从“功能规划页”变成“战术资产库”：

- 第一层只放 `地图 / 投掷物`。
- 投掷物列表用紧凑行：地图、阵营、类型、标题、tags、来源 round、打开/编辑。
- 地图页卡片可以更视觉化，但仍保持暗色低饱和。

### 9.5 Replay 页

优先改造：

- 地图居中最大化。
- 左右 HUD 固定宽度。
- Round / seek / 控制按钮全部进入底部控制条。
- 当前时间 badge 放顶部中间。
- Playbook 导入 / 标注 / 截图 / 搜索统一放右下工具区。

## 10. 迁移分阶段建议

### Phase A：Token 与基础壳

- 新增或整理 CSS variables。
- 顶栏、按钮、列表、badge 统一颜色和边框。
- 不改业务逻辑。

验收：所有页面看起来属于同一套暗色系统。

### Phase B：列表页提密度

- Demo / HLTV / Library 列表改成更紧凑的 row-first 布局。
- 弱化 summary、说明、空模块。
- 统一 hover / selected / disabled 状态。

验收：首屏能看到更多真实条目，而不是说明文字。

### Phase C：Replay Cockpit

- 重排 Replay：地图中心、两侧 HUD、底部 timeline。
- 收敛 round controls。
- 建立 CT/T 阵营色和 dead/loading 状态。

验收：打开回放后第一眼像专业 CS2 分析工具。

### Phase D：Playbook 专业化

- 投掷物库接入筛选按钮组。
- 投掷物类型和阵营用稳定颜色。
- 编辑区保持紧凑，不做表单大页面。

验收：Playbook 像“战术资产库”，不是普通 CRUD 表。

### Phase E：细节抛光

- CSS-only hover、fade、icon reveal。
- 地图图标低饱和 -> hover fullbright。
- 进度条 stripe / 状态色。
- 键盘焦点可见但不突兀。

## 11. 交互与动效原则

保守动效，重点在状态反馈：

- hover 只做提亮、边框变色、图标显现。
- 页面进入可以有一次轻微 fade / translate，但不要弹跳。
- 长任务必须有状态：loading / queued / parsing / done。
- seekbar、round button、filter button 的状态要即时响应。
- 地图内 marker / grenade trail 可以比普通 UI 更亮，因为它们是分析对象。

## 12. 不建议照搬的部分

- 不要直接复制 cs2lens 订阅、账号、社交反馈组件。
- 不要照搬外部 API / 上传商业逻辑。
- 不要让所有文字都变成英文；CS2DemoPlayer 当前中文工作流仍应中文优先。
- 不要把页面全部压得过密：Electron 本地工具还需要留出可点击空间。
- 不要为了像 cs2lens 而牺牲当前 Playbook / HLTV 已有功能入口。

## 13. 首轮可执行清单

如果今晚开始改 UI，建议按这个顺序：

1. 建立 `--c2-*` CSS variables。
2. 统一顶栏、按钮、tab、badge、列表行。
3. 把 Demo / HLTV / Library 页面的大说明和 summary 再压一轮。
4. 设计 Replay 页底部控制条：round list + seekbar + play controls。
5. 为 HUD 玩家行建立 CT/T/dead/loading 四态。
6. Playbook 投掷物页加入 segmented filters。
7. 用截图检查：首屏主体是否是“数据 / 地图 / 控件”，而不是说明文字。

## 14. 验收标准

- 页面整体是深色专业分析工具，而不是普通后台。
- 主操作一眼可见：Import、Replay、Analyse / Playbook。
- Replay 页地图占视觉中心，HUD 和 timeline 不抢主体。
- 列表页高密度但不混乱，每行主次信息清楚。
- CT/T/状态色使用稳定，不随页面随机变化。
- 中文文案短、硬、动作导向。
- 所有新增文本文件保持 UTF-8。

## 15. 参考色速查

```text
background.shell     #181818
background.page      #1f1f1f
background.panel     #222222
border.muted         #303030
border.default       #444444
text.main            #dddddd
text.soft            #b1b1b1
text.muted           #777777
brand.cyan           #aceeff
ct.blue              #47cbff
t.amber              #ffaf47
action.blue          #3f75a8
action.amber         #c28119
success.green        #67c467
danger.red           #e03939
```
