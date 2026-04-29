# CS2DemoPlayer UI Shell + Entities Removal Design Spec

## 背景

用户明确反馈当前前端“不好看、无用信息多，导致不想测试后端”。本轮不继续补小样式，而是先把 renderer 的信息架构和视觉基调定下来：删除已不作为当前主线的 `Entities` 顶层页面，保留 Demo / HLTV / Library / Playbook 四个入口，并把首页 shell 做成更现代、简洁、可手测的桌面工作台。

## 设计方向

- **整体壳层参考 Claude Desktop**：轻量 command/workspace shell、克制的分段导航、柔和材质、少解释文本。
- **CS2 业务组件参考 cs2lens**：比赛列表、资料库列表、Playbook 资源列表保持暗色紧凑、细线边界、CT 蓝 / T 琥珀 / action blue 等语义色。
- **信息做减法**：默认不展示大段说明和未来功能占位；只保留“现在能做什么”的入口和操作。
- **前端优先**：本轮只动 renderer HTML/CSS/JS 与相关前端契约测试，不删除后端实体服务、DB schema 或实体测试。

## 信息架构

主导航收敛为：

1. `Demo`：导入 demo、刷新本地 demo、进入回放。
2. `HLTV`：浏览 / 搜索比赛、下载并打开 demo。
3. `Library`：查看已缓存的 HLTV 比赛 / 战队 / 选手。
4. `Playbook`：查看地图与投掷物资源。

删除：

- `Entities` 顶层 nav item。
- `id="entities-page"` 页面 section。
- `entities-page-utils.js` 与 `entities-page.js` 在 `index.html` 中的加载。
- `HOME_SECTION_IDS.entities`、Entities page mapping 与自动加载逻辑。

暂不删除：

- 主进程 / DB / IPC 里的 entities 能力。
- `src/renderer/js/ui/entities-page*.js` 文件本体；它们先成为未加载代码，后续若确定彻底废弃再清理对应测试和后端。
- 复用在 Library / Playbook 里的 `.entities-*` 列表、tab、tag 样式。

## 视觉规则

- 顶层 shell 改为“横向 workspace bar + 中央内容区”，减少左侧后台感。
- brand 保留 `CS2` 识别，但降低重量；导航使用 segmented pill。
- 页面标题更小、更像桌面 app；减少 30px 大标题带来的后台感。
- 页面主体使用 warm graphite / glass surface；组件列表保持专业暗色 cockpit。
- page action button / filter / tab / list row 共享统一 radius、border、hover 和 active 语言。
- Replay cockpit 本轮不大改，避免影响回放链路；后续单独按 cs2lens 思路处理。

## 验收标准

- 打开首页只能看到 `Demo / HLTV / Library / Playbook` 四个主入口。
- `Entities` 不再出现在主导航、页面 DOM、renderer 脚本加载契约中。
- 旧的 dense copy / future-only Playbook tabs 不回归。
- CSS 仍保持拆分结构，新增模块每个文件小于 800 行。
- 前端契约测试通过：`test_home_shell_state_utils.js`、`test_hltv_page_copy_contract.js`、`test_renderer_css_structure.js`。
- 语法验证通过相关 renderer JS 的 `node --check`。
