---
name: pre-dev-sync
description: Prepare to work on CS2DemoPlayer by reading the repository structure, the local README, and the matching Obsidian project pages before changing code. Use when the user says 开始开发 CS2DemoPlayer、继续 CS2DemoPlayer、先同步当前状态、或动代码前先看上下文. Do not use after code changes, for mid-task worklog updates, for end-of-task writeback, or for other repositories. If blockers in Hub or Sprint are placeholder, missing, or untrusted, report 未知/需确认 and do not infer blockers.
---

# pre-dev-sync

## Purpose

在开始修改 CS2DemoPlayer 之前，压缩出当前目标、阶段、阻塞、目标目录和本轮边界。

## When to use

- 用户准备开始改 CS2DemoPlayer
- 用户想继续上一次 CS2DemoPlayer 的工作
- 用户要求先同步当前项目状态再动代码

## When not to use

- 已经完成代码修改，需要回写文档时
- 只是想记一笔当前进展到 Daily 时；那是 `worklog-pulse`
- 只是做日计划，不是进入 CS2DemoPlayer 开发时
- 处理的不是 CS2DemoPlayer 仓库时

## Inputs

- 当前用户目标
- `README.md`
- 相关代码目录
- 当前工作日 Daily note（工作日日期按本地时间 `08:00` 切换；`00:00-07:59` 归前一工作日；如果已存在）
- `E:\obsidian\02-Apps\CS2DemoPlayer\Hub.md`
- `E:\obsidian\02-Apps\CS2DemoPlayer\Sprint.md`
- `E:\obsidian\02-Apps\CS2DemoPlayer\Changelog.md`

## Steps

1. 读取仓库 `README.md`，确认项目结构、运行方式和层级边界。
2. 读取 Obsidian 中对应的 `Hub.md`、`Sprint.md`、`Changelog.md`。
3. 如果当前工作日 Daily 已存在，检查当前聚焦是否已经落到 CS2DemoPlayer；如果没有，明确指出需要补记 Daily。
4. 确认本轮要动的是 `src/main`、`src/python` 还是 `src/renderer`。
5. 提炼当前目标、当前阶段和本轮建议推进范围。
6. 如果 `Hub.md` 或 `Sprint.md` 中的阻塞仍是占位内容、未记录内容、彼此矛盾或明显不可信，输出“未知/需确认”，不要自行推断阻塞。
7. 明确本轮最可能需要更新的 Obsidian 页面，默认包含当天 Daily。

## Outputs

- 当前目标
- 当前阶段
- 当前阻塞；如果记录缺失或不可信则输出“未知/需确认”
- 本轮建议推进范围
- 与当前工作日 Daily 是否一致
- 本轮最可能需要同步更新的文档页面
