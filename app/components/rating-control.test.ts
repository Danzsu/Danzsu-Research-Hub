import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { render } from "../../lib/test/render.ts";

const { RatingBadge, RatingControl, RatingsProvider } = await import("./rating-control.tsx");
const { LanguageProvider } = await import("./language-context.tsx");

const hu = { initial: "hu" } as ComponentProps<typeof LanguageProvider>;
const sendNothing = { send: async () => ({}) };
const inShell = (child: ReactNode) =>
  render(createElement(LanguageProvider, hu, createElement(RatingsProvider, sendNothing, child)));

// G1 spec 3. Kills a group without its name, a pressed state not drawn from the value, the labels
// swapped, and the data-rating a card dims by missing or wrong.
test("RatingControl is a named group of three toggles, pressed by the value, marked for the card", () => {
  const doc = inShell(createElement(RatingControl, { target: { kind: "item", id: "a" }, initial: 2 }));
  const group = doc.querySelector('[role="group"]');
  assert.equal(group?.getAttribute("aria-label"), "Értékelés");
  assert.equal(group?.getAttribute("data-rating"), "heart");
  assert.deepEqual([...doc.querySelectorAll("button")].map((b) => [b.getAttribute("aria-label"), b.getAttribute("aria-pressed")]), [
    ["Nem hasznos", "false"],
    ["Hasznos", "false"],
    ["Kedvenc", "true"],
  ]);
  const none = inShell(createElement(RatingControl, { target: { kind: "item", id: "a" }, initial: null }));
  assert.equal(none.querySelector('[role="group"]')?.hasAttribute("data-rating"), false);
});

// G1 spec 3, deviation 1. Kills a badge for an unrated post, and one a card can't dim by.
test("RatingBadge marks a rated post and shows nothing for an unrated one", () => {
  const down = inShell(createElement(RatingBadge, { target: { kind: "post", id: "3" }, initial: -1 }));
  assert.equal(down.querySelector("[data-rating]")?.getAttribute("data-rating"), "down");
  assert.equal(down.body.textContent, "Nem hasznos");
  assert.equal(inShell(createElement(RatingBadge, { target: { kind: "post", id: "3" }, initial: null })).body.textContent, "");
});

// Kills the provider check dropped: outside the shell every press would go nowhere, silently.
test("RatingControl outside RatingsProvider throws", () => {
  assert.throws(() => render(createElement(LanguageProvider, hu, createElement(RatingControl, { target: { kind: "item", id: "a" }, initial: null }))), /RatingsProvider/);
});

// 2a spec D4. Kills a 👎 card that also dims: read dims, 👎 dashes, so the two stay apart on sight.
test("dislikedClass only dashes the frame", async () => {
  const { dislikedClass } = await import("./rating-classes.ts");
  assert.equal(dislikedClass, "has-[[data-rating=down]]:border-dashed");
});

// 2a spec D7, final review #2. Kills a press with no motion wrapper (the wrapper is what the shell's
// MotionConfig turns off under reduced motion), and a spring that never plays: a press keys a fresh span, and
// motion skips the mount animation of a span with a plain `initial={false}`; a spring also takes two keyframes
// only, so the pressed span mounts at 0.88 and springs to 1. The static markup can't show the spring (every
// span reads scale 1 or nothing), so the second half pins the source.
test("each rating button wraps its icon in a motion span that springs back from the press", () => {
  const doc = inShell(createElement(RatingControl, { target: { kind: "item", id: "a" }, initial: null }));
  assert.equal(doc.querySelectorAll('[role="group"] button [data-press-motion]').length, 3);
  const source = readFileSync(new URL("./rating-control.tsx", import.meta.url), "utf8");
  const span = source.slice(source.indexOf("<motion.span"), source.indexOf("</motion.span>"));
  assert.match(span, /data-press-motion/);
  assert.match(span, /initial=\{[^}]*\{ scale: 0\.88 \}/);
  assert.doesNotMatch(span, /initial=\{false\}|scale: \[/);
});
