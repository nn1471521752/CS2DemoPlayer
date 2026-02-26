function normalizeConcurrency(value, fallback = 1, maxValue = 6) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.max(1, fallback);
  }
  return Math.max(1, Math.min(parsed, maxValue));
}

function nextTaskIndex(cursorState, taskCount) {
  if (cursorState.index >= taskCount) {
    return -1;
  }
  const currentIndex = cursorState.index;
  cursorState.index += 1;
  return currentIndex;
}

async function workerLoop(tasks, cursorState, executeTask, onTaskDone) {
  while (true) {
    const taskIndex = nextTaskIndex(cursorState, tasks.length);
    if (taskIndex < 0) {
      return;
    }

    const task = tasks[taskIndex];
    const result = await executeTask(task);
    await onTaskDone(task, result);
  }
}

async function runTaskQueue(tasks, concurrency, executeTask, onTaskDone = async () => {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return;
  }

  const workerCount = Math.min(
    normalizeConcurrency(concurrency),
    tasks.length,
  );
  const cursorState = { index: 0 };
  const workers = [];
  for (let index = 0; index < workerCount; index += 1) {
    workers.push(workerLoop(tasks, cursorState, executeTask, onTaskDone));
  }
  await Promise.all(workers);
}

module.exports = {
  normalizeConcurrency,
  runTaskQueue,
};
