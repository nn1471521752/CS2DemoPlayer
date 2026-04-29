# Playbook Markdown Canonical 设计规格（2026-04-29）

## 背景

用户已确认 Playbook 下一步先做两件事：

1. `E:\obsidian\20-Playbook` 中的 Markdown 是 Playbook 权威源，CS2DemoPlayer 的 SQLite 只作为前端展示、检索、过滤和渲染用的物化索引。
2. 从 Demo 回放页导入投掷物时，不再把条目只写 SQLite；应先生成或复用 Obsidian Playbook Markdown 草稿，再把 Markdown 重新索引进 SQLite。

第三步 UI 风格先作为后续约束：整体工作台参考 Claude Desktop；与 CS2 demo 强相关的列表、Replay、HUD、Playbook 投掷物筛选组件参考 cs2lens。

## 范围

本轮只做 Playbook Markdown canonical 的最小可用闭环：

- 扫描 `20-Playbook` 下的 Markdown，解析 frontmatter，索引投掷物条目到 SQLite。
- 生成 Demo 导入投掷物的 Markdown 草稿，目录优先使用 `Maps/<map_id>/Grenades/`，地图缺失时使用 `_Inbox/`。
- App 内编辑已索引的 Markdown 条目时，优先写回 Markdown，再更新 SQLite 索引。
- 保留现有只读地图库、投掷物列表、标题 / 备注 / tags 编辑和 IPC 形状。

本轮不做：

- 完整战术 / 架构 UI。
- HLTV 暂存库 / 永久库拆分。
- 附件 / 图片标注模型。
- 双向 Markdown 冲突解决 UI；只做基础 content hash 防静默覆盖。

## 数据边界

- Markdown：权威内容，包括 `playbook_id`、`title`、`map_id`、`side`、`grenade_type`、来源 demo / round / entity、tags、notes，以及从 Demo 导入时需要保留的轨迹 JSON 字段。
- SQLite：索引缓存，继续用于 renderer 快速读取。新增索引字段：`markdown_path`、`sync_mode`、`content_hash`、`indexed_at`。
- `sync_mode` 新条目默认使用 `obsidian-canonical`；历史 SQLite-only 条目继续可读，后续可迁移。

## 行为

### 读取 Playbook 页面

1. 同步静态地图元数据。
2. 扫描 Obsidian Playbook Markdown。
3. 将解析出的投掷物 upsert 到 SQLite。
4. 从 SQLite 读取 summary、maps、grenades 返回给 renderer。

### 从 Demo 导入投掷物

1. 归一化候选投掷物。
2. 为每个候选生成稳定 `playbook_id`。
3. 根据 `map_id` 写入 `20-Playbook/Maps/<map_id>/Grenades/<slug>.md`；地图缺失则写入 `_Inbox/<slug>.md`。
4. 如果目标文件已存在，不覆盖正文，只解析现有文件并标记 existing。
5. 将写入 / 复用的 Markdown 条目索引到 SQLite。

### 编辑投掷物

1. 如果条目来自 Markdown canonical，读取 `markdown_path`。
2. 若当前文件 hash 与 SQLite 中 `content_hash` 不一致，返回冲突错误，不静默覆盖人工修改。
3. 否则更新 frontmatter 中的 `title`、`tags`、`updated`，并同步正文 notes 区块。
4. 重新计算 hash 并更新 SQLite 索引。
5. 历史 SQLite-only 条目可保留旧 DB 编辑路径作为兼容 fallback。

## 验收标准

- 新增 Markdown utility / repository 单元测试覆盖 parse、draft 生成、scan、重复导入。
- Playbook service 测试证明 get state 会先扫描 Markdown，导入会先写 Markdown，再索引 SQLite。
- DB 测试证明 `playbook_grenades` 存在 Markdown 索引字段，且 `obsidian-canonical` reindex 会更新 SQLite，而普通重复导入不会覆盖旧 DB 条目。
- 现有 Playbook IPC / renderer 测试继续通过。