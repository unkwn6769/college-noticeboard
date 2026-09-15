import { AsyncLocalStorage } from "node:async_hooks";

const runtimeStorage = new AsyncLocalStorage();

export function runWithRuntimeContext(runtimeEnv, executionContext, fn) {
  const context = {
    env: runtimeEnv,
    client: null,
    waitUntil: typeof executionContext?.waitUntil === "function"
      ? executionContext.waitUntil.bind(executionContext)
      : null,
  };

  return runtimeStorage.run(context, async () => {
    try {
      return await fn();
    } finally {
      if (context.client) {
        await context.client.end().catch(() => {});
        context.client = null;
      }
    }
  });
}

export function getRuntimeContext() {
  return runtimeStorage.getStore() ?? null;
}

export function scheduleRuntimeTask(task) {
  const context = getRuntimeContext();
  if (context?.waitUntil) {
    context.waitUntil(Promise.resolve(task));
    return true;
  }
  return false;
}
