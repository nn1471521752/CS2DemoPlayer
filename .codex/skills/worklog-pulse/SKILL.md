---
name: worklog-pulse
description: Record an in-progress CS2DemoPlayer milestone into the current workday's Daily note before the task is fully done. Workday date switches at local 08:00, so 00:00-07:59 still belongs to the previous workday. Use when the user says 记一下这次进展、先写进 Daily、中途同步一下今天做了什么、或把这个节点留个记录. Do not use for start-of-task planning, end-of-task writeback, or other repositories. If the change already affects project status, follow with post-dev-sync.
---

# worklog-pulse

## Purpose

在 CS2DemoPlayer 开发进行中，把一个明确节点先记到当前工作日 Daily，而不是等全部做完再回写。

## When to use

- 已完成一个小功能或明确子任务
- 已定位到一个 blocker
- 已完成一次可复现 / 可验证的实验
- 已做出一个值得留痕的技术或产品决策

## When not to use

- 还没开始开发，只是在做准备时；那是 `pre-dev-sync`
- 一轮任务已经结束，需要统一回写项目页时；那是 `post-dev-sync`
- 处理的不是 CS2DemoPlayer 仓库时

## Inputs

- 本轮节点摘要
- 相关代码路径
- 当前工作日 Daily note（工作日日期按本地时间 `08:00` 切换；`00:00-07:59` 归前一工作日）
- `E:\obsidian\09-Templates\Daily-Note.md`
- 必要时读取 `E:\obsidian\02-Apps\CS2DemoPlayer\Sprint.md`

## Steps

1. 读取当前工作日 Daily note；如果不存在，则基于 `E:\obsidian\09-Templates\Daily-Note.md` 创建最小可用页面。
2. 判断这次是否属于值得留痕的明确节点，而不是一句模糊的“继续开发中”。
3. 把节点以时间戳形式写入 Daily 的“今日执行记录”。
4. 如果这次节点实际上已经改变了项目阶段、阻塞、内容链路影响或对外可见行为，明确提醒接着执行 `post-dev-sync`。
5. 如果当前工作日 `focus_app` 还没落到 CS2DemoPlayer，但这轮工作已经明显转到该项目，补记或提醒同步 `focus_app`。

## Outputs

- 已更新的 Daily 页面
- 本次写入的节点记录
- 是否还需要继续执行 `post-dev-sync`
