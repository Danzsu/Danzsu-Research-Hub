import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds } from "../blocks.ts";
import { writeBriefs } from "./briefs.ts";
import { fakeDb } from "./fake-db.ts";
import { geminiPrompt, geminiResponse, mockFetch, withGeminiKey } from "./mock-fetch.ts";

const now = new Date("2026-11-14T14:30:00Z");
const day = "2026-11-14";
const longText = "A long article paragraph with plenty of real content to summarize. ".repeat(20);
const paragraph = (text: string) => assignIds([{ type: "paragraph", content: [{ text }] }])[0];
const post = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  title: { hu: "Cím", en: `Title ${id}` },
  brief: { hu: [], en: [] },
  blocks: [paragraph(longText)],
  ...extra,
});
const topRow = (rank: number, url: string) => ({ day, rank, item_id: `item-${rank}`, digest_items: { url } });
const source = (url: string, embedded: Record<string, unknown> | null) => ({ id: 1, url, posts: embedded });

// Kills a brief written for a post that has one, for a post too thin to brief, or one request per post.
test("writeBriefs asks once for the Top 10 posts that have text and no brief, and stores each answer in both slots", async (t) => {
  withGeminiKey(t);
  let prompts = 0;
  let prompt = "";
  mockFetch(t, async (_url, init) => {
    prompts++;
    prompt = geminiPrompt(init);
    return geminiResponse({ briefs: [{ id: 7, paragraphs: ["First.", "Second."] }, { id: 999, paragraphs: ["Not ours."] }] });
  });
  const db = fakeDb(undefined, {
    post: { id: 7 }, // the row the fake's posts update lands on
    rows: { daily_top: [topRow(1, "https://blog.test/a"), topRow(2, "https://blog.test/b"), topRow(3, "https://blog.test/c"), topRow(4, "https://blog.test/d")] },
    sources: [
      source("https://blog.test/a", post(7)),
      source("https://blog.test/b", post(8, { brief: { hu: ["done"], en: ["done"] } })),
      source("https://blog.test/c", post(9, { blocks: [paragraph("short")] })),
      source("https://blog.test/d", null),
    ],
  });
  assert.equal(await writeBriefs(db, now), 1);
  assert.equal(prompts, 1);
  assert.match(prompt, /ARTICLE 7: Title 7/);
  assert.doesNotMatch(prompt, /ARTICLE (8|9):/);
  assert.deepEqual(db.postUpdates, [{ brief: { hu: ["First.", "Second."], en: ["First.", "Second."] } }]);
  assert.ok(db.tasks.every((task) => task === "daily_curate"));
});

test("writeBriefs makes no model call when every post already has its brief", async (t) => {
  withGeminiKey(t);
  mockFetch(t, async () => {
    throw new Error("must not call the model");
  });
  const db = fakeDb(undefined, {
    rows: { daily_top: [topRow(1, "https://blog.test/a")] },
    sources: [source("https://blog.test/a", post(7, { brief: { hu: ["x"], en: ["x"] } }))],
  });
  assert.equal(await writeBriefs(db, now), 0);
});

// Kills a model failure that fails the cron: the queue's work is done, the next round tries again.
test("writeBriefs logs a failing model and answers 0 instead of throwing", async (t) => {
  withGeminiKey(t);
  mockFetch(t, async () => geminiResponse("not an object"));
  t.mock.method(console, "warn", () => {});
  const db = fakeDb(undefined, { rows: { daily_top: [topRow(1, "https://blog.test/a")] }, sources: [source("https://blog.test/a", post(7))] });
  assert.equal(await writeBriefs(db, now), 0);
  assert.deepEqual(db.postUpdates, []);
});
