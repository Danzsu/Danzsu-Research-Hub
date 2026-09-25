// Test helper, and the base of the offline preview's posts (lib/fixtures.ts). Not *.test.ts, so `npm test`'s glob skips it as its own suite.

import type { Post } from "../post-view.ts";

const title = { hu: "Cím", en: "Title" };
const summary = { hu: "Összefoglaló", en: "Summary" };

/** A post with no blocks, submitted by "owner"; override the fields a test is about. */
export const testPost = (overrides: Partial<Post> = {}): Post => ({
  id: 7,
  sourceId: 3,
  kind: "article",
  url: "https://blog.test/a",
  author: null,
  siteName: "Blog",
  publishedAt: null,
  title,
  summary,
  generatedTitle: title,
  generatedSummary: summary,
  keyPoints: { hu: [], en: [] },
  tags: [],
  blocks: [],
  blocksHu: null,
  meta: {},
  hiddenBlocks: [],
  submittedBy: "owner",
  lastError: null,
  extractedAt: null,
  createdAt: "2026-09-22T10:00:00Z",
  ...overrides,
});
