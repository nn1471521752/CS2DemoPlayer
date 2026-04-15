# HLTV 本地缓存资料库设计

- 日期：2026-04-15
- 项目：CS2DemoPlayer
- 状态：设计已确认，待写 implementation plan

## 1. 背景

当前项目已经具备 `HLTV` 页 recent matches 拉取、demo 下载、`待分析队列`、`灵感卡片` 和 `Entities` 审核页。但这些能力仍然偏“在线入口 + 少量持久化”：

- `HLTV` 页每次筛选主要依赖当前拉取结果，历史比赛、战队、选手不能稳定沉淀。
- 用 HLTV 网页搜索时还要重新请求和加载页面，使用成本高。
- 已有 `teams / players` 主要来自本地 demo 解析和人工审核，不等同于 HLTV 资料缓存。
- 已有 `hltv_analysis_queue / hltv_inspiration_cards` 只保存被选中的比赛，不是完整资料库。

本轮目标是把 HLTV 信息拉成本地缓存库，让搜索和筛选优先在本地完成；需要时再手动用 HLTV 托底补新数据。

## 2. 已确认决策

- 要缓存三类核心对象：`比赛 / 战队 / 选手`。
- 新增一个“本地资料库”页，里面分 `比赛 / 战队 / 选手` 三个 tab。
- 不做统一全局搜索框；不同页面和 tab 有自己的筛选逻辑。
- 搜索逻辑采用“两路口”：
  - `本地资料库`：先搜本地缓存。
  - `HLTV` 页：作为手动在线入口，用于刷新/搜索 HLTV 并把本地没有的数据缓存下来。
- HLTV 托底采用手动触发，不做后台无感全站同步。
- 数据表按“完整表”设计，不只做临时 key-value cache。
- 比赛采用 `match -> map` 的层级结构；map 是重要搜索维度，必须挂在 match 下方并可用于筛选。
- 起步采用“方案 A”：先缓存 HLTV 最近/搜索得到的比赛列表与 map 结构，再逐步补齐详情。

## 3. 目标

### 3.1 产品目标

- 让用户可以在本地快速检索比赛、战队、选手，而不是每次都打开 HLTV 网页重新请求。
- 让 HLTV 页成为“手动补数据入口”，本地资料库成为“日常搜索入口”。
- 让比赛、战队、选手三类资料可以长期沉淀，并服务后续 demo 下载、分析队列、灵感卡片和实体筛选。
- 让 map 成为比赛搜索的一等维度，例如按 `de_ancient / Ancient` 找比赛，而不是只按队伍或赛事找。

### 3.2 工程目标

- 在现有 SQLite 数据库中增加 HLTV 本地缓存专用表。
- 将 HLTV recent/search 返回的比赛数据规范化后 upsert 到本地缓存。
- 增加本地资料库 IPC 与 renderer 页面。
- 保留现有 `HLTV discovery workspace`，但把它的在线结果同步写入本地缓存。
- 避免一次性做重型全量爬取；每次只同步用户主动拉到的数据。

## 4. 非目标

- 不做 HLTV 全站镜像。
- 不做自动后台无限爬取。
- 不把本地资料库和 HLTV 在线页合并成一个大搜索框。
- 不在第一版承诺拿全所有比赛详情、所有队员历史、所有战队页面字段。
- 不先重构现有 `Entities` 页；`Entities` 仍负责 demo 解析出来的实体审核，本轮新增的是 HLTV 资料缓存。
- 不先做复杂评分模型；推荐信号可以继续沿用当前 discovery 规则。

## 5. 信息架构

### 5.1 页面分工

#### 本地资料库页

定位：日常搜索和筛选入口。

包含三个 tab：

1. `比赛`
   - 搜索队伍、赛事、match id。
   - 按 map 筛选。
   - 按是否有 demo、是否已下载、是否进入队列、是否有灵感卡片筛选。
   - 展示 match 基础信息，并在 match 下方展开 maps。
2. `战队`
   - 搜索战队名。
   - 展示 HLTV team id/url、本地 logo、最近缓存时间、相关比赛数。
   - 后续可进入该队相关比赛筛选。
3. `选手`
   - 搜索选手名、昵称、HLTV player id。
   - 展示当前/最近战队、相关比赛数、最近缓存时间。
   - 后续可进入该选手相关比赛筛选。

#### HLTV 页

定位：手动在线补数据入口。

- 打开 HLTV 页时可以先拉一版最新 recent matches。
- 用户点击刷新或搜索时，请求 HLTV。
- 返回结果先展示在 HLTV 页，同时对比本地缓存：
  - 本地没有的 match/team/player/map：写入缓存。
  - 本地已有的：更新 `last_seen / cache_updated_at` 和可补字段。
- HLTV 页保留现有 `Recommended / Browse / Queue / Cards` 工作区，用于在线发现和下游分析 handoff。

### 5.2 搜索分工

本轮明确不做统一搜索框，而是两类搜索：

- `本地资料库搜索`
  - 不发 HLTV 请求。
  - 只查 SQLite 本地缓存。
  - 反馈要快，适合反复筛。
- `HLTV 在线搜索/刷新`
  - 手动触发。
  - 发请求到 HLTV。
  - 结果会缓存到本地，并可作为本地资料库后续搜索的数据来源。

## 6. 数据模型

第一版建议新增 HLTV 专用缓存表，避免混用现有 demo 实体审核表。

### 6.1 `hltv_matches`

保存比赛级信息。

建议字段：

- `match_id TEXT PRIMARY KEY`
- `match_url TEXT NOT NULL DEFAULT ''`
- `team1_id TEXT NOT NULL DEFAULT ''`
- `team1_name TEXT NOT NULL DEFAULT ''`
- `team2_id TEXT NOT NULL DEFAULT ''`
- `team2_name TEXT NOT NULL DEFAULT ''`
- `team1_score INTEGER`
- `team2_score INTEGER`
- `event_id TEXT NOT NULL DEFAULT ''`
- `event_name TEXT NOT NULL DEFAULT ''`
- `match_format TEXT NOT NULL DEFAULT ''`
- `match_time_label TEXT NOT NULL DEFAULT ''`
- `match_timestamp_ms INTEGER`
- `has_demo INTEGER NOT NULL DEFAULT 0`
- `downloaded_demo_path TEXT NOT NULL DEFAULT ''`
- `downloaded_file_size INTEGER NOT NULL DEFAULT 0`
- `playable_demo_paths_json TEXT NOT NULL DEFAULT '[]'`
- `source TEXT NOT NULL DEFAULT 'hltv'`
- `first_seen_at TEXT NOT NULL DEFAULT ''`
- `last_seen_at TEXT NOT NULL DEFAULT ''`
- `cache_updated_at TEXT NOT NULL DEFAULT ''`

索引：

- `idx_hltv_matches_event_name`
- `idx_hltv_matches_team1_name`
- `idx_hltv_matches_team2_name`
- `idx_hltv_matches_has_demo`
- `idx_hltv_matches_cache_updated_at`

### 6.2 `hltv_match_maps`

保存 match 下的 map 信息。map 是重要搜索维度，因此不只塞进 JSON。

建议字段：

- `match_id TEXT NOT NULL`
- `map_index INTEGER NOT NULL DEFAULT 0`
- `map_name TEXT NOT NULL DEFAULT ''`
- `map_slug TEXT NOT NULL DEFAULT ''`
- `team1_score INTEGER`
- `team2_score INTEGER`
- `demo_url TEXT NOT NULL DEFAULT ''`
- `demo_file_name TEXT NOT NULL DEFAULT ''`
- `local_demo_path TEXT NOT NULL DEFAULT ''`
- `parsed_demo_checksum TEXT NOT NULL DEFAULT ''`
- `cache_updated_at TEXT NOT NULL DEFAULT ''`
- `PRIMARY KEY (match_id, map_index)`

索引：

- `idx_hltv_match_maps_map_slug`
- `idx_hltv_match_maps_match_id`
- `idx_hltv_match_maps_local_demo_path`

说明：

- recent results 第一版可能只能拿到 `bo1/bo3`，还拿不到每张 map 名称。
- 如果 map 名称未知，可以先写空 map 列表或占位 `map_index`，后续在下载 archive 或打开 match detail 时补齐。
- 一旦拿到 `.dem` 文件名，应尽量从文件名推断 map 并回写 `map_slug`。

### 6.3 `hltv_teams`

保存 HLTV 战队资料缓存。

建议字段：

- `team_id TEXT PRIMARY KEY`
- `team_url TEXT NOT NULL DEFAULT ''`
- `display_name TEXT NOT NULL DEFAULT ''`
- `normalized_name TEXT NOT NULL DEFAULT ''`
- `logo_url TEXT NOT NULL DEFAULT ''`
- `logo_path TEXT NOT NULL DEFAULT ''`
- `country TEXT NOT NULL DEFAULT ''`
- `ranking INTEGER`
- `related_match_count INTEGER NOT NULL DEFAULT 0`
- `first_seen_at TEXT NOT NULL DEFAULT ''`
- `last_seen_at TEXT NOT NULL DEFAULT ''`
- `cache_updated_at TEXT NOT NULL DEFAULT ''`

索引：

- `idx_hltv_teams_normalized_name`
- `idx_hltv_teams_cache_updated_at`

### 6.4 `hltv_players`

保存 HLTV 选手资料缓存。

建议字段：

- `player_id TEXT PRIMARY KEY`
- `player_url TEXT NOT NULL DEFAULT ''`
- `nickname TEXT NOT NULL DEFAULT ''`
- `real_name TEXT NOT NULL DEFAULT ''`
- `normalized_nickname TEXT NOT NULL DEFAULT ''`
- `team_id TEXT NOT NULL DEFAULT ''`
- `team_name TEXT NOT NULL DEFAULT ''`
- `country TEXT NOT NULL DEFAULT ''`
- `related_match_count INTEGER NOT NULL DEFAULT 0`
- `first_seen_at TEXT NOT NULL DEFAULT ''`
- `last_seen_at TEXT NOT NULL DEFAULT ''`
- `cache_updated_at TEXT NOT NULL DEFAULT ''`

索引：

- `idx_hltv_players_normalized_nickname`
- `idx_hltv_players_team_id`
- `idx_hltv_players_cache_updated_at`

### 6.5 可选关系表

第一版可按数据可得性择机增加：

- `hltv_match_team_links(match_id, team_id, side_label)`
- `hltv_match_player_links(match_id, player_id, team_id)`

如果第一版 recent/search 结果拿不到 player 信息，可以先不落 `match_player_links`，等 match detail 解析时再补。

## 7. 数据流

### 7.1 打开 HLTV 页

1. renderer 进入 `HLTV` section。
2. 主进程读取 runtime recent state。
3. 如果状态为空或用户手动刷新，则请求 HLTV recent matches。
4. 请求成功后：
   - 继续构建现有 discovery state。
   - 同步 upsert 到 `hltv_matches`。
   - 从 match 里的队名/队伍 URL（如果有）upsert 到 `hltv_teams`。
   - 如果能提取 map，则 upsert 到 `hltv_match_maps`。
5. UI 显示哪些结果是 `已缓存 / 新缓存 / 已在队列 / 已有卡片`。

### 7.2 HLTV 在线搜索

1. 用户在 HLTV 页输入在线搜索条件并点击搜索。
2. 主进程请求 HLTV 搜索或对应列表页。
3. 解析返回的 match/team/player 结果。
4. 将本地没有的数据写入缓存；已有数据做字段补齐。
5. 返回在线结果，同时给出缓存统计：
   - 新增 matches 数。
   - 更新 matches 数。
   - 新增 teams 数。
   - 新增 players 数。
   - 新增/更新 maps 数。

### 7.3 本地资料库搜索

1. 用户进入 `本地资料库`。
2. 选择 `比赛 / 战队 / 选手` tab。
3. 输入筛选条件。
4. renderer 调用本地 IPC。
5. 主进程只查询 SQLite，不访问 HLTV。
6. 返回分页/限制后的本地结果。

### 7.4 下载 demo 后回写

当 HLTV 下载 demo 或提取 map demo 成功后：

- 回写 `hltv_matches.downloaded_demo_path / playable_demo_paths_json`。
- 回写对应 `hltv_match_maps.local_demo_path`。
- 如果用户进一步 `analyze-demo-from-path` 成功，再把 demo checksum 回写到 `hltv_match_maps.parsed_demo_checksum`。

## 8. 服务与 IPC 设计

### 8.1 主进程模块

建议新增或扩展：

- `src/main/db/hltv-cache.js`
  - HLTV 缓存表的 upsert/search/list helper。
- `src/main/hltv-cache-service.js`
  - 负责把 online HLTV payload 规范化并写入缓存。
- `src/main/hltv-local-library-service.js`
  - 负责本地资料库查询聚合。

### 8.2 IPC

建议新增：

- `hltv-cache-upsert-recent-matches`
  - 可内部使用，不一定暴露给 renderer。
- `hltv-library-get-state`
  - 获取本地资料库摘要。
- `hltv-library-search-matches`
  - 本地比赛搜索。
- `hltv-library-search-teams`
  - 本地战队搜索。
- `hltv-library-search-players`
  - 本地选手搜索。
- `hltv-online-search`
  - 手动 HLTV 在线搜索并缓存结果。

现有 IPC 可扩展：

- `hltv-refresh-discovery-state`
  - 成功刷新后同步写入缓存，并返回缓存统计。
- `hltv-download-demo`
  - 下载成功后回写 match/map 的本地 demo 字段。
- `analyze-demo-from-path`
  - 分析成功后尽量回写 `parsed_demo_checksum`。

## 9. UI 设计

### 9.1 左侧导航

新增一个顶层页面：

- `本地资料库`

建议导航顺序：

1. `Demo 库`
2. `本地资料库`
3. `Entities`
4. `HLTV`

### 9.2 本地资料库页

页面结构：

- 顶部摘要：
  - 本地比赛数
  - 本地战队数
  - 本地选手数
  - 最近缓存时间
- tab：
  - `比赛`
  - `战队`
  - `选手`
- 各 tab 独立筛选栏。

比赛 tab：

- 搜索框：队伍 / 赛事 / match id。
- map 筛选：可输入或下拉选择 map。
- toggles：
  - 有 demo
  - 已下载
  - 已解析
  - 已加入队列
  - 有灵感卡片
- 结果行：
  - 队伍 vs 队伍
  - 比分 / BO / 赛事
  - demo 状态
  - cache time
  - 下方 maps 列表
  - actions：打开 HLTV、加入队列、写卡片、下载/打开 demo

战队 tab：

- 搜索框：战队名。
- 结果行：
  - logo / 名称
  - HLTV URL
  - 相关比赛数
  - 最近缓存时间
  - action：查看相关比赛

选手 tab：

- 搜索框：昵称 / 真名 / player id。
- 结果行：
  - nickname / real name
  - 当前或最近战队
  - 相关比赛数
  - 最近缓存时间
  - action：查看相关比赛

### 9.3 HLTV 页

HLTV 页保留现有 discovery workspace，但增加在线搜索和缓存反馈：

- `刷新最新`：拉 recent matches 并缓存。
- `在线搜索 HLTV`：手动发请求并缓存。
- 每次在线请求完成后展示短反馈：
  - `新增 12 场比赛，更新 8 场比赛，新增 3 支战队`
- match 行显示本地缓存状态：
  - `已缓存`
  - `新缓存`
  - `已下载`
  - `已解析`

## 10. 错误处理

- HLTV 请求失败：
  - HLTV 页显示错误。
  - 本地资料库仍可继续搜索旧缓存。
- 解析字段不完整：
  - 允许写入 match 基础字段。
  - 缺失 team id、player id、map name 时保留空字段，后续详情补齐。
- 数据重复：
  - 以 `match_id / team_id / player_id / (match_id,map_index)` 做 upsert。
  - 缺 id 的队伍/选手第一版不强行写入正式表，避免污染。
- map 未知：
  - 不阻塞 match 缓存。
  - 下载 demo 或解析 detail 后再补。
- SQLite 写入失败：
  - 在线结果仍可显示，但提示缓存失败。

## 11. 测试策略

### 11.1 纯逻辑测试

- HLTV cache payload normalization。
- match/map/team/player upsert 去重。
- 本地搜索 filters：
  - 按队伍
  - 按赛事
  - 按 map
  - 按 has demo / downloaded / parsed
- cache summary 统计。

### 11.2 DB 测试

新增：

- `tests/test_hltv_cache_db.js`
- `tests/test_hltv_cache_service.js`
- `tests/test_hltv_local_library_service.js`

覆盖：

- 表迁移。
- upsert 新数据。
- 已有数据更新。
- match 下挂多个 map。
- map 搜索能返回对应 match。
- 下载 demo 后能回写 match/map。

### 11.3 Renderer 测试

新增：

- `tests/test_hltv_local_library_page_utils.js`

覆盖：

- tab 状态归一化。
- filter normalization。
- match rows with maps 的渲染数据。
- 空态和错误态 copy。

### 11.4 启动级验证

- `node --check` 覆盖新增/修改 JS 文件。
- 运行新增 test 文件。
- `npm start` 启动级 smoke，确认 app shell 可打开。

## 12. 实现顺序建议

1. 新增 HLTV cache schema 与 DB helper。
2. 新增 cache service，把现有 recent matches 同步写入 `hltv_matches / hltv_teams / hltv_match_maps`。
3. 扩展 `hltv-refresh-discovery-state`，刷新后返回并展示缓存统计。
4. 新增 `本地资料库` 页面骨架与导航入口。
5. 实现 `比赛` tab 本地搜索，优先支持 match + map 维度。
6. 实现 `战队 / 选手` tab 本地搜索。
7. 将 demo 下载和 analyze 成功结果回写到 match/map。
8. 最后再补 HLTV 在线搜索入口；第一版可先用 recent refresh 作为数据来源。

## 13. 成功标准

- 打开或手动刷新 HLTV 后，本地 SQLite 会新增/更新 HLTV match cache。
- `本地资料库 -> 比赛` 能不访问 HLTV，直接搜索本地比赛。
- 比赛结果下能看到挂靠的 maps；按 map 筛选能命中对应 match。
- `本地资料库 -> 战队 / 选手` 有独立 tab 和独立筛选，不依赖统一搜索框。
- HLTV 在线入口和本地资料库入口分工清楚：
  - 本地资料库负责快搜旧缓存。
  - HLTV 页负责手动拉新和缓存托底。
- 现有 `Queue / Cards / download -> analyze` 链路不被破坏。
