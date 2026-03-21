# HLTV Results 流与同批次懒加载设计

- 日期：2026-03-22
- 项目：CS2DemoPlayer
- 状态：设计已确认，待用户审阅后进入实现计划

## 1. 背景

当前 `HLTV` 页已经具备一条可用主链：

- 应用启动后，主进程会后台预热 HLTV runtime 并自动抓取 recent matches
- `HLTV` 页打开时可以直接消费缓存状态，而不必先手点 `Fetch Recent Matches`
- 最近比赛列表已经能显示对阵双方、赛事名，并支持下载 demo

但当前页面仍有三个明显问题：

1. recent matches 没有显示比分，和用户对 HLTV `results` 页的核心预期不一致
2. 页面主体是卡片堆叠，信息结构更像工具面板，而不是比赛结果流
3. 首批抓到的比赛虽然已经在内存里，但页面没有做分段揭示，信息密度和滚动节奏都不够像 `results`

这里还有一个已经确认的事实：

- 当前“看不到比分”不是 HLTV 没有比分，而是我们现有的 results 解析层只提取了 `team1Name / team2Name / eventName`，没有把 score 列带到 renderer

本轮设计只解决这三个问题，不扩展到更旧比赛翻页、复杂筛选、赛事详情页或额外数据源。

## 2. 目标与非目标

### 目标

- 补齐 HLTV `results` 行中的比分等核心元数据
- 把 `HLTV` 页从卡片流改成更接近 HLTV `results` 的单行结果流
- 保留现有 app shell 主题，不复刻 HLTV 的配色皮肤
- 在当前一次抓取到的 recent matches 范围内做前端分段揭示
- 让用户在不继续请求更旧比赛的情况下，向下滚动看到当前批次中更多结果

### 非目标

- 本轮不改 demo 下载主链，不替换 `download demo -> 解压 archive -> 打开 .dem`
- 本轮不做跨批次或无限向更旧比赛翻页
- 本轮不做 HLTV 赛事详情页、队伍详情页、筛选、搜索或分页
- 本轮不复刻 HLTV 的完整视觉风格、广告区、侧栏或 tab 导航
- 本轮不引入新的第三方数据源，也不替换 Playwright 抓取层

## 3. 方案比较

### 方案 A：只补比分，保留卡片结构

做法：

- results 解析层增加比分字段
- renderer 仍然使用当前卡片布局，只是在卡片标题里补比分

优点：

- 改动最小
- 能快速解决“比分缺失”

缺点：

- 页面整体仍然不像 `results` 页
- 信息结构和阅读节奏改善有限

### 方案 B：结果流重排 + 同批次懒加载，推荐

做法：

- results 解析层补齐比分和更多列表元数据
- `HLTV` 页改成单行结果流
- 主进程一次抓一批更大的 recent matches
- renderer 首屏只显示前一段，滚动后从当前批次继续追加

优点：

- 同时解决“比分缺失”和“信息结构不像 HLTV”两个问题
- 首屏体验更接近真实 results 页
- 不增加新的抓取复杂度，滚动阶段也不会重新打 HLTV

缺点：

- 需要同时调整主进程解析、renderer 结构和样式

### 方案 C：结果流 + 行内详情抽屉

做法：

- 结果列表先做成单行流
- 点击某场比赛后在行内展开完整 metadata、下载状态和 demo 子项

优点：

- 信息承载能力最强
- 后续更容易延伸成完整 HLTV 工作台

缺点：

- 这轮过度设计
- 会把本轮范围从“列表页改造”扩大成“列表 + 详情交互”

### 选择

采用方案 B。

原因：

- 它是最小但完整的结构修正
- 能把比分、排版节奏和列表浏览体验一起拉到正确方向
- 它与当前“启动即预热 + 自动首刷”的 HLTV runtime 完全兼容

## 4. 设计概览

`HLTV` 页继续保留现有三层外壳：

- app shell
- 页头与状态区
- 比赛列表主体

变化集中在列表主体：

- 从“比赛卡片堆叠”改成“单行结果流”
- 主进程一次抓取一整批 recent matches，例如 `60`
- renderer 首次只渲染前 `20`
- 用户滚动接近底部时，再从同一批已缓存结果中追加下一段 `20`

这个方案明确区分两类动作：

- `Refresh`
  - 向 HLTV 重新抓取一批新的 recent matches
  - 并重置当前已展示数量
- 向下滚动
  - 只从当前批次继续显示更多
  - 不再向 HLTV 请求更旧比赛

## 5. 数据设计

### 5.1 recent match 最小字段

每场比赛在 renderer 中至少应具备以下字段：

```js
{
  matchId: '2391755',
  matchUrl: 'https://www.hltv.org/matches/...',
  team1Name: 'NRG',
  team2Name: 'B8',
  team1Score: 2,
  team2Score: 0,
  eventName: 'BLAST Open Rotterdam 2026',
  matchFormat: 'bo3',
  matchTimeLabel: '2026-03-22 20:00',
  hasDemo: true,
  downloadedDemoPath: '',
  downloadedFileSize: 0,
  playableDemoPaths: [],
  isDownloading: false
}
```

本轮允许部分字段缺失，但必须保证以下字段始终稳定：

- `matchId`
- `matchUrl`
- `team1Name`
- `team2Name`

### 5.2 比分字段

比分字段定义为：

- `team1Score`
- `team2Score`

来源是 HLTV `results` 行中的 score 列，而不是进入 match 页后再补抓。

如果本场结果行没有稳定可解析的比分，则回退为：

- `team1Score = null`
- `team2Score = null`

renderer 展示时输出 `- : -`，而不是让整行进入失败态。

### 5.3 更多列表元数据

本轮可在 `results` 列表层直接带上的字段包括：

- `matchFormat`
- `matchTimeLabel`
- `hasDemo`

如果 HLTV 当前结果行里并不能稳定拿到其中某项，就允许字段为空，并在 UI 中弱化该项，而不是强行猜测。

## 6. 主进程设计

### 6.1 results 解析层

当前 `src/main/hltv-html-utils.js` 需要从结果行额外提取：

- `team1Score`
- `team2Score`
- 可选的 `matchFormat`
- 可选的 `matchTimeLabel`
- 可选的 `hasDemo`

设计约束：

- 仍然只基于 `results` 页 HTML 做解析
- 不因为单个字段失败而丢掉整场比赛
- 继续保持对重复比赛链接的去重

### 6.2 runtime 默认抓取数量

当前 runtime 会抓一批 recent matches，但数量偏小。

本轮建议把默认批次调整为适合列表分段显示的规模，例如：

- `60`

这样可以满足：

- 首屏直接渲染前 `20`
- 向下滚动可继续 reveal 到 `40`
- 再继续 reveal 到 `60`

这个数量仍然属于“当前批次”，不意味着要去抓更旧分页。

### 6.3 刷新语义

`Refresh` 的语义保持明确：

- 重新向 HLTV 拉取一整批新的 recent matches
- 成功后覆盖当前缓存 state
- renderer 拿到新 state 后，把当前显示条数重置回首屏段

## 7. Renderer 页面设计

### 7.1 页面总体结构

`HLTV` 页继续保留：

- 页头
- 状态区
- 主体列表区

本轮只重排主体列表区，不重做页头和全局导航。

### 7.2 单行结果流布局

每场比赛一行，优先按“扫一眼看清结果”的节奏组织信息。

建议每行拆成三个视觉区：

1. 对阵区
   - `team1Name`
   - 中间比分 `team1Score : team2Score`
   - `team2Name`
2. 次级信息区
   - `eventName`
   - `matchFormat`
   - `matchTimeLabel`
   - 下载后的 `archive size / demos ready`
3. 动作区
   - `下载 demo`
   - 或 `打开 demo`

布局优先级：

- 队名和比分是第一层信息
- 赛事与时间是第二层信息
- 下载状态和已提取 demo 数是第三层信息

### 7.3 下载后的展开内容

下载成功后，比赛行下方仍然允许展开 `.dem` 列表。

保留当前行为：

- 每个 `.dem` 单独显示
- 每个条目保留 `Open`

但这些子项不应再主导整张卡的视觉，而应只是该比赛行的附属展开区域。

### 7.4 字段缺失的显示策略

如果缺少某个字段：

- 缺比分：显示 `- : -`
- 缺时间：不显示时间段
- 缺 format：不显示 `boX`
- 缺 event：回退到 `Unknown event`

原则是：

- 允许一行“降级”
- 不允许整页因单项元数据缺失而退回空白或错误页

## 8. 同批次懒加载设计

### 8.1 懒加载语义

本轮的“懒加载”不是继续请求更多 HLTV 数据，而是：

- 主进程一次抓取一整批
- renderer 分段显示

因此它更准确地说是：

- 当前批次内的分段 reveal

### 8.2 展示节奏

建议的默认节奏：

- 初始显示：`20`
- 每次追加：`20`
- 当前批次上限：`60`

也就是：

- 初始：`20`
- 第一次触底：`40`
- 第二次触底：`60`
- 再触底：不再新增

### 8.3 触发条件

当列表容器滚动接近底部时，触发 reveal：

- 不依赖按钮点击
- 不在 reveal 阶段访问主进程抓新数据

为了避免重复触发，应加入简单的保护：

- 当前正在 reveal 时忽略重复滚动触发
- 当前已经显示到批次末尾时，不再触发

### 8.4 结束态

当前批次全部显示后，列表底部应有一个清晰但轻量的结束态，例如：

- `No more matches in current batch`

这能明确告诉用户：

- 不是系统卡住
- 只是当前批次已展示完
- 若要看更新的数据，应使用 `Refresh`

## 9. 错误处理

### 9.1 recent matches 抓取失败

如果 recent matches 刷新失败：

- 保留状态区错误提示
- 不清空用户已经看到的旧列表，除非这是首次加载且没有任何旧数据

### 9.2 局部字段解析失败

如果只有比分、format、time 等部分字段解析失败：

- 只让该字段降级显示
- 不让整场比赛被过滤掉

### 9.3 懒加载阶段失败

因为本轮 reveal 不再访问 HLTV，所以严格来说不会有“加载下一页远程失败”。

潜在风险主要是：

- renderer 本地切片逻辑错误

这类问题应通过 renderer 纯逻辑测试覆盖，而不是依赖运行时兜底。

## 10. 测试与验收

### 10.1 主进程测试

需要新增或扩展测试，覆盖：

- results 行比分提取
- `matchFormat / matchTimeLabel / hasDemo` 的可选提取
- 缺字段时的归一化 fallback
- recent matches 批量结果仍然稳定去重

### 10.2 Renderer 纯逻辑测试

需要新增或扩展测试，覆盖：

- recent match 行项文本格式
- 比分展示 fallback
- 首屏显示数量
- reveal 追加数量
- 批次结束判定
- refresh 后重置已显示数量

### 10.3 手动验收

最小手动验收标准：

1. 打开应用后不点 `Fetch Recent Matches`，进入 `HLTV` 页能直接看到首屏 recent matches
2. 每场比赛能看到 `队伍 + 比分`
3. 列表整体阅读节奏接近 HLTV `results`，而不是卡片说明页
4. 向下滚动时，会从当前批次继续追加更多比赛
5. 到达批次末尾后，会出现明确结束态
6. 下载 demo 和打开 `.dem` 的现有链路不回归

## 11. 实现边界总结

这轮实现只覆盖：

- HLTV results 行元数据补齐
- `HLTV` 页结果流重排
- 同批次分段 reveal

这轮明确不覆盖：

- 更旧比赛翻页
- 复杂筛选或搜索
- 详情抽屉
- 新数据源
- 下载链路重构
