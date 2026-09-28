import assert from "node:assert/strict";
import { test } from "node:test";
import { prefetchWhenIdle, whenIdle } from "./idle-prefetch.ts";

/** An idle scheduler the test runs by hand, counting its cancels. */
function manualIdle() {
  const tasks: (() => void)[] = [];
  const state = { cancels: 0 };
  const idle = (task: () => void) => {
    tasks.push(task);
    return () => {
      state.cancels++;
    };
  };
  return { idle, state, run: () => tasks.splice(0).forEach((task) => task()) };
}

// Spec 2.4. Kills a prefetch at mount (it would race the page's own requests), an href skipped, and a
// cleanup that leaves the idle call pending.
test("prefetchWhenIdle waits for the idle callback, then prefetches every href; its cleanup cancels a pending one", () => {
  const calls: string[] = [];
  const first = manualIdle();
  prefetchWhenIdle(["/archive", "/next"], (href) => calls.push(href), first.idle);
  assert.equal(calls.length, 0);
  first.run();
  assert.deepEqual(calls, ["/archive", "/next"]);
  const second = manualIdle();
  const stop = prefetchWhenIdle(["/archive"], (href) => calls.push(href), second.idle);
  stop();
  second.run();
  assert.equal(second.state.cancels, 1);
  assert.deepEqual(calls, ["/archive", "/next"]);
});

// Spec 2.4: a router.refresh() clears the segment cache. Kills the re-prefetch dropped (after the first
// refresh a tap would wait again) and one that outlives the unmount.
test("prefetchWhenIdle prefetches again each time Next invalidates the entry, until its cleanup", () => {
  const calls: string[] = [];
  const invalidations: (() => void)[] = [];
  const clock = manualIdle();
  const stop = prefetchWhenIdle(
    ["/archive"],
    (href, { onInvalidate }) => {
      calls.push(href);
      invalidations.push(onInvalidate);
    },
    clock.idle,
  );
  clock.run();
  invalidations[0]();
  assert.deepEqual(calls, ["/archive", "/archive"]);
  stop();
  invalidations[1]();
  assert.deepEqual(calls, ["/archive", "/archive"]);
});

// Review Focus 5. Kills a throwing prefetch escaping the idle callback (an uncaught error in the shell)
// or cutting off the hrefs after it: the tap still has to navigate, as it would unprefetched.
test("a prefetch that throws is logged and skipped, and the hrefs after it are still prefetched", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const calls: string[] = [];
  const clock = manualIdle();
  prefetchWhenIdle(
    ["/broken", "/archive"],
    (href) => {
      if (href === "/broken") throw new Error("Cannot prefetch '/broken'");
      calls.push(href);
    },
    clock.idle,
  );
  assert.doesNotThrow(clock.run);
  assert.deepEqual(calls, ["/archive"]);
  assert.equal(warn.mock.callCount(), 1);
});

// Kills the fallback lost where requestIdleCallback is missing (Safari), one that fires at once, and a
// cancel that reaches neither API.
test("whenIdle takes requestIdleCallback where the browser has it, and otherwise waits 1 s; both cancel", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let ran = 0;
  whenIdle(() => ran++);
  t.mock.timers.tick(999);
  assert.equal(ran, 0);
  t.mock.timers.tick(1);
  assert.equal(ran, 1);
  whenIdle(() => ran++)();
  t.mock.timers.tick(1_000);
  assert.equal(ran, 1);

  const cancelled: number[] = [];
  const browser = globalThis as { requestIdleCallback?: unknown; cancelIdleCallback?: unknown };
  browser.requestIdleCallback = (task: () => void) => (task(), 7);
  browser.cancelIdleCallback = (handle: number) => cancelled.push(handle);
  t.after(() => {
    delete browser.requestIdleCallback;
    delete browser.cancelIdleCallback;
  });
  whenIdle(() => ran++)();
  assert.deepEqual([ran, cancelled], [2, [7]]);
});
