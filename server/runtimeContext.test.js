import test from "node:test";
import assert from "node:assert/strict";
import { getRuntimeContext, runWithRuntimeContext, scheduleRuntimeTask } from "./runtimeContext.js";

test("scheduleRuntimeTask registers background work with the Worker execution context", async () => {
  const scheduled = [];
  const executionContext = {
    waitUntil(promise) {
      scheduled.push(promise);
    },
  };

  let ran = false;
  await runWithRuntimeContext({ GITHUB_TOKEN: "test-only" }, executionContext, async () => {
    assert.equal(getRuntimeContext().env.GITHUB_TOKEN, "test-only");
    assert.equal(scheduleRuntimeTask(Promise.resolve().then(() => { ran = true; })), true);
  });

  assert.equal(scheduled.length, 1);
  await scheduled[0];
  assert.equal(ran, true);
});

test("scheduleRuntimeTask returns false outside Worker runtime", async () => {
  let called = false;
  await runWithRuntimeContext({}, undefined, async () => {
    called = scheduleRuntimeTask(Promise.resolve());
  });
  assert.equal(called, false);
});
