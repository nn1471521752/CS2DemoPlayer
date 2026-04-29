# CS2DemoPlayer 现代极简工作台设计规格（2026-04-28）

## 背景

当前 `codex/playbook-design` 分支已经把 Demo 库、HLTV 浏览 / 本地资料库、Entities 与 Playbook 串到同一个 Electron 工作台里，但界面仍然偏“信息面板堆叠”：summary cards、长说明、重复标签和未落地空模块占据了大量首屏空间，导致用户在真正手测前已经产生视觉负担。

本轮目标不是继续加功能，而是把已有页面做成更像现代网页产品的极简工作台。

## 设计方向

- 借鉴 `Linear / Vercel / Raycast` 的克制暗色工作台：留白更大、层级更少、内容区更清晰。
- 信息做减法：默认只显示行动按钮、搜索 / tab、核心列表或核心卡片。
- 把“状态说明、缓存数字、后续规划”从首屏主视觉里移走或弱化。
- 保持 HLTV、Demo、Playbook 当前业务链路不变，只重排可见信息。

## 非目标

- 不新增业务功能。
- 不改 Electron 主进程、SQLite schema 或 Python parser。
- 不做完整设计系统重写。
- 不在第一轮拆分 JS 大文件；本轮只改必要 renderer UI / CSS。

## 核心原则

1. **一个页面一个主任务**：页面标题和按钮直接服务当前动作。
2. **少解释，多入口**：移除“告诉用户这是哪里”的长文案，保留能点击、搜索、筛选的控件。
3. **低价值数字不常驻**：summary cards 默认隐藏或降级，避免抢占列表空间。
4. **未落地能力不展示**：战术 / 架构等未来模块不作为当前 tab 出现。
5. **视觉克制但精致**：深色底、柔和边界、统一按钮、轻量 accent，而不是厚重卡片堆叠。

## 页面规格

### 全局 shell

- 左侧导航使用简短英文标签：`Demo`、`HLTV`、`Library`、`Playbook`、`Entities`。
- 顶部 toolbar 保留应用标题、返回、导入、解析与状态，文案更短。
- 页面 header 只保留标题与必要 action，移除 eyebrow / subtitle 类重复说明。

### Demo 页

- 主信息：`Demo`、`Import demo`、`Refresh`、demo 列表。
- 移除 summary strip、`Local Workspace`、`Local demos` 等重复标签。
- 空态只保留一句简短说明与导入动作暗示。

### HLTV 页

- 主信息：`HLTV`、搜索、`Refresh`、`搜索HLTV`、结果列表。
- 缓存 summary / status 默认弱化为即时提示，不作为常驻大面板。
- 结果行只突出队伍、比分、地图 / BO / demo 可用性。

### Library 页

- 主信息：`Library`、tab、搜索 / 筛选、列表。
- 移除大 summary cards。
- 危险操作 `清除全部` 保留但视觉弱化。

### Playbook 页

- 主信息：`Playbook`、`地图 / 投掷物` 两个 tab。
- 暂不展示 `战术 / 架构` 未落地 tab 或空占位。
- 移除 summary cards 和未来规划说明。

### Entities 页

- 保留 review / registry 主流程，压缩说明、summary 与状态占位。
- 让候选列表和已收录列表成为首屏主体。

## 实现约束

- HTML：优先在 `src/renderer/index.html` 收敛可见文案与冗余 DOM；如果 JS 仍依赖某些节点，则使用 `is-hidden` 或更轻量容器保证兼容。
- CSS：继续保持 CSS 模块拆分，重点调整 `base-home-entities.css`、`local-library-playbook.css`、`hltv-results.css`。
- JS：只调整导航 labels / order、Playbook 可见 tabs、必要 summary 渲染策略。
- Tests：用 copy contract / renderer contract 锁住“无长文案、无未来空 tab、CSS 模块小于 800 行”。

## 验收标准

- 首屏不再出现大面积 summary cards 或长说明文案。
- Demo / HLTV / Library / Playbook 的主内容区域明显占据更多屏幕。
- Playbook 默认只显示 `地图 / 投掷物` 两个 tab。
- 页面按钮、tab、列表和空态具备统一现代暗色风格。
- 全部 JS tests、renderer syntax check 与 `git diff --check` 通过。