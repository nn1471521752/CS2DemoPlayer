# HLTV 队标本地缓存设计

## 背景

`Entities` 第一版已经落地了待收录审核、正式战队库与正式选手库，但正式战队目前只有名称，没有视觉识别信息。用户要求“存下来的战队要有队标”，并明确指定队标来源只认 HLTV。

当前约束也很明确：

- demo 解析链路本身不稳定提供队标
- `Entities` 第一版的主数据源仍然是“已下载并成功解析的 demo”
- HLTV 已经有稳定的 `results -> match` Playwright 抓取链路
- 第一版不希望引入全站 team search，也不希望让 logo 抓取阻塞战队批准动作

因此，这轮只补“已批准战队的 HLTV 队标抓取与本地缓存”，不扩到 HUD、recent matches 行内 logo，或复杂实体去重。

## 目标

为 `Entities -> 战队` 中的已收录战队补齐 HLTV 队标本地缓存，并在 `Entities` 页面显示该队标。

## 非目标

- 不为未批准候选强制实时下载队标
- 不做 HLTV 全站 team search
- 不做战队实体去重 / 合并策略
- 不把队标接入回放 HUD
- 不修改 demo 解析链路或笔记系统

## 数据来源与匹配策略

### 唯一正式来源

队标来源只认 HLTV。

### 第一版匹配边界

只使用当前已有的 HLTV `recent matches` 缓存作为匹配入口：

1. 用户批准一个或多个战队进入正式库
2. 主进程从当前 HLTV recent matches 缓存里寻找包含该战队名的 match
3. 进入匹配到的 match 页面
4. 从 match 页面读取该战队的：
   - 队伍名称
   - 队伍页 URL
   - 队标 URL
5. 只有当战队名能和当前批准战队稳定匹配时，才下载队标

如果当前 recent matches 缓存里没有该战队，第一版就跳过，不猜测、不搜索。

## 存储设计

### 文件缓存

本地缓存目录固定为：

`data/team-logos/`

文件命名使用稳定 `team_key`，例如：

`data/team-logos/team-spirit.png`

如果下载 URL 的扩展名不可用，则默认回退到 `.png`。

### 数据库字段

在 `teams` 表新增：

- `hltv_team_url TEXT NOT NULL DEFAULT ''`
- `hltv_logo_path TEXT NOT NULL DEFAULT ''`
- `hltv_logo_updated_at TEXT NOT NULL DEFAULT ''`

第一版不在数据库中存图片二进制。

## 主进程职责划分

### DB 层

`src/main/db/migrations.js`

- 为 `teams` 表补新字段

`src/main/db/entities.js`

- `listApprovedTeams()` 返回 logo 相关字段
- 新增写入战队 HLTV 资源字段的 helper

### HLTV 队标抓取层

新增一个小而专用的模块，例如：

`src/main/hltv-team-logo.js`

职责只包括：

- 从 match 页面提取两队的 `name / teamUrl / logoUrl`
- 依据目标战队名选择正确队伍
- 下载 logo 到 `data/team-logos/`
- 返回规范化结果：
  - `teamKey`
  - `hltvTeamUrl`
  - `hltvLogoPath`
  - `hltvLogoUpdatedAt`

不让这个模块关心审批流、renderer 或实体候选逻辑。

### 审批后补 logo

`src/main/ipc.js`

在 `entities-approve-candidates` 完成后：

1. 先完成批准动作
2. 再针对 newly-approved teams 尝试补 logo
3. logo 抓取失败只记日志，不让批准失败
4. 最后返回更新后的 `Entities` page state

这保证“批准”是主动作，“补 logo”是 best-effort enrich。

## Renderer 展示

### 展示范围

第一版只在 `Entities` 页面显示战队队标：

- `待收录`
- `战队`

### 渲染规则

- 有 `hltv_logo_path`：显示本地图片
- 没有 `hltv_logo_path`：显示统一占位块
- 不显示错误文案，不在 UI 中暴露抓取失败细节

### 路径转换

renderer 需要把 Windows 本地路径转换成可供 `<img>` 使用的本地 URL。

建议把这个转换做成小 helper，而不是散落在 DOM 拼接里。

## 错误处理

以下情况都不阻塞战队批准：

- recent matches 缓存为空
- current batch 中找不到该战队
- match 页结构变化导致队标解析失败
- 下载失败
- 本地写文件失败

处理方式统一为：

- 主进程记录日志
- 正式战队照常入库
- UI 继续显示占位图

## 测试策略

### 主进程测试

新增纯逻辑测试，覆盖：

- match 页面 team asset 解析
- 目标战队选择逻辑
- logo 文件名与本地路径生成
- 审批后补 logo 失败不影响批准结果

### DB 测试

扩展实体库测试，验证：

- `teams` 表新字段迁移成功
- `listApprovedTeams()` 能返回 logo 字段
- logo metadata 写入后可读回

### Renderer 测试

补纯 helper 测试，验证：

- 本地 logo path 转 image src
- 无 logo 时占位逻辑稳定

## 验收标准

满足以下条件视为完成：

1. 批准一个能在 HLTV recent matches 中找到的战队后，`teams` 表会写入本地 logo 路径
2. `data/team-logos/` 下会生成对应 logo 文件
3. `Entities -> 战队` 能显示该 logo
4. 找不到 HLTV logo 的战队，批准动作仍成功，UI 显示占位
5. 现有 `Entities` 审批流、HLTV recent matches、demo 回放链路不回归
