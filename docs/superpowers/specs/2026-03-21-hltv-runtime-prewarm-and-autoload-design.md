# HLTV Runtime 预热与自动首刷设计

- 日期：2026-03-21
- 项目：CS2DemoPlayer
- 状态：设计已确认，待进入实现计划

## 1. 背景

当前 HLTV 正式链路已经具备这几件事：

- 主页有独立的 `HLTV` 页
- 主进程能用 Playwright 打开 HLTV `results` 页并返回近期比赛
- 页面能展示对阵双方、赛事名，并能继续进入 demo 下载链路

但当前交互还有两个明显问题：

1. 首次获取最近比赛必须靠用户点击 `Fetch Recent Matches`
2. 每次刷新都会新建并销毁一套 Playwright session，导致体感偏慢

用户希望把“起无头浏览器”和“拉取近期比赛”前移到软件启动阶段，让 HLTV 页在用户真正点进去之前就已经完成后台预热。

## 2. 目标与非目标

### 目标

- 软件启动后，在后台自动预热 HLTV runtime
- 软件启动后，自动抓取一次近期比赛列表
- `HLTV` 页打开时优先展示已缓存的抓取结果，而不是等按钮触发第一次抓取
- 手动刷新继续保留，但改为复用同一套 runtime，而不是反复新建浏览器
- HLTV 预热与首刷不阻塞应用主界面启动

### 非目标

- 本轮不改 demo 下载链路
- 本轮不增加定时轮询或常驻自动刷新
- 本轮不增加分页、筛选、搜索或更多 HLTV 页面
- 本轮不把 HLTV 抓取结果写入数据库
- 本轮不尝试替换 Playwright 为纯 HTTP 爬虫

## 3. 方案比较

### 方案 A：启动即自动抓，但每次仍新开浏览器

做法：

- 应用启动时，renderer 直接调用现有 `hltv-list-recent-matches`
- 主进程继续沿用“每次新建 session -> 抓取 -> 关闭”的模式

优点：

- 改动最小
- 很快能实现自动首刷

缺点：

- 首刷虽然前移了，但后续手动刷新依然慢
- 没有解决浏览器启动成本反复发生的问题

### 方案 B：常驻 HLTV runtime + 启动即自动首刷，推荐

做法：

- 主进程维护一个单例 HLTV runtime
- runtime 持有可复用的 `browser/context/page`
- 应用启动时先异步预热 runtime，再自动抓一次 recent matches
- renderer 从主进程读取或订阅缓存状态
- 手动刷新复用同一个 runtime

优点：

- 同时解决“必须点按钮首刷”和“每次刷新都重启浏览器”两个问题
- 与现有 Playwright 主链兼容，不必重做抓取层
- 易于后续扩展缓存、重试和健康状态

缺点：

- 需要引入主进程状态管理和退出清理
- 需要明确 runtime 生命周期

### 方案 C：定时轮询常驻更新

做法：

- 启动后创建常驻 runtime
- 定时抓取近期比赛，HLTV 页只读缓存

优点：

- HLTV 页几乎总是热的

缺点：

- 当前过度设计
- 更容易增加 HLTV 风控压力
- 维护成本高于当前需求

### 选择

采用方案 B。

原因：

- 它是最小且完整的性能优化方案
- 既满足“启动即后台预热”，也满足“后续刷新更快”
- 不需要现在就进入复杂的轮询或调度系统

## 4. 设计概览

本轮引入一个主进程侧 `HLTV runtime` 概念。

它负责三件事：

- 持有可复用的无头浏览器资源
- 维护近期比赛缓存状态
- 串行执行 recent matches 刷新任务

应用启动后：

1. 主进程创建 HLTV runtime 管理器
2. 后台异步预热浏览器会话
3. 预热完成后自动执行一次 recent matches 抓取
4. 抓取结果写入 runtime 缓存
5. renderer 初始化时读取当前缓存状态

用户进入 `HLTV` 页时：

- 如果缓存已成功，直接显示列表
- 如果缓存仍在加载，显示 loading
- 如果缓存失败，显示错误与重试入口

用户点击 `Refresh` 时：

- 复用同一 runtime
- 如果当前已有抓取任务进行中，则不并发启动第二个任务

## 5. 主进程设计

### 5.1 新增 HLTV runtime 管理层

建议新增一个聚焦模块，例如：

- `src/main/hltv-runtime.js`

职责：

- 惰性或启动时初始化 Playwright 资源
- 提供 `ensureStarted()`
- 提供 `refreshRecentMatches()`
- 提供 `getRecentMatchesState()`
- 提供 `dispose()`

这个模块不负责页面解析细节，也不负责下载 demo。

### 5.2 runtime 持有的状态

最小状态结构：

```js
{
  status: 'idle' | 'loading' | 'success' | 'error',
  detail: '',
  matches: [],
  updatedAt: '',
  isRuntimeReady: false
}
```

必要的内部字段：

- `browser`
- `context`
- `page`
- `activeRefreshPromise`

约束：

- 任意时刻最多只有一个 `refreshRecentMatches()` 在跑
- 如果刷新进行中，重复调用直接复用同一个 promise 或返回当前状态

### 5.3 自动预热

在应用启动、主窗口创建完成后，主进程异步触发：

- `ensureStarted()`
- `refreshRecentMatches()`

注意：

- 不能阻塞 Electron 主窗口显示
- 失败只更新 HLTV 状态，不应让应用启动失败

### 5.4 页面抓取策略

本轮仍使用现有 Playwright + `results` 页解析方式。

但与当前不同的是：

- 不再每次 `fetchRecentMatches` 都新开一套 session
- 改为复用 runtime 中的已有 `page`

刷新时：

- 直接让同一 page 重新 `goto(resultsUrl)`
- 读取 HTML 并解析
- 更新缓存

### 5.5 生命周期与清理

应用退出时，主进程需要调用 `dispose()`：

- 关闭 page/context/browser
- 清空内部引用

这样避免遗留无头浏览器进程。

## 6. IPC 设计

### 6.1 调整现有 recent matches IPC 语义

当前 `hltv-list-recent-matches` 更像“触发一次抓取”。

本轮后建议将它调整为：

- 默认行为：返回最新缓存状态
- 可选行为：带参数触发强制刷新

例如：

- `hltv-list-recent-matches`：只读当前状态
- `hltv-refresh-recent-matches`：显式触发刷新

或者保留单一 IPC，但支持参数：

- `{ forceRefresh: false }`
- `{ forceRefresh: true }`

推荐拆成两个 IPC，语义更清晰。

### 6.2 renderer 首屏取状态

renderer 初始化后需要主动读取：

- 当前 recent matches 状态

这一步不是等用户点按钮再做，而是首页启动时就做。

如果希望后续更顺，也可以补一个主进程事件推送，但这不是本轮必需。

本轮最小实现只需要：

- renderer 初始化时读取一次
- 用户进入 HLTV 页时读到已缓存状态
- 用户点击刷新时显式重刷

## 7. Renderer 设计

### 7.1 首屏加载行为

当前 renderer 启动时只初始化主页壳层、Demo 库和 DB 信息。

本轮需要在初始化流程中追加：

- 请求主进程当前 HLTV recent matches 状态

这一步应当是后台进行的，不能让首页因为 HLTV 阻塞。

### 7.2 HLTV 页行为调整

`HLTV` 页的职责从“第一次手动触发抓取”改为：

- 展示主进程已缓存状态
- 在需要时允许用户手动刷新

页面状态规则：

- `idle`：显示“后台尚未开始或尚未拿到结果”
- `loading`：显示“正在获取近期比赛”
- `success`：显示列表
- `error`：显示错误和重试按钮

### 7.3 Refresh 按钮职责变化

`Refresh` 按钮保留，但职责变为：

- 手动重抓
- 不是“第一次获取数据”的必要入口

按钮文本可以继续沿用当前模式，但首屏成功后它更像“重新获取最新结果”。

## 8. 并发与错误处理

### 8.1 并发规则

- 启动自动首刷与手动刷新不能并发跑两份任务
- 如果用户在自动首刷未完成前点击刷新：
  - 直接复用当前任务
  - 或明确提示正在刷新

推荐复用当前 promise，避免重复请求 HLTV。

### 8.2 错误处理

如果 HLTV 预热失败或抓取失败：

- 只更新 HLTV 状态
- 不影响应用启动
- 不影响 Demo 库和回放页使用

错误展示来源：

- Cloudflare blocked
- selector mismatch
- browser launch failure
- unexpected error

### 8.3 fallback

如果 runtime 已损坏，例如 page/context/browser 失效：

- 下一次 `refreshRecentMatches()` 可以触发一次 runtime 重建
- 这条重建逻辑应当封装在主进程 runtime 内部

renderer 不感知这些细节。

## 9. 性能预期

当前瓶颈主要不是解析字段，而是：

- Playwright 启动成本
- browser/context/page 初始化

本轮完成后：

- 首次打开 HLTV 页时应显著更快，因为结果已在后台准备中或已准备完成
- 手动刷新应比当前实现更快，因为不再重复冷启动浏览器

本轮不承诺做到“秒级无等待”，但应显著改善当前“每次刷新都像重新开一次浏览器”的体感。

## 10. 验证标准

实现完成后至少满足以下结果：

1. 应用启动后，不点击 HLTV 页按钮也会在后台开始 recent matches 预热与首刷
2. 应用主界面不会因为 HLTV 预热而阻塞或卡死
3. 进入 `HLTV` 页时，如果后台首刷已完成，能直接看到比赛列表
4. 如果后台首刷尚未完成，`HLTV` 页会显示 loading，而不是空白或必须手动触发
5. `Refresh` 按钮仍可用，并且复用 runtime，不重复并发开多个抓取任务
6. 退出应用后不会残留无头浏览器进程

## 11. 当前决策

- 采用主进程单例 HLTV runtime
- 应用启动后自动预热并自动抓一次 recent matches
- HLTV 页面消费缓存状态，不再把首刷绑定到按钮点击
- 手动刷新保留，但改为重刷入口
- 本轮不做定时轮询，不做下载链路重构，不做数据库持久化
