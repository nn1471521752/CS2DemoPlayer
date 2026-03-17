# AGENTS

## 用途

- 这是一个 CS2 Demo 2D 回放工具，采用 Electron 桌面界面和 Python Demo 解析后端。

## 关键目录

- `src/main`：Electron 主进程、IPC、数据库层
- `src/python`：Demo 解析逻辑
- `src/renderer`：界面、地图渲染和交互
- `data`：本地数据库与备份

## 常用命令

- `npm start`
- Python 环境：`python -m venv venv`，然后 `pip install -r requirements.txt`
- 未发现明确的 test / lint 命令；默认通过启动应用和目标交互路径验证来确认变更。

## 修改边界

- 默认不修改 `node_modules/`、`venv/`、`data/`，除非任务明确要求。
- 默认不大规模改动 Electron / Python / renderer 三层边界。
- 优先围绕解析、数据库、回放渲染和交互链路做小步修改。

## 编码约束

- 仓库内所有文本文件默认使用 UTF-8，并受 `.editorconfig` 与 `.gitattributes` 约束。
- 新建或重写 `*.md`、`*.txt`、`*.json`、`*.yaml`、`*.yml`、`*.toml`、`*.js`、`*.jsx`、`*.ts`、`*.tsx`、`*.mjs`、`*.cjs`、`*.css`、`*.html`、`*.py`、`*.ps1`、`*.sh`、`*.sql`、`*.svg` 等文本文件时，必须显式使用 UTF-8。
- 使用 PowerShell 写文件时，禁止依赖默认编码或 `>`、`>>`、`Out-File`、`Set-Content` 的默认行为；必须显式指定 UTF-8。
- 如果发现乱码，先从 git 恢复到最后一个正常版本，再重新应用改动；不要直接在乱码文件上继续保存。

## 文档同步原则

- 项目目标、阶段、阻塞、对外行为变化后，按需同步更新：
  - `E:\obsidian\02-Apps\CS2DemoPlayer\Hub.md`
  - `E:\obsidian\02-Apps\CS2DemoPlayer\Sprint.md`
  - `E:\obsidian\02-Apps\CS2DemoPlayer\Changelog.md`
- 默认开发流程是：`app-pre-dev-sync -> app-worklog-pulse（开发中明确节点时） -> app-post-dev-sync`。
- 这 3 个 app skills 由 `E:\codex-skills` 管理，并安装到 `C:\Users\Administrator\.codex\skills`。
- 开始开发前，先读取对应 `Hub.md`、`Sprint.md`、`Changelog.md`，并检查当天 `01-Daily` 是否已经聚焦到 CS2DemoPlayer。
- 开发中完成明确节点后，优先补记当天 `01-Daily` 的执行记录，再决定是否同步项目页。
- 结束任务前，至少检查当天 `01-Daily`、`Sprint.md`、`Changelog.md`；只有项目级目标、阶段或阻塞变化时再更新 `Hub.md`。
- 如果本轮变化会影响 Demo 记录、视频项目或脚本链路，也要检查 `E:\obsidian\03-Demos\`、`04-Video-Projects\`、`05-Scripts\` 是否需要同步。
- 如果一个阶段结束、问题重复出现或需要复盘，再检查 `E:\obsidian\08-Reviews\`。

## 工作日切换规则

- 本仓库提到的“当天 Daily”“今日”“明天”默认按工作日日期解释，不按自然日 `00:00` 切换。
- 工作日日期以本地时间 `08:00` 为切换点；`00:00-07:59` 的开发与回写默认继续记入前一工作日的 Daily。
- 只有在本地时间达到 `08:00` 之后，才默认切换到新一天的 Daily；如果用户明确指定绝对日期，则按指定日期执行。

## 完成定义

- 变更已经在目标链路上完成并做了最小可用验证。
- 当天执行记录已写入对应 Daily。
- 如果项目状态变化，已同步对应 Obsidian 页面。
- 交付时说明改了哪些文件、跑了哪些命令、同步了哪些文档。
