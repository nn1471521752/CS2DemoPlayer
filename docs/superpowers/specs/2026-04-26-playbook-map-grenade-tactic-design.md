# Playbook 地图库、投掷物库与战术库设计（2026-04-26）

## 背景

CS2DemoPlayer 当前已经具备 Demo 解析、2D 雷达回放、回合帧缓存、投掷物轨迹渲染、HLTV 比赛缓存与本地游戏库标记等基础能力。下一阶段需要把这些“观看与分析”能力沉淀为可复用知识：地图、投掷物、战术和架构组合。

本设计用于定义 Playbook 第一版边界。第一版重点不是做复杂编辑器，而是建立稳定数据模型、只读地图库、可选择的 Demo 投掷物导入链路，以及项目到 Obsidian Playbook 文件夹的 Markdown 单向同步。

---

## 目标

1. 建立独立顶层 `Playbook` 页面。
2. 建立只读地图库，前端可浏览现有地图与 2D 雷达图。
3. 建立投掷物库，支持从 Demo 当前回合中选择特定投掷物后导入。
4. 建立战术库，用于保存完整战术条目。
5. 建立架构 / 组合库，用于保存选位、点位、默认站位、retake 组合等结构化内容。
6. 建立项目内 Playbook 数据到 `E:\obsidian\20-Playbook\` 的 Markdown 单向同步。

---

## 非目标

第一版明确不做：

- 不自动把 Demo 里所有投掷物全部导入。
- 不支持前端上传、替换、编辑或删除地图雷达图。
- 不支持编辑 `map-meta.js` 中的地图坐标参数。
- 不做 Obsidian -> 项目数据库的反向同步。
- 不做复杂战术画板、拖拽式路线编辑器或图像标注编辑器。
- 不把 Playbook 功能塞进 HLTV 页；HLTV 和本地游戏库只作为上游来源。

---

## 信息架构

Playbook 第一版作为独立顶层页，建议左侧导航新增：

- `Playbook`

Playbook 页面内部使用四个 tab：

1. `地图`
2. `投掷物`
3. `战术`
4. `架构`

Demo 回放页只增加轻量导入入口：

- 当前回合投掷物候选列表
- 用户勾选或点击单个候选
- `导入到 Playbook`

完整浏览、编辑、同步状态统一回到 Playbook 页面处理。

---

## 一、地图库

### 定位

地图是 Playbook 的基础资源。投掷物、战术、架构组合都应通过稳定 `mapId` 关联到地图库。

### 数据来源

第一版地图库从现有静态资源建立：

- `src/renderer/js/map-meta.js`
- `src/renderer/assets/maps/<mapId>.png`

当前项目已有 `CS2_MAP_META`，包含：

- `pos_x`
- `pos_y`
- `scale`
- `threshold_z`

雷达图当前由 renderer 通过 `assets/maps/${mapName}.png` 加载。

### 第一版行为

`地图` tab 展示：

- 地图 ID：如 `de_mirage`
- 显示名：如 `Mirage`
- 2D 雷达图预览
- 坐标参数：`pos_x / pos_y / scale / threshold_z`
- radar 图片是否存在
- 后续可展示关联数量：投掷物数、战术数、架构数

### 数据模型建议

第一版可以先用 DB 表承接地图库只读索引，也可以由 service 从 `map-meta.js` 和 assets 动态构建。为了后续 Playbook 统一关联，建议落 DB 表：

#### `playbook_maps`

| 字段 | 类型 | 说明 |
|---|---|---|
| `map_id` | TEXT PRIMARY KEY | `de_mirage` |
| `display_name` | TEXT | `Mirage` |
| `radar_image_path` | TEXT | 相对或绝对 radar 图片路径 |
| `pos_x` | REAL | 雷达坐标参数 |
| `pos_y` | REAL | 雷达坐标参数 |
| `scale` | REAL | 雷达坐标参数 |
| `threshold_z` | REAL | 分层阈值 |
| `source` | TEXT | `map-meta` |
| `is_active` | INTEGER | 是否启用展示 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

第一版提供 `syncPlaybookMapsFromStaticMeta()`，从静态 meta upsert 到 DB。前端只读展示 DB 结果。

---

## 二、投掷物库

### 定位

投掷物库保存“用户认为值得保留”的投掷物，而不是 Demo 中所有投掷物。

### 导入原则

导入流程必须是：

```text
Demo 当前回合投掷物候选
  -> 用户选择一个或多个候选
  -> 导入到 Playbook
  -> 写入 playbook_grenades
```

不做“全部一键导入”。

### Demo 候选来源

现有 round response / cached round frames 中已有：

- `frames[].grenades`
- `frames[].grenade_events`

可按 `entity_id` 聚合轨迹与事件，生成候选：

- `entityId`
- `grenadeType`
- `throwerName`
- `throwerSteamid`
- `throwerTeamNum`
- `startTick`
- `endTick`
- `detonateTick`
- `startPosition`
- `endPosition`
- `trajectory`
- `sourceDemoChecksum`
- `sourceRoundNumber`
- `mapId`

第一版可先只从已加载回合的前端 frames 生成候选；若后续需要跨回合批量浏览，再由主进程从 `round_frames` 表提取。

### 数据模型建议

#### `playbook_grenades`

| 字段 | 类型 | 说明 |
|---|---|---|
| `grenade_id` | TEXT PRIMARY KEY | 稳定 ID |
| `title` | TEXT | 用户可读标题 |
| `map_id` | TEXT | 关联 `playbook_maps.map_id` |
| `grenade_type` | TEXT | smoke / flash / molotov / he |
| `side` | TEXT | T / CT / unknown |
| `thrower_name` | TEXT | 来源投掷者 |
| `thrower_steamid` | TEXT | 来源投掷者 steamid |
| `team_name` | TEXT | 来源队伍 |
| `source_demo_checksum` | TEXT | 来源 demo |
| `source_match_id` | TEXT | 可选，HLTV match id |
| `source_round_number` | INTEGER | 来源回合 |
| `throw_tick` | INTEGER | 投掷 tick |
| `detonate_tick` | INTEGER | 爆开 / 落点 tick |
| `start_x` / `start_y` / `start_z` | REAL | 起点 |
| `end_x` / `end_y` / `end_z` | REAL | 终点 |
| `trajectory_json` | TEXT | 精简轨迹点数组 |
| `tags_json` | TEXT | 标签 |
| `notes` | TEXT | 说明 |
| `obsidian_path` | TEXT | 同步后的 md 路径 |
| `obsidian_synced_at` | TEXT | 最近同步时间 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### 候选去重

导入时应计算 `source_key`，避免同一 Demo / 回合 / entity 重复导入。

建议：

```text
source_key = source_demo_checksum + ":" + source_round_number + ":" + entity_id
```

DB 可增加唯一索引：

```sql
UNIQUE(source_demo_checksum, source_round_number, source_entity_id)
```

如果同一候选再次导入，第一版返回“已存在”，不覆盖用户标题和备注。

---

## 三、战术库

### 定位

战术库保存一套完整战术，例如：

- Mirage A execute
- Inferno Banana control
- Nuke outside default
- Ancient B retake

战术可以关联多个投掷物、点位、队伍、选手和比赛。

### 数据模型建议

#### `playbook_tactics`

| 字段 | 类型 | 说明 |
|---|---|---|
| `tactic_id` | TEXT PRIMARY KEY | 稳定 ID |
| `title` | TEXT | 战术名称 |
| `map_id` | TEXT | 关联地图 |
| `side` | TEXT | T / CT |
| `category` | TEXT | execute / default / retake / fake / anti-eco 等 |
| `summary` | TEXT | 摘要 |
| `steps_json` | TEXT | 执行步骤数组 |
| `linked_grenade_ids_json` | TEXT | 关联投掷物 |
| `linked_setup_ids_json` | TEXT | 关联架构 |
| `linked_team_ids_json` | TEXT | 关联队伍 |
| `linked_player_ids_json` | TEXT | 关联选手 |
| `source_match_ids_json` | TEXT | 来源比赛 |
| `tags_json` | TEXT | 标签 |
| `obsidian_path` | TEXT | 同步路径 |
| `obsidian_synced_at` | TEXT | 最近同步 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

第一版战术创建可以是表单式输入，不做画板。

---

## 四、架构 / 组合库

### 定位

架构库保存“选位、点位和组合结构”，介于单个投掷物与完整战术之间。

示例：

- Mirage CT A retake setup
- Dust2 Long default hold
- Ancient Mid control positions
- Inferno B site crossfire

### 数据模型建议

#### `playbook_setups`

| 字段 | 类型 | 说明 |
|---|---|---|
| `setup_id` | TEXT PRIMARY KEY | 稳定 ID |
| `title` | TEXT | 架构名称 |
| `map_id` | TEXT | 关联地图 |
| `side` | TEXT | T / CT |
| `area` | TEXT | A / B / Mid / Banana 等 |
| `category` | TEXT | default / hold / retake / exec-support / crossfire |
| `positions_json` | TEXT | 选位数组 |
| `linked_grenade_ids_json` | TEXT | 关联投掷物 |
| `notes` | TEXT | 说明 |
| `tags_json` | TEXT | 标签 |
| `obsidian_path` | TEXT | 同步路径 |
| `obsidian_synced_at` | TEXT | 最近同步 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### 点位数据

第一版可以先把点位放进 `positions_json`，不单独建复杂点位编辑器。后续如果地图库需要正式维护 callout，再拆：

#### `playbook_map_positions`

| 字段 | 类型 | 说明 |
|---|---|---|
| `position_id` | TEXT PRIMARY KEY | 稳定 ID |
| `map_id` | TEXT | 关联地图 |
| `name` | TEXT | 点位名 |
| `type` | TEXT | site / lane / choke / lineup / plant 等 |
| `x` / `y` / `z` | REAL | 坐标 |
| `notes` | TEXT | 说明 |

第一版不强制实现该表。

---

## 五、Obsidian Markdown 单向同步

### 原则

- 项目内 SQLite 是 source of truth。
- Obsidian 是可阅读、可继续人工整理的 Markdown 输出。
- 第一版只做项目 -> Obsidian，不做反向读取、不做冲突合并。

### 目标目录

根据仓库规则，Playbook 同步目标为：

```text
E:\obsidian\20-Playbook\
```

建议生成结构：

```text
E:\obsidian\20-Playbook\
  CS2\
    Maps\
      de_mirage.md
    Grenades\
      de_mirage\
        smoke-window-from-t-spawn.md
    Tactics\
      de_mirage\
        t-a-execute.md
    Setups\
      de_mirage\
        ct-a-retake.md
```

### Markdown frontmatter

每个同步文件必须带稳定 frontmatter：

```yaml
---
type: playbook-grenade
playbook_id: grenade_xxx
map_id: de_mirage
grenade_type: smoke
source_demo_checksum: ...
source_round_number: 12
source_match_id: ...
synced_at: "2026-04-26T..."
---
```

### 覆盖策略

第一版采用确定性路径覆盖：

- 同一个 `playbook_id` 每次同步到同一个文件。
- 文件存在则重写。
- 不读取 Obsidian 中的手改内容。

为降低误伤，建议在 Markdown 中明确写：

```markdown
> 该文件由 CS2DemoPlayer 单向生成。请优先在应用内编辑结构化字段。
```

---

## 六、前端页面设计

### Playbook 顶层页

新增顶层页：

- `Playbook`

页面结构：

- Summary cards：
  - 地图数
  - 投掷物数
  - 战术数
  - 架构数
  - 最近同步
- Tabs：
  - 地图
  - 投掷物
  - 战术
  - 架构

### 地图 tab

只读列表 / 网格：

- radar 缩略图
- map id
- display name
- 坐标参数
- radar 状态

### 投掷物 tab

列表：

- 标题
- 地图
- 投掷物类型
- 阵营
- 起点 / 终点摘要
- 来源 Demo / Round
- 同步状态

### 战术 tab

列表：

- 战术名称
- 地图
- 阵营
- 类型
- 关联投掷物数量
- 同步状态

### 架构 tab

列表：

- 架构名称
- 地图
- 区域
- 阵营
- 关联投掷物数量
- 同步状态

---

## 七、Demo 回放页导入入口

Demo 回放页新增轻量入口：

- 当前回合投掷物按钮或 panel
- 列出候选投掷物
- 每条候选可预览：
  - 类型
  - 投掷者
  - 起点 / 落点
  - tick
- 用户选择候选后点击 `导入到 Playbook`

导入成功后：

- 写入 `playbook_grenades`
- 返回新建条目 ID
- 可提示“已导入 Playbook”

第一版不要求在回放页直接编辑标题和备注；可用默认标题，后续在 Playbook 页编辑。

---

## 八、主进程 / IPC 边界

建议新增主进程模块：

- `src/main/playbook-service.js`
- `src/main/playbook-markdown-sync.js`
- `src/main/db/playbook.js`

建议新增 IPC：

- `playbook-get-state`
- `playbook-list-maps`
- `playbook-list-grenades`
- `playbook-list-tactics`
- `playbook-list-setups`
- `playbook-import-grenades-from-round`
- `playbook-create-tactic`
- `playbook-create-setup`
- `playbook-sync-to-obsidian`

Demo 回放页如果第一版直接从前端 loaded frames 生成候选，则还需要：

- `playbook-import-selected-grenades`

该 IPC 接收已选候选数组，而不是要求主进程重新解析当前 round。

---

## 九、实现顺序建议

### Phase 1：地图库与 Playbook 页面骨架

1. DB 新增 `playbook_maps`。
2. 从 `CS2_MAP_META` 同步地图索引。
3. 新增 Playbook 顶层页。
4. `地图` tab 只读展示地图与 radar。

### Phase 2：投掷物候选与选择性导入

1. 从当前回合 frames 聚合 grenade candidates。
2. Demo 回放页展示候选列表。
3. 用户选择候选后导入。
4. DB 新增 `playbook_grenades`。
5. Playbook `投掷物` tab 展示已导入条目。

### Phase 3：战术库与架构库

1. DB 新增 `playbook_tactics`、`playbook_setups`。
2. Playbook 页支持创建 / 列表展示。
3. 支持关联已有投掷物。

### Phase 4：Obsidian 单向同步

1. 实现 Markdown 渲染 helper。
2. 实现路径生成和 UTF-8 写入。
3. 支持单条同步和全量同步。
4. 写回 `obsidian_path` / `obsidian_synced_at`。

---

## 十、测试策略

优先增加纯逻辑测试：

- `tests/test_playbook_map_utils.js`
  - 从 `CS2_MAP_META` 生成地图条目
  - radar 路径规范化
- `tests/test_playbook_grenade_candidates.js`
  - 从 frames 聚合 grenade candidate
  - 只导入用户选择的 candidate
  - 重复 candidate 不重复写入
- `tests/test_playbook_db.js`
  - migrations 创建 Playbook 表
  - map / grenade / tactic / setup CRUD
- `tests/test_playbook_markdown_sync.js`
  - Markdown frontmatter
  - 路径生成
  - UTF-8 内容
- `tests/test_playbook_page_utils.js`
  - 前端 view model
  - tab 文案
  - summary cards

最终仍需：

- 全量 `tests/test_*.js`
- 重点 `node --check`
- Electron smoke

---

## 十一、风险与约束

1. 当前 `src/main/ipc.js`、`src/main/db/index.js`、`src/renderer/js/ui/core.js` 已较大；Playbook 新逻辑应尽量拆到独立模块。
2. 当前投掷物数据主要存在 round frames 中，若旧缓存没有 grenade events，候选提取需要提示“该回合缺少投掷物事件数据”。
3. 地图库第一版只读，不解决 radar 缺图或坐标错误的编辑问题。
4. Obsidian 同步是覆盖式单向写入，用户如果直接编辑生成文件，下一次同步可能被覆盖。
5. 当前分支继承了 HLTV cache 工作区的混合 dirty 状态，实施前应确认是否继续在该分支累积，或先整理提交边界。

---

## 结论

Playbook 第一版应以“地图作为基础资源、投掷物选择性导入、战术与架构结构化保存、Obsidian 单向同步”为核心。这样既能承接当前 Demo 回放与投掷物轨迹能力，又不会过早进入复杂战术画板或双向知识库同步。

