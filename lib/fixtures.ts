import { assignIds, type BlockDraft } from "./blocks.ts";
import type { ArchiveIssue, CurrentIssue, DigestItem, GithubTopEntry } from "../data/digest-types.ts";
import type { SubmittedSource } from "./content.ts";
import { publishedLabel } from "./pipeline/util.ts";
import type { Post } from "./post-view.ts";
import type { ReaderData } from "./reader-store.ts";
import { testPost } from "./test/fixtures.ts";

// Sample data for the offline preview (app/dev/preview): every block type, all four post banners,
// long titles and URLs, empty states. Nothing here reaches production: the preview is a 404 there.

/** No break opportunity: the 360px layout has to wrap it, not scroll sideways. */
export const LONG_WORD = "Transzformerarchitektúraoptimalizálásilehetőségvizsgálatijegyzőkönyv";
export const LONG_URL =
  "https://example.test/research/2026/09/a-very-long-path-segment-without-any-natural-break-points-at-all?utm_source=preview&utm_medium=fixture&ref=long-url-check";
export const previewEmail = "preview@example.test";

export function digestItem(id: string, overrides: Partial<DigestItem> = {}): DigestItem {
  return {
    id,
    category: "local",
    score: 70,
    readMinutes: 4,
    publishedAt: "2026-09-21",
    publishedLabel: publishedLabel("2026-09-21"),
    source: "example.test",
    url: `https://example.test/${id}`,
    tags: ["inference", "open-weights"],
    title: { hu: `Minta hír: ${id}`, en: `Sample story: ${id}` },
    summary: {
      hu: "Két mondatos összefoglaló. A második mondat hosszabb, hogy a sortörés is látsszon keskeny kijelzőn.",
      en: "A two-sentence summary. The second sentence runs longer so the line wrap shows on a narrow screen.",
    },
    why: { hu: "Ezért érdemes elolvasni.", en: "Why it is worth reading." },
    ...overrides,
  };
}

export const previewIssue: CurrentIssue = { label: "2026 / W39", updated: "09. 24. 07:00", archiveAt: "09. 27." };

export const previewItems: DigestItem[] = [
  digestItem("research-2026-W39-long-title", {
    mustRead: true,
    category: "research",
    score: 96,
    title: { hu: `${LONG_WORD} a kötelező olvasmányok élén`, en: `${LONG_WORD} tops the must-reads` },
  }),
  digestItem("companies-2026-W39-must-2", { mustRead: true, category: "companies", score: 91 }),
  digestItem("local-2026-W39-must-3", { mustRead: true, score: 88 }),
  digestItem("local-2026-W39-read", { score: 82 }),
  digestItem("local-2026-W39-long-url", {
    score: 77,
    source: LONG_URL,
    url: LONG_URL,
    tags: ["inference", "quantization", "runtime", "serving", "fine-tuning", "training", "agents", "evals"],
  }),
  digestItem("research-2026-W39-plain", { category: "research", score: 64 }),
  digestItem("companies-2026-W39-plain", { category: "companies", score: 58 }),
  digestItem("github-2026-W39-plain", { category: "github", score: 52 }),
];

export const previewGithub: GithubTopEntry[] = [
  ["ggml-org/llama.cpp", "LLM inference in C/C++", "https://github.com/ggml-org/llama.cpp"],
  [`example/${LONG_WORD}`, "Egy nagyon hosszú nevű repó / a repository with a very long name", "https://github.com/example/long"],
];

export const previewArchive: ArchiveIssue[] = [
  { id: "2026-W38", period: "2026 / 09", week: "W38", top: { hu: `${LONG_WORD} a hét élén`, en: `${LONG_WORD} leads the week` }, itemCount: 24, readMinutes: 96 },
  { id: "2026-W37", period: "2026 / 09", week: "W37", top: { hu: "A nyílt súlyú modellek hete", en: "A week of open weights" }, itemCount: 19, readMinutes: 71 },
];

export const previewSources: SubmittedSource[] = [
  { id: 101, url: LONG_URL, kind: "article", status: "pending", error: null, createdAt: "2026-09-24T08:00:00Z" },
  { id: 102, url: "https://example.test/gone", kind: "article", status: "failed", error: "fetch 404", createdAt: "2026-09-23T08:00:00Z" },
];

/** A 1×1 PNG: the only kind of placeholder isValidPlaceholder lets through. */
const PLACEHOLDER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** Every block type once: inline marks, a long link, a code line that must scroll inside its box, both image states. */
const everyBlock: BlockDraft[] = [
  { type: "heading", level: 2, text: "Minden blokktípus" },
  {
    type: "paragraph",
    content: [
      { text: "Normál, " },
      { text: "félkövér", bold: true },
      { text: ", " },
      { text: "dőlt", italic: true },
      { text: ", " },
      { text: "kód", code: true },
      { text: " és " },
      { text: "link", href: "https://example.test/" },
      { text: "." },
    ],
  },
  { type: "paragraph", content: [{ text: "Ez a bekezdés el van rejtve, a „rejtett blokk” sáv mutatja." }] },
  { type: "heading", level: 3, text: "Listák" },
  { type: "list", ordered: false, items: [[{ text: "egy" }], [{ text: "kettő" }]] },
  { type: "list", ordered: true, items: [[{ text: "első" }], [{ text: LONG_URL, href: LONG_URL }]] },
  { type: "heading", level: 4, text: "Idézet és kód" },
  { type: "quote", content: [{ text: "Az idézet szövege, forrásmegjelöléssel." }], cite: "Minta Szerző" },
  { type: "code", language: "ts", code: "const answer = 42; // a long line that has to scroll inside its own box instead of widening the page" },
  { type: "image", originalUrl: "https://example.test/missing.png", alt: "Nem tükrözött kép", path: null },
  {
    type: "image",
    originalUrl: "https://example.test/mirrored.png",
    alt: "Tükrözött kép",
    caption: "Képaláírás",
    path: "1/0123456789abcdef",
    format: "avif",
    widths: [640, 1280],
    width: 1280,
    height: 720,
    placeholder: PLACEHOLDER,
  },
  { type: "video", provider: "youtube", videoId: "dQw4w9WgXcQ" },
  { type: "chapters", items: [{ seconds: 0, title: "Bevezető" }, { seconds: 95, title: "A lényeg" }] },
  { type: "repo", fullName: "ggml-org/llama.cpp", url: "https://github.com/ggml-org/llama.cpp", stars: 81234, language: "C++", topics: ["llm", "inference"], license: "MIT" },
  { type: "divider" },
];

/** On top of testPost (lib/test/fixtures.ts), which fills every Post field: a new field is added there once. */
function post(id: number, overrides: Partial<Post>): Post {
  const title = { hu: `Minta poszt ${id}`, en: `Sample post ${id}` };
  const summary = { hu: "A poszt magyar összefoglalója.", en: "The post's English summary." };
  return testPost({
    id,
    sourceId: id,
    url: `https://example.test/posts/${id}`,
    author: "Minta Szerző",
    siteName: "example.test",
    publishedAt: "2026-09-20",
    title,
    summary,
    generatedTitle: title,
    generatedSummary: summary,
    keyPoints: { hu: ["Első kulcspont", "Második kulcspont"], en: ["First key point", "Second key point"] },
    tags: ["agents", "evals"],
    blocks: assignIds([{ type: "paragraph", content: [{ text: "Rövid törzsszöveg." }] }]),
    meta: { mirrored: true },
    submittedBy: null,
    extractedAt: "2026-09-20T10:00:00Z",
    createdAt: "2026-09-20T10:00:00Z",
    ...overrides,
  });
}

const fullBlocks = assignIds(everyBlock);

// Negative ids: parseId rejects them, so a click in the preview (Translate, a /library link) can never reach a real post.
export const previewPosts: Post[] = [
  post(-1, { title: { hu: LONG_WORD, en: LONG_WORD }, url: LONG_URL, blocks: fullBlocks, hiddenBlocks: [fullBlocks[2].id] }),
  post(-2, { meta: { noarchive: true } }),
  post(-3, { meta: { extractionFailed: true }, blocks: [] }),
  post(-4, { kind: "x", meta: { truncated: true } }),
  post(-5, { kind: "youtube", meta: { mirrored: true, clipped: true } }),
];

/** One read item (sorted to the end of the feed), one saved Top 3 item, a linked to-do, a long one and a done one. */
export const previewReader: ReaderData = {
  states: {
    "local-2026-W39-read": { read: true, saved: false },
    "companies-2026-W39-must-2": { read: false, saved: true },
  },
  todos: [
    { id: 1, itemId: null, text: `Hosszú teendő: ${LONG_WORD}`, done: false },
    { id: 2, itemId: "local-2026-W39-must-3", text: "Minta hír: local-2026-W39-must-3", done: false },
    { id: 3, itemId: null, text: "Kész teendő", done: true },
  ],
};
