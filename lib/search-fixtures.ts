import type { SearchHit } from "./search.ts";

// Apart from fixtures.ts: the palette loads these in the preview, and that file reaches the block model (zod).

/** The preview's search matches (the palette never calls the real API there): a story, a post and a repo. */
export const previewSearchHits: SearchHit[] = [
  { kind: "item", id: "local-2026-W39-read", title: "Sample story: a local model runs on a laptop", snippet: "A two-sentence summary of the story.", href: "/archive/2026-W39", url: "https://example.test/story", meta: "2026-W39 · example.test" },
  { kind: "post", id: "-1", title: "Sample post: speculative decoding explained", snippet: "What the post says in a line or two.", href: "/library/-1", url: null, meta: "example.test" },
  { kind: "repo", id: "owner/tool", title: "owner/tool", snippet: "A tool that does one thing.", href: "/github", url: "https://github.com/owner/tool", meta: "Rust · 2026-W39" },
];
