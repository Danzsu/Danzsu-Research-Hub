import assert from "node:assert/strict";
import { test } from "node:test";
import "../../lib/test/render.ts";

const { runRefresh } = await import("./refresh-bar.tsx");

/** One refresh's steps, in order: the write, the bar's count, the transition and the navigation. */
function recorder() {
  const steps: string[] = [];
  return {
    steps,
    track: (delta: 1 | -1) => steps.push(`bar ${delta > 0 ? "+" : "-"}`),
    navigate: () => steps.push("navigate"),
    startTransition: (navigate: () => void) => {
      steps.push("transition");
      navigate();
    },
  };
}

// R2 final review, Important 1. In React 19 every transition started while an async action is pending is
// entangled with it, so a Translate running inside the transition held back every nav click for its whole
// length. Kills the write moved back inside the transition, the bar not lit while it runs, and the count
// left up after it.
test("runRefresh runs the write before any transition opens, lighting the bar meanwhile", async () => {
  const run = recorder();
  let finish: (goOn: boolean) => void = () => {};
  const work = () => {
    run.steps.push("work");
    return new Promise<boolean>((resolve) => (finish = resolve));
  };
  const done = runRefresh(work, run.track, run.navigate, run.startTransition);
  assert.deepEqual(run.steps, ["bar +", "work"]);
  finish(true);
  await done;
  assert.deepEqual(run.steps, ["bar +", "work", "bar -", "transition", "navigate"]);
});

// Kills a refused or throwing write that still navigates, a throw that escapes (it would reach the error
// boundary), and the bar's count left up after a failure.
test("runRefresh stops before navigating when the write says no or throws, and logs a throw", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  for (const work of [async () => false, async () => Promise.reject(new Error("boom"))]) {
    const run = recorder();
    await runRefresh(work, run.track, run.navigate, run.startTransition);
    assert.deepEqual(run.steps, ["bar +", "bar -"]);
  }
  assert.equal(logged.mock.callCount(), 1);
});

// Kills a plain refresh (the language toggle, the chat's send) that lights the work count or skips the transition.
test("runRefresh without a write goes straight into the transition", async () => {
  const run = recorder();
  await runRefresh(undefined, run.track, run.navigate, run.startTransition);
  assert.deepEqual(run.steps, ["transition", "navigate"]);
});
