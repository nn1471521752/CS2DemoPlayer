# Playbook 投掷物选择性导入设计（2026-04-26）

## 背景

Playbook Phase 1 已经建立独立页面和只读地图库。下一步需要把 Demo 回放中看到的投掷物沉淀到 Playbook，但用户已明确：导入必须由用户选择想要保存的部分，不做“全部一键导入”。

本设计只覆盖 Phase 2：投掷物候选生成、选择性导入、投掷物库列表展示。战术、架构和 Obsidian Markdown 单向同步继续留在后续阶段。

## 目标

1. 从当前已加载回合的 `frames[].grenades` 与 `frames[].grenade_events` 聚合投掷物候选。
2. 在回放页提供轻量候选列表，让用户勾选一个或多个候选。
3. 用户点击“导入选中”后，只把选中的候选写入 `playbook_grenades`。
4. 对同一 demo / round / entity 的重复导入做去重，不覆盖既有条目的标题和备注。
5. Playbook 的 `投掷物` tab 展示已导入条目，并把 summary 的投掷物数量改成真实 DB 计数。

## 非目标

- 不跨多个 Demo 或多个回合做批量扫描。
- 不自动导入当前回合全部投掷物。
- 不在第一版提供投掷物标题、备注、tag 编辑器。
- 不做战术 / 架构关联。
- 不做 Obsidian Markdown 同步。
- 不改 Python parser 的投掷物输出格式。

## 数据流

```text
用户加载 Demo 回合
  -> renderer 拿到 response.frames
  -> buildPlaybookGrenadeCandidates(frames, context)
  -> 回放页展示候选 checkbox
  -> 用户勾选候选
  -> ipcRenderer.invoke('playbook-import-selected-grenades', { candidates })
  -> main playbook service 校验并写入 DB
  -> Playbook 页重新加载 state，投掷物 tab 展示已保存条目
```

候选生成优先在 renderer 做，因为当前回放页已经持有完整帧数据，第一版不需要主进程重新解析或跨回合扫描。主进程负责持久化、去重和返回导入结果。

## 候选聚合规则

候选以 `sourceEntityId` 为主键聚合。若缺少 entity id，则用 `tick:index` fallback，但正常 parser 输出应有 `entity_id`。

每个候选包含：

- `sourceDemoChecksum`
- `sourceRoundNumber`
- `sourceEntityId`
- `mapId`
- `grenadeType`
- `side`
- `throwerName`
- `throwerSteamid`
- `throwerTeamNum`
- `throwTick`
- `detonateTick`
- `startPosition`
- `endPosition`
- `trajectory`
- `title`

`trajectory` 只保存必要点位：第一版保留同一 entity 的逐 tick 坐标数组，后续如数据过大再抽样。

`side` 由 `throwerTeamNum` 推断：

- `2` -> `T`
- `3` -> `CT`
- 其他 -> `unknown`

`detonateTick` 优先从 `grenade_events` 中与 entity 匹配的事件取 tick；如果没有事件，则回退为轨迹最后一帧 tick。

## DB 模型

新增 `playbook_grenades`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `grenade_id` | TEXT PRIMARY KEY | 稳定 ID |
| `source_demo_checksum` | TEXT | 来源 demo checksum |
| `source_round_number` | INTEGER | 来源回合 |
| `source_entity_id` | TEXT | 来源投掷物 entity |
| `title` | TEXT | 默认标题 |
| `map_id` | TEXT | 关联地图库 |
| `grenade_type` | TEXT | 投掷物类型 |
| `side` | TEXT | T / CT / unknown |
| `thrower_name` | TEXT | 投掷者 |
| `thrower_steamid` | TEXT | 投掷者 SteamID |
| `thrower_team_num` | INTEGER | 投掷者 team num |
| `throw_tick` | INTEGER | 第一条轨迹 tick |
| `detonate_tick` | INTEGER | 爆开 / 终点 tick |
| `start_x` / `start_y` / `start_z` | REAL | 起点 |
| `end_x` / `end_y` / `end_z` | REAL | 终点 |
| `trajectory_json` | TEXT | 轨迹点数组 |
| `tags_json` | TEXT | 预留标签 |
| `notes` | TEXT | 预留备注 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

唯一索引：

```sql
UNIQUE(source_demo_checksum, source_round_number, source_entity_id)
```

重复导入时返回 `existingGrenades += 1`，不更新已有记录。

## UI 设计

回放页右侧 rounds 面板下方新增一个小型 `Playbook 投掷物` 区块：

- 未加载回合：提示“加载回合后可查看投掷物候选”
- 当前回合无投掷物：提示“当前回合没有可导入投掷物”
- 有候选：每条显示类型、阵营、投掷者、tick 范围，并带 checkbox
- 操作：`导入选中`

Playbook 顶层页：

- `投掷物` tab 从占位改为列表
- 每条显示标题、地图、类型、阵营、来源 demo / round、tick 范围

## 测试策略

新增和扩展测试：

- `tests/test_playbook_grenade_candidates.js`
  - 从 frames 聚合候选
  - 只按 entity 生成唯一候选
  - 生成 side、tick、起点、终点和默认 title
- `tests/test_playbook_db.js`
  - migration 创建 `playbook_grenades`
  - 导入候选并去重
  - summary 返回真实 grenade count
- `tests/test_playbook_service.js`
  - `getPlaybookState()` 返回 grenades
  - `importSelectedGrenades()` 只转发候选数组
- `tests/test_playbook_ipc_contract.js`
  - 注册 `playbook-import-selected-grenades`
- `tests/test_playbook_page_utils.js`
  - 投掷物列表 view model
- `tests/test_hltv_page_copy_contract.js`
  - 回放页存在候选容器、状态和导入按钮

## 风险

- 旧缓存可能没有 `grenade_events`，此时仍可从 `grenades` 轨迹生成候选，但 detonate tick 只能回退到轨迹最后 tick。
- 当前 renderer 全局状态文件较大，本轮只新增小型 helper 与少量接线，不做大规模拆分。
- 如果用户没有先加载回合，候选为空，这是预期行为。

