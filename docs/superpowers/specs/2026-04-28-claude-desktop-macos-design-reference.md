# CS2DemoPlayer：Claude Desktop macOS 前端设计提炼与迁移参考（2026-04-28）

## 1. 文档目的

本文件提炼 Claude Desktop macOS 版的前端设计语言，作为 CS2DemoPlayer 后续 UI 改造的第二组参考。

与 `cs2lens.com` 的暗色电竞 HUD 不同，Claude Desktop macOS 版的核心价值是：**原生 Mac 窗口感、极简工作台、超大输入入口、温暖浅色材质、低干扰任务流**。

如果说 cs2lens 适合指导 Replay / HUD / 时间轴，那么 Claude Desktop 更适合指导 CS2DemoPlayer 的首页、Demo 导入页、Playbook 首页、任务入口和空状态。

## 2. 参考来源

- Claude Desktop overview：`https://claude.com/resources/tutorials/navigating-the-claude-desktop-app`
- Claude Code Desktop 文档：`https://code.claude.com/docs/en/desktop`
- 官方截图观察范围：Chat / Cowork / Code 三段式模式切换、macOS traffic-light 窗口、中心 composer、大留白、Cowork grid 背景、任务列表、权限确认卡片。

## 3. 一句话设计方向

> **Mac-native command workspace：浅暖底色、克制阴影、中心大输入框、三段式模式切换，让用户先行动，再进入细节。**

对应到 CS2DemoPlayer：

- 首页不要一上来展示大量状态面板，而是提供一个明确的“下一步动作入口”。
- 导入 demo、从 HLTV 搜索、打开 Playbook、继续最近回放，都可以收敛成中心 action composer。
- 工作台外壳更像 macOS app，而不是网页后台。

## 4. 设计 DNA

### 4.1 macOS 原生窗口感

Claude Desktop macOS 截图中最强的第一印象是“像一个真正的 Mac 应用”：

- 左上角 traffic lights：红 / 黄 / 绿。
- 顶部 toolbar 高度稳定，左右有返回 / 前进 / sidebar 按钮。
- 内容区没有传统网页大导航，而是轻量窗口工具栏。
- 主体四周留黑色或桌面背景，窗口本身是大圆角白色面板。

迁移建议：CS2DemoPlayer 作为 Electron 应用，可以模拟这种桌面应用感：

- 顶栏减少网页式导航堆叠。
- 左侧导航可以默认收起或极窄化。
- 主窗口采用更明确的 app chrome：顶部工具栏 + 中央内容区。

### 4.2 三段式模式切换

Claude Desktop 把核心功能收敛成顶部中央 segmented control：

```text
Chat | Cowork | Code
```

特征：

- 位置居中，弱化其他导航。
- 未选中项是灰色文字。
- 选中项是白色圆角 pill，带轻微边框和阴影。
- 这不是普通 tab，而是“当前工作模式”的选择。

CS2DemoPlayer 可借鉴为：

```text
Demo | HLTV | Playbook
```

或更偏任务流：

```text
Watch | Discover | Build
```

建议首轮仍用中文 / 英文混合少一点：

```text
Demo | HLTV | Playbook
```

### 4.3 中心 composer

Claude Desktop 首页的视觉中心不是列表，而是一个巨大的输入框 / composer：

- 标题在上方，例如问候语或任务口号。
- 输入框宽大、圆角、白底、轻阴影。
- 左下角是附件 / 文件夹 / plus。
- 右下角是模型选择 + 主提交按钮。
- 下方才是快捷动作 pill。

迁移到 CS2DemoPlayer：

- 首页中心可以是“拖入 demo / 输入 HLTV 链接 / 搜索比赛 / 输入战术标题”的统一入口。
- 左侧：导入文件、打开文件夹、粘贴 URL。
- 右侧：`解析`、`搜索`、`打开` 等主动作。
- 下方快捷 pill：`Import demo`、`Search HLTV`、`Open Playbook`、`Continue last replay`。

### 4.4 温暖浅色材质

Claude Desktop 的浅色不是纯白，而是暖灰 / 米白：

| 用途 | 近似色 | 说明 |
| --- | --- | --- |
| app background | `#f7f5f0` / `#f8f6f1` | 温暖米白，不刺眼 |
| toolbar | `#f2f0ea` | 与背景轻微区分 |
| segmented bg | `#ece9e2` | 暖灰 pill 背景 |
| card / composer | `#ffffff` | 输入卡片主面 |
| border | `#ddd8cf` | 非冷灰边框 |
| text main | `#353331` | 深暖灰文字 |
| text muted | `#77736c` | 次级文字 |
| accent | `#d97852` / `#e8ad9b` | Claude 橙 / 蜜桃提交按钮 |
| blue task icon | `#dff0ff` / `#2d8cff` | Cowork 任务列表小图标 |

CS2DemoPlayer 可以把这作为“浅色工作台模式”的参考，但不建议直接替换 Replay 深色模式。更适合：

- 首页 / Import / Playbook 规划页用浅暖色。
- Replay / HUD / 地图分析仍用 cs2lens 暗色。

## 5. 页面结构提炼

### 5.1 Chat 首页结构

```text
┌──────────────── mac toolbar ────────────────┐
│ traffic lights | sidebar | back/forward     │
│                 Chat Cowork Code            │
├─────────────────────────────────────────────┤
│                                             │
│             Claude mark + greeting          │
│                                             │
│          ┌ large rounded composer ┐         │
│          │ Type / for commands     │         │
│          │ +            model  ↑   │         │
│          └─────────────────────────┘         │
│                                             │
│        quick action pills below              │
│                                             │
└─────────────────────────────────────────────┘
```

CS2DemoPlayer 首页可对应：

- 标题：`Good evening, ready to review a demo?` 或中文 `今晚看哪场 demo？`
- Composer placeholder：`拖入 .dem、粘贴 HLTV 链接，或输入战术关键词`
- 快捷 pills：`导入 Demo`、`搜索 HLTV`、`继续回放`、`打开 Playbook`

### 5.2 Cowork 首页结构

Cowork 页多了轻网格背景和 Active tasks：

- 顶部大标题，强调“把任务完成”。
- 背景是非常淡的 square grid。
- Composer 内有 `Work in a folder` 这类上下文选择。
- 下方是 Active tasks 列表。

CS2DemoPlayer 可对应“任务工作台”：

- 背景淡网格可用于 Playbook 首页或分析任务页。
- `Active tasks` 可改为：正在解析、待复盘、最近导入、最近 Playbook 编辑。
- 每个任务行只保留图标、标题、时间，不放大卡片。

### 5.3 Code / 权限确认卡片

Claude Desktop Code 模式截图中有一个权限确认卡片：

- 文案明确：允许 Claude 编辑某个文件。
- 展示文件路径。
- 展示 diff 预览，红 / 绿高亮。
- 卡片嵌在对话 / 工作流中，不弹出大 modal。

CS2DemoPlayer 可借鉴到危险操作：

- 清空缓存、删除 demo、覆盖 Playbook 条目时，用 inline confirmation panel。
- 明确展示“将影响哪些文件 / 条目”。
- 如果是数据修改，展示 before / after 摘要。
- 避免系统 alert 或遮挡全屏 modal。

## 6. 设计 Token 草案：Claude 浅暖模式

可作为 CS2DemoPlayer 的 `workspace-light` 或 `landing` 主题参考：

```css
:root {
  --cl-bg-window: #f8f6f1;
  --cl-bg-toolbar: #f2f0ea;
  --cl-bg-segment: #ece9e2;
  --cl-bg-card: #ffffff;
  --cl-bg-card-soft: rgba(255, 255, 255, 0.82);

  --cl-border: #ddd8cf;
  --cl-border-soft: #ebe7df;
  --cl-shadow-card: 0 18px 48px rgba(44, 38, 28, 0.10);
  --cl-shadow-soft: 0 8px 24px rgba(44, 38, 28, 0.08);

  --cl-text-main: #353331;
  --cl-text-soft: #5f5b55;
  --cl-text-muted: #77736c;
  --cl-text-faint: #9a958d;

  --cl-accent-orange: #d97852;
  --cl-accent-peach: #e8ad9b;
  --cl-accent-blue: #2d8cff;
  --cl-blue-soft: #dff0ff;

  --cl-radius-window: 18px;
  --cl-radius-card: 26px;
  --cl-radius-pill: 12px;
  --cl-toolbar-h: 64px;
}
```

## 7. 字体与排版

Claude Desktop 的截图有两个明显层次：

- 大标题使用带文学感的 serif display，显得温和、有质感。
- UI 控件和输入使用现代 sans，强调可读性。

CS2DemoPlayer 可选：

- 中文标题：系统宋体不稳定，建议仍使用 sans，但可以加字重和留白。
- 英文标题：可用 `Georgia` / `Charter` / `Newsreader` 类 serif display。
- UI 文本：继续使用系统 sans。
- 数字 / tick / 时间：继续用 mono。

建议：不要在 Replay HUD 使用 serif；serif 只适合首页大标题或空状态。

## 8. 组件规格

### 8.1 macOS toolbar

- 高度：`60px ~ 68px`。
- 左侧：traffic lights 占位、sidebar toggle、back/forward。
- 中间：segmented mode switch。
- 右侧：设置 / 帮助 / 状态图标。
- 底边：`1px solid var(--cl-border)`。

### 8.2 Segmented control

- 背景：暖灰 pill。
- item padding：`12px 20px`。
- active：白底、1px 边框、轻阴影。
- inactive：灰文字，无边框。

CS2DemoPlayer 示例：

```text
Demo | HLTV | Playbook
```

### 8.3 Composer card

- 最大宽度：`900px ~ 1100px`。
- 高度：`150px ~ 220px`。
- 圆角：`24px ~ 28px`。
- 边框：暖灰 `1px`。
- 阴影：大而淡。
- 主要输入区域占上半部分。
- 底部工具栏放上下文和提交按钮。

### 8.4 Quick action pills

- 白底 / 半透明白底。
- 1px 暖灰边框。
- 图标在左，文字在右。
- hover：边框加深、微微上浮或背景变白。

### 8.5 Active task list

- 列表宽度与 composer 对齐。
- 标题行：左 `Active tasks`，右 `Clear all`。
- item：图标圆点 + 标题 + 时间。
- 分隔线很淡。
- 不使用重卡片。

### 8.6 Inline permission panel

- 用于危险操作确认。
- 包含：动作标题、影响对象路径 / 条目、diff 或摘要、确认 / 取消。
- 不弹出全屏 modal。
- 适合清除缓存、删除 demo、覆盖 Playbook 条目。

## 9. 与 cs2lens 参考的组合方式

两套参考不要混在同一个页面里硬拼。建议分工：

| 场景 | 主参考 | 原因 |
| --- | --- | --- |
| 首页 / 空状态 | Claude Desktop | 大输入入口、大留白、动作优先 |
| Demo Import | Claude Desktop + cs2lens upload | 中心 composer + dashed dropzone |
| HLTV / Library 列表 | cs2lens | 高密度比赛列表更合适 |
| Replay | cs2lens | 地图 / HUD / 时间轴是核心 |
| Playbook 首页 | Claude Desktop | 战术资产入口需要低压力探索 |
| Playbook 投掷物列表 | cs2lens | 筛选和高密度行更合适 |
| 删除 / 清空确认 | Claude Desktop Code | inline permission panel 清楚且不打断 |

## 10. CS2DemoPlayer 可落地方向

### 10.1 首页改造

当前如果继续走现代工作台方向，可把首页做成：

```text
今晚看哪场 demo？
┌──────────────────────────────────────┐
│ 拖入 .dem、粘贴 HLTV 链接，或输入关键词 │
│ + 导入文件        模式: Demo    开始 → │
└──────────────────────────────────────┘
[导入 Demo] [搜索 HLTV] [继续回放] [打开 Playbook]
```

重点：入口统一，用户不需要先理解页面结构。

### 10.2 Import Demo

- 使用 Claude 大 composer 的圆角和阴影。
- 内部保留 cs2lens 的 dashed dropzone。
- 解析状态变成底部 active task，而不是页面大段日志。

### 10.3 Playbook 首页

- 使用 Cowork 的淡网格背景。
- 主 composer：`记录一个战术 / 搜索投掷物 / 从当前 demo 导入`。
- 下方 Active tasks：最近编辑的战术、最近导入的投掷物。

### 10.4 危险操作确认

- 删除 demo：显示 demo 名、路径、关联缓存数量。
- 清空 HLTV cache：显示将清空的 matches / teams / players 数量。
- 覆盖 Playbook 条目：显示旧标题 / 新标题 / tags 变化。

## 11. 不建议照搬的部分

- 不要把整个 CS2DemoPlayer 都改成浅色；Replay 深色更适合长期看地图。
- 不要复制 Claude 的聊天产品结构；CS2DemoPlayer 核心仍是 demo / map / timeline。
- 不要把所有入口都变成自然语言输入；文件、HLTV、Playbook 仍需要明确按钮。
- 不要过度使用大留白到牺牲比赛列表效率。
- 不要照搬 Claude 品牌橙；可取“暖色主操作”的方法，但颜色应与 CS2DemoPlayer 自己统一。

## 12. 首轮可执行清单

如果要把 Claude Desktop macOS 风格迁移到项目，建议先做这些低风险改动：

1. 为首页建立 `workspace-light` 视觉实验区，不影响 Replay。
2. 顶部导航试用居中 segmented control：`Demo / HLTV / Playbook`。
3. 首页加入大 composer：导入 demo / 粘贴 HLTV / 搜索 Playbook 三合一。
4. 把快捷动作改成 pill buttons。
5. Playbook 首页使用淡网格背景和 Active tasks 列表。
6. 删除 / 清空类危险操作改成 inline confirmation panel。
7. 保持列表和 Replay 页继续沿用 cs2lens 暗色高密度参考。

## 13. 验收标准

- 首页第一眼是“我下一步可以做什么”，不是“这里有哪些模块”。
- macOS app 感明显：toolbar、segmented control、traffic-light 空间、圆角窗口。
- 主输入入口足够大，用户可以导入、粘贴或搜索。
- 快捷入口清楚但不抢主视觉。
- 危险操作确认信息明确，不再依赖突兀 alert。
- Replay 页不被浅色风格破坏，仍保持暗色专业分析界面。

## 14. 参考色速查

```text
window.bg        #f8f6f1
toolbar.bg       #f2f0ea
segment.bg       #ece9e2
card.bg          #ffffff
border           #ddd8cf
text.main        #353331
text.muted       #77736c
accent.orange    #d97852
accent.peach     #e8ad9b
accent.blue      #2d8cff
blue.soft        #dff0ff
```
