---
name: post-dev-sync
description: Sync CS2DemoPlayer documentation after real code or state changes by updating the matching Obsidian project pages. Use when the user says 这轮 CS2DemoPlayer 做完了、记一下这次变更、回写 Hub/Sprint/Changelog、或同步今天结果. Do not use before implementation, for planning-only work, for mid-task worklog notes, or for other repositories. Only update Hub.md when project-level goal, stage, or blockers changed; otherwise prefer Sprint.md and Changelog.md.
---

# post-dev-sync

## Purpose

在 CS2DemoPlayer 发生真实变化后，把必要的状态同步回 Obsidian。

## When to use

- CS2DemoPlayer 代码已经改完
- 本轮改动影响了目标、阶段、阻塞或对外行为
- 用户要求同步更新项目页

## When not to use

- 还没开始修改代码时
- 只是讨论方案，没有真实状态变化时
- 只是想先把一个中途节点记到 Daily 时；那是 `worklog-pulse`
- 处理的不是 CS2DemoPlayer 仓库时

## Inputs

- 本轮实际变更摘要
- 变更涉及的代码路径
- 是否影响目标、阶段、阻塞、行为
- 当前工作日 Daily note（工作日日期按本地时间 `08:00` 切换；`00:00-07:59` 归前一工作日）
- 必要时读取 `E:\obsidian\08-Reviews\*`
- `E:\obsidian\02-Apps\CS2DemoPlayer\Hub.md`
- `E:\obsidian\02-Apps\CS2DemoPlayer\Sprint.md`
- `E:\obsidian\02-Apps\CS2DemoPlayer\Changelog.md`

## Steps

1. 确认本轮是否存在真实代码或状态变化。
2. 先检查当前工作日 Daily note；如果本轮进展、阻塞或结果还没写入 Daily，先补记。
3. 判断这些变化是否影响目标、阶段、阻塞或对外可见行为。
4. 只有项目级目标、阶段或阻塞发生变化时才更新 `Hub.md`。
5. 纯局部实现、局部修复、局部联调优先更新 `Sprint.md` 和 `Changelog.md`，不要因为有代码改动就自动更新 `Hub.md`。
6. 如果本轮变化会影响 Demo 记录或内容线，再提醒检查 Obsidian 内容页是否需要同步。
7. 如果一个阶段结束、问题重复出现或需要沉淀复盘，再检查 `E:\obsidian\08-Reviews\*`。
8. 输出本次同步更新了哪些页面，以及原因。

## Outputs

- 已更新的页面
- 每个页面的更新原因
- 如果有应更未更的页面，明确指出
