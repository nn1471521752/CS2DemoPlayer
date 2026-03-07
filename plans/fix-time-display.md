# 时间显示 Bug 修复计划

## 问题描述

用户报告时间显示"不跳动而且完全不对"。

## 问题根因分析（已确认）

### 核心问题：数据被二次压缩

**Python 解析器**已经完成了 tick 转换，输出的是连续的帧号（fixed tick）。

**IPC 层**又对这些已经是 fixed tick 的数据进行了二次转换，导致数据被错误压缩。

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Python 解析器输出 (已完成转换)                                            │
│                                                                         │
│ build_frames_sequence:                                                  │
│   tick: 0, 1, 2, 3, 4, 5, 6, 7, 8... (连续帧号)                         │
│                                                                         │
│ build_round_record:                                                     │
│   start_tick: 0   (fixed tick)                                          │
│   end_tick: 240   (fixed tick, 约30秒)                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ IPC 层 normalizeRoundResponseForFixedTickrate (ipc.js:201-227)          │
│                                                                         │
│ 问题代码：                                                               │
│   normalized.start_tick = toFixedTick(rawStartTick, sourceTickrate);   │
│   normalized.end_tick = toFixedTick(rawEndTick, sourceTickrate);       │
│   normalized.frames = normalizeFramesForFixedTickrate(payload.frames); │
│                                                                         │
│ 把已经是 fixed tick 的值再次除以 8！                                     │
│                                                                         │
│ 结果：                                                                   │
│   start_tick: 0 / 8 = 0                                                │
│   end_tick: 240 / 8 = 30  ← 应该是 240！                                │
│   frame.tick: 8 / 8 = 1   ← 应该是 8！                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ 前端接收到的数据（错误）                                                  │
│                                                                         │
│ tickrate = 8                                                            │
│ frames: [tick: 0, tick: 1, tick: 2, ... tick: 30]                      │
│                                                                         │
│ 问题：                                                                   │
│ • 只有 30 帧，实际应该有 240 帧                                          │
│ • 播放 30 帧 / 8 tickrate = 3.75 秒，实际应该是 30 秒                    │
│ • 时间显示完全错误！                                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 问题代码位置

| 文件 | 函数/行号 | 问题 |
|------|-----------|------|
| [`src/main/ipc.js:201-227`](src/main/ipc.js:201) | `normalizeRoundResponseForFixedTickrate` | 对已经是 fixed tick 的数据再次转换 |
| [`src/main/ipc.js:108-128`](src/main/ipc.js:108) | `normalizeFrameForFixedTickrate` | 同上 |
| [`src/main/ipc.js:166-198`](src/main/ipc.js:166) | `normalizeRoundForFixedTickrate` | 同上 |

---

## 修复方案

### 方案：跳过 IPC 层的二次转换

Python 解析器已经输出了正确格式的数据，IPC 层不应该再次转换。

**修改文件：[`src/main/ipc.js`](src/main/ipc.js)**

#### 修改 1：`normalizeRoundResponseForFixedTickrate` 函数

```javascript
function normalizeRoundResponseForFixedTickrate(payload, sourceTickrate) {
  const normalized = { ...payload };
  
  // 如果数据来自 Python 解析器，已经是 fixed tick 格式，不需要再次转换
  // 只有从数据库读取的旧数据才需要转换
  
  // 检查是否有 raw_start_tick 字段来判断数据来源
  const isAlreadyFixedTick = payload?.tickrate === FIXED_TICKRATE
    || (payload?.start_tick !== undefined && payload?.raw_start_tick === undefined);
  
  if (isAlreadyFixedTick) {
    // 数据已经是 fixed tick 格式，直接使用
    normalized.tickrate = FIXED_TICKRATE;
    return normalized;
  }
  
  // 原有的转换逻辑（用于数据库读取的旧数据）
  const rawStartTick = toInteger(payload?.raw_start_tick ?? payload?.start_tick);
  const rawEndTick = toInteger(payload?.raw_end_tick ?? payload?.end_tick, rawStartTick);
  // ... 其余代码保持不变
}
```

#### 修改 2：`normalizeFramesForFixedTickrate` 函数

```javascript
function normalizeFramesForFixedTickrate(frames, sourceTickrate, skipConversion = false) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return [];
  }

  // 如果数据已经是 fixed tick 格式，跳过转换
  if (skipConversion) {
    return frames;
  }

  // 原有的转换逻辑...
}
```

---

## 实施步骤

1. [ ] 修改 `src/main/ipc.js` 中的 `normalizeRoundResponseForFixedTickrate` 函数
2. [ ] 修改 `src/main/ipc.js` 中的 `normalizeFramesForFixedTickrate` 函数
3. [ ] 修改 `src/main/ipc.js` 中的 `normalizeRoundForFixedTickrate` 函数
4. [ ] 添加调试日志确认数据格式正确
5. [ ] 测试时间显示是否正确跳动
6. [ ] 验证时间是否与游戏内时间对齐

---

## 测试验证

1. 加载一个已知时间的 demo
2. 检查回合开始时是否显示约 1:55（115秒）
3. 检查时间是否正常流逝（每秒减少1秒）
4. 检查炸弹倒计时是否从 40 秒开始
5. 对比游戏内回放时间与本工具显示时间

---

## 调试日志建议

在前端添加调试日志，确认数据格式：

```javascript
// src/renderer/js/ui/library.js applyRoundResponseFrameState
console.log('Round data:', {
  tickrate: response.tickrate,
  start_tick: round.start_tick,
  end_tick: round.end_tick,
  framesCount: response.frames?.length,
  firstFrameTick: response.frames?.[0]?.tick,
  lastFrameTick: response.frames?.[response.frames.length - 1]?.tick,
});
```

预期输出（正确）：
```
tickrate: 8
start_tick: 0
end_tick: 240 (约30秒的回合)
framesCount: 241
firstFrameTick: 0
lastFrameTick: 240
```

错误输出（当前）：
```
tickrate: 8
start_tick: 0
end_tick: 30 (错误！)
framesCount: 31 (错误！)
firstFrameTick: 0
lastFrameTick: 30
```