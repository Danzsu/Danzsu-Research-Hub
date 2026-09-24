# Egységes poszt-sablon (M1) — megvalósítási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Library-be beküldött minden forrás (cikk, YouTube, arXiv, PDF, GitHub, X) típusos blokkokká alakuljon, zajszűrve, tükrözött AVIF-képekkel, és egyetlen komponens jelenítse meg forrásjelöléssel. Legyen kérésre futó magyar fordítás, és a beküldő tudjon kisebb javításokat végezni.

**Architecture:**
- **Kinyerés:** forrásonként egy kinyerő (`lib/pipeline/extract/*`), mindegyik `Block[]`-et ad vissza. A HTML-alapú források egy közös átalakítón (`html-to-blocks.ts`) mennek át.
- **Feldolgozás:** a `processSource` sorrendje: kinyerés → AI-zajszűrés → korlátok → képtükrözés → összefoglaló → mentés. Csak siker esetén cserél.
- **Megjelenítés:** a `PostBlocks` hook nélküli komponens, így szerver- és kliensoldalon is használható.
- **Képek:** a Supabase Storage privát bucketjéből egy belépéshez kötött route (`/media/...`) szolgálja ki őket.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres + Storage), zod/v4, linkedom, @mozilla/readability, sharp 0.35.4, fast-xml-parser, Gemini/Groq (a meglévő `lib/llm.ts`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-24-unified-post-template-design.md` (ez a terv az M1 mérföldkő; az M2, vagyis az olvasóeszközök, külön tervet kap).

## Global Constraints

- Node `>=22.13.0`. A tesztek `node --experimental-strip-types --test`-tel futnak. A `lib/blocks.ts`, `lib/translate.ts`, `lib/llm.ts` és a `lib/pipeline/**` fájlok **relatív `.ts` importot** használnak, `@/` nélkül.
- Új függőség csak a `sharp`, **pontos verzióval**: `"sharp": "0.35.4"` (már most is a lockfile-ban van a Next.js miatt). Más új csomag nem kerülhet be.
- **Az egyetlen Supabase-projekt az éles adatbázis.** A migráció csak bővíthet (új oszlopok, szélesebb check-ek) addig, amíg az új kód nincs kint. A `posts.body` oszlop csak a 14. feladatban, a deploy után törlődik.
- A DDL-t a felhasználó futtatja a Supabase SQL Editorban. Az implementáló ezt nem tudja megtenni.
- Nyers HTML nem kerülhet az oldalra (`dangerouslySetInnerHTML` tilos). Linkből csak `http:` és `https:` maradhat.
- Minden idegen, felhasználó által megadott URL letöltése a `safeFetch`-en megy (a képeké is). A fix API-hostok (api.github.com, export.arxiv.org, publish.twitter.com, youtube.com/oembed) mehetnek sima `fetch`-csel.
- Modellnév nem kerülhet a kódba, csak a `model_settings` táblába. Új feladatok: `ingest_pdf`, `ingest_cleanup`, `translate_post`.
- Design: `CLAUDE.md` „Design language” és „Responsive rules” szakasz. `--radius` 0, rendszerbetűk, keményen eltolt árnyékok, 360 px-en nincs vízszintes görgetés, legalább 40 px-es érintési felületek.
- A felületi szövegek HU/EN, a kódazonosítók angolok. A commitok Conventional Commits formátumúak, kisbetűs tárggyal, attribúció nélkül.
- Korlátok: 400 blokk / 200 000 karakter; 30 kép × 5 MB; 20 MB PDF; képszélességek 640 és 1280 px; a képek legalább 64 px-esek.
- **Duplikáció (kiemelt cél):** mielőtt segédfüggvényt vagy osztálylistát írsz, keress rá (`grep -rn`), és a meglévőt használd. Közös helyek:
  - `lib/media.ts`: kép-útvonalak
  - `lib/api.ts`: `jsonError`
  - `lib/supabase/server.ts`: `getReader` / `getViewer`
  - `lib/pipeline/util.ts`: `hostOf`, `parseId`, `detectSource`…
  - `lib/pipeline/fetch.ts`: `safeFetch`, `readText`
  - `lib/blocks.ts`: `localizedSchema`, `parseBlocks`
  - `extract/article.ts`: `readPageMeta`
  - UI: a `Button` `ink` / `signal` / `brutal` variánsa, a `focus-ring` utility, a `PageHeader` és a `PageHero`

  Minden feladat végén futtasd: `npm run dup` (jscpd). Az ismétlés legfeljebb 1% lehet, és új klón nem kerülhet be.

## Review Focus

1. **Lusta betöltésű képek** (`data-src`, csak `srcset`, `<picture>`): a kép nem veszhet el. Tesztje: 4. feladat, `lazy images` eset.
2. **Relatív és protokoll-relatív kép-URL-ek** (`../img.png`, `//cdn.x/img.png`, a GitHub README relatív képei): abszolút URL-re kell feloldani. Tesztje: 4. feladat, `resolves relative image URLs`.
3. **Túl hosszú forrás** (több mint 400 blokk vagy 200 000 karakter): levágás `meta.clipped` jelzéssel, összeomlás nélkül. Tesztje: 2. feladat, `limitBlocks clips…`.
4. **A fordítás más span-számmal jön vissza:** az adott blokk egyszerű szövegre esik vissza, és nem dobjuk el az egész fordítást. Tesztje: 12. feladat, `applyTranslation span mismatch`.
5. **Az újrakinyerés elbukik** (a link már nem él): a régi poszt marad, csak a hibaüzenet íródik ki. Tesztje: 9. feladat, `failureUpdate`.

---

## Fájlszerkezet

| Fájl | Felelősség |
| --- | --- |
| `supabase/migrations/20260924000000_post_blocks.sql` | új `posts` oszlopok, `sources.kind`, `model_settings` feladatok, `media` bucket, `update_post_overrides` |
| `lib/blocks.ts` (+ teszt) | blokk zod-séma, típusok, `assignIds`, `safeHref`, `blockText`, `plainText`, `sectionsToBlocks`, `limitBlocks`, `localizedSchema`, `parseBlocks` |
| `lib/pipeline/util.ts` (+ teszt) | `fnv1a`, `detectSource`, `youtubeId`, `arxivId`, `githubRepo`, `xStatusId`, `cooldownRemaining`, `formatTimestamp`, `hostOf`, `parseId` |
| `lib/pipeline/fetch.ts` | `safeFetch`, `readLimited`, `readText`, `FetchError`, `USER_AGENT` (az `ingest.ts`-ből kiemelve) |
| `lib/media.ts` | tiszta kép-útvonal segédek (`variantPath`, `mediaUrl`, `isMediaKey`, `MEDIA_TYPES`); a szerver, a route és a renderer is ezt használja, így a `sharp` nem kerül a kliens bundle-be |
| `lib/api.ts` | `jsonError` a route-okhoz |
| `lib/pipeline/html-to-blocks.ts` (+ teszt) | 1. réteg `cleanDocument`, átalakító, 2. réteg `filterNoise` |
| `lib/pipeline/images.ts` (+ teszt) | `encodeImage`, `mirrorImages`, `imageKey`, `unusedMediaPaths`, `isMediaKey` |
| `lib/pipeline/extract/types.ts` | `Extracted`, `Extractor` |
| `lib/pipeline/extract/article.ts` (+ teszt) | `extractArticle`, `articleFromHtml` |
| `lib/pipeline/extract/github.ts`, `arxiv.ts` (+ teszt) | repo és README; arXiv HTML vagy absztrakt + PDF |
| `lib/pipeline/extract/youtube.ts`, `pdf.ts`, `x.ts` (+ teszt) | videó + fejezetek; PDF a Geminin át; X oEmbed |
| `lib/pipeline/extract/index.ts` | `extract()` visszaesési lánccal, `metadataOnly` |
| `lib/pipeline/summary.ts` | `summarySchema`, `summarize`, `writeNotes` |
| `lib/pipeline/cleanup.ts` (+ teszt) | 3. réteg: `aiCleanup`, `applyCleanup` |
| `lib/pipeline/ingest.ts` (+ teszt) | `processSource`, `failureUpdate`, `removeUnusedMedia`, `retryPendingSources` |
| `lib/translate.ts` (+ teszt) | `translatable`, `applyTranslation`, `chunkTranslatable`, `translationSchema` |
| `lib/llm.ts` | `pdfBase64` bemenet, új `Task`-ok |
| `lib/content.ts` | `Post` típus: blokkok, `meta`, `overrides`, beküldő |
| `app/media/[...path]/route.ts` | belépéshez kötött képkiszolgálás |
| `app/components/post-blocks.tsx` | a renderer |
| `app/library/[id]/page.tsx`, `post-toolbar.tsx`, `post-editor.tsx` | a poszt oldal, az eszközsor, a szerkesztő |
| `app/library/page.tsx` | kártyák: `overrides`, típus-ikon |
| `app/api/posts/[id]/route.ts`, `translate/route.ts`, `reextract/route.ts` | kis javítások, fordítás, újrakinyerés |
| `app/api/sources/route.ts`, `app/api/state/route.ts` | `detectSource`; `getReader` + `jsonError` |
| `components/ui/button.tsx`, `app/globals.css`, `app/components/page-header.tsx` | közös UI: `ink` / `signal` / `brutal` gombvariáns, `focus-ring` utility, `PageHero` |
| `scripts/ingest-url.mts` | fejlesztői eszköz: egy URL feldolgozása helyben (`npm run ingest -- <url>`) |

---

### Task 1: Adatbázis-migráció (bővítő)

**Files:**
- Create: `supabase/migrations/20260924000000_post_blocks.sql`

**Interfaces:**
- Produces:
  - `posts` oszlopok: `blocks jsonb`, `blocks_hu jsonb`, `meta jsonb`, `source_site text`, `published_at date`, `overrides jsonb`, `hidden_blocks text[]`, `extracted_at timestamptz`
  - `sources.kind` ∈ `article|youtube|arxiv|github|x|pdf`
  - `model_settings` feladatok: `ingest_pdf`, `ingest_cleanup`, `translate_post`
  - bucket: `media`
  - RPC: `update_post_overrides(p_post bigint, p_overrides jsonb, p_hidden text[])`

- [ ] **Step 1: A migráció megírása**

```sql
-- M1 of the unified post template. Additive only: the running app still
-- reads posts.body, which is dropped in a later migration after deploy.

alter table public.posts
  add column blocks jsonb not null default '[]',
  add column blocks_hu jsonb,
  add column meta jsonb not null default '{}',
  add column source_site text,
  add column published_at date,
  add column overrides jsonb not null default '{}',
  add column hidden_blocks text[] not null default '{}',
  add column extracted_at timestamptz;

alter table public.sources drop constraint sources_kind_check;
alter table public.sources add constraint sources_kind_check
  check (kind in ('article', 'youtube', 'arxiv', 'github', 'x', 'pdf'));

alter table public.posts drop constraint posts_kind_check;
alter table public.posts add constraint posts_kind_check
  check (kind in ('article', 'youtube', 'arxiv', 'github', 'x', 'pdf'));

alter table public.model_settings drop constraint model_settings_task_check;
alter table public.model_settings add constraint model_settings_task_check
  check (task in ('daily_shortlist', 'daily_curate', 'ingest_article', 'ingest_video',
                  'ingest_pdf', 'ingest_cleanup', 'translate_post'));

insert into public.model_settings (task, provider, model, fallback_provider, fallback_model) values
  ('ingest_pdf',     'gemini', 'gemini-3.8-flash',        'gemini', 'gemini-3.7-flash'),
  ('ingest_cleanup', 'groq',   'llama-3.3-70b-versatile', 'gemini', 'gemini-3.5-flash-lite'),
  ('translate_post', 'gemini', 'gemini-3.5-flash-lite',   'gemini', 'gemini-3.8-flash');

-- Private: images are served by the app's /media route after a session check.
insert into storage.buckets (id, name, public) values ('media', 'media', false)
on conflict (id) do nothing;

-- RLS cannot restrict columns, so edits to shared posts go through this check.
create function public.update_post_overrides(p_post bigint, p_overrides jsonb, p_hidden text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.posts p
    join public.sources s on s.id = p.source_id
    where p.id = p_post and s.submitted_by = (select auth.uid())
  ) then
    raise exception 'only the submitter can edit this post' using errcode = '42501';
  end if;
  update public.posts
  set overrides = coalesce(p_overrides, '{}'::jsonb), hidden_blocks = coalesce(p_hidden, '{}')
  where id = p_post;
end;
$$;
revoke execute on function public.update_post_overrides(bigint, jsonb, text[]) from public, anon;
grant execute on function public.update_post_overrides(bigint, jsonb, text[]) to authenticated;
```

- [ ] **Step 2: Ellenőrzés, hogy a check-ek nevei stimmelnek**

A Postgres a névtelen check-eket `<tábla>_<oszlop>_check` néven hozza létre (a `20260923000000_init.sql` és a `20260923010000_model_settings.sql` szerint `sources_kind_check`, `posts_kind_check`, `model_settings_task_check`). A felhasználónak ezt a lekérdezést kell futtatnia az SQL Editorban:

```sql
select conrelid::regclass, conname from pg_constraint
where conname in ('sources_kind_check', 'posts_kind_check', 'model_settings_task_check');
```

Elvárt: 3 sor. Ha egy név eltér, a migrációban azt kell használni.

- [ ] **Step 3: A felhasználó lefuttatja a migrációt**

Kérd meg a felhasználót, hogy illessze be a fájlt az SQL Editorba, és nyomjon Run-t. Utána ellenőrzés:

```sql
select column_name from information_schema.columns where table_name = 'posts' and column_name in ('blocks','meta','overrides','hidden_blocks');
select id, public from storage.buckets where id = 'media';
select task from public.model_settings order by task;
```

Elvárt: 4 oszlop; `media | false`; 7 feladat.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260924000000_post_blocks.sql
git commit -m "feat(db): add block columns, source kinds and the media bucket"
```

---

### Task 2: Blokkmodell (`lib/blocks.ts`) és a tesztminta bővítése

**Files:**
- Create: `lib/blocks.ts`, `lib/blocks.test.ts`
- Modify: `lib/pipeline/util.ts` (`fnv1a` kiemelése), `lib/pipeline/daily.ts` (`localizedSchema`), `package.json` (`test` és `dup` script)

**Interfaces:**
- Consumes: semmi
- Produces:
  - `inlineSchema`, `blockSchema`, `blocksSchema`
  - `type Inline`, `type Block`, `type BlockDraft`, `type ImageBlock`
  - `assignIds(drafts: BlockDraft[]): Block[]`
  - `safeHref(raw: string | null | undefined, base: string): string | undefined`
  - `inlineText(spans: Inline[]): string`, `blockText(block: BlockDraft): string`, `plainText(blocks: BlockDraft[]): string`
  - `sectionsToBlocks(sections: { heading: string; points: string[] }[]): BlockDraft[]`
  - `withoutIds(blocks: Block[]): BlockDraft[]`
  - `limitBlocks(blocks: Block[], maxBlocks?: number, maxChars?: number): { blocks: Block[]; clipped: boolean }`
  - `localizedSchema` (zod `{ hu, en }`), `parseBlocks(value: unknown): Block[]`
  - `util.ts`: `fnv1a(text: string): string` (8 hex jegy)

- [ ] **Step 1: A teszt megírása**

`lib/blocks.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds, blockSchema, limitBlocks, parseBlocks, plainText, safeHref, sectionsToBlocks, type BlockDraft } from "./blocks.ts";
import { itemId, isoWeek, shortHash } from "./pipeline/util.ts";

const p = (text: string): BlockDraft => ({ type: "paragraph", content: [{ text }] });

test("assignIds is content-derived: inserting a block does not change the others", () => {
  const before = assignIds([p("alpha"), p("beta")]);
  const after = assignIds([p("intro"), p("alpha"), p("beta")]);
  assert.equal(after[1].id, before[0].id);
  assert.equal(after[2].id, before[1].id);
});

test("assignIds suffixes repeated identical blocks", () => {
  const ids = assignIds([p("same"), p("same"), p("same")]).map((b) => b.id);
  assert.equal(new Set(ids).size, 3);
  assert.match(ids[1], /-2$/);
  assert.match(ids[2], /-3$/);
});

test("safeHref keeps only http(s) and resolves relative links", () => {
  assert.equal(safeHref("/a?b=1", "https://site.test/post/"), "https://site.test/a?b=1");
  assert.equal(safeHref("//cdn.test/x", "https://site.test/"), "https://cdn.test/x");
  assert.equal(safeHref("javascript:alert(1)", "https://site.test/"), undefined);
  assert.equal(safeHref("mailto:a@b.c", "https://site.test/"), undefined);
  assert.equal(safeHref("", "https://site.test/"), undefined);
});

test("blocks round-trip through the schema", () => {
  for (const block of assignIds([
    p("text"),
    { type: "heading", level: 2, text: "H" },
    { type: "list", ordered: false, items: [[{ text: "a", href: "https://x.test/" }]] },
    { type: "code", language: "ts", code: "let a = 1;" },
    { type: "image", originalUrl: "https://x.test/a.png", alt: "", path: null },
    { type: "video", provider: "youtube", videoId: "dQw4w9WgXcQ" },
    { type: "divider" },
  ])) {
    assert.deepEqual(blockSchema.parse(block), block);
  }
});

test("sectionsToBlocks and plainText", () => {
  const drafts = sectionsToBlocks([{ heading: "Findings", points: ["one", "two"] }]);
  assert.equal(drafts[0].type, "heading");
  assert.equal(plainText(drafts), "Findings\n\none\ntwo");
});

test("limitBlocks clips by count and by characters", () => {
  const many = assignIds(Array.from({ length: 450 }, (_, i) => p(`para ${i}`)));
  assert.equal(limitBlocks(many).blocks.length, 400);
  assert.equal(limitBlocks(many).clipped, true);
  const long = assignIds([p("x".repeat(150_000)), p("y".repeat(100_000)), p("z")]);
  const limited = limitBlocks(long);
  assert.equal(limited.blocks.length, 1);
  assert.equal(limited.clipped, true);
  assert.equal(limitBlocks(assignIds([p("short")])).clipped, false);
});

test("parseBlocks turns bad stored data into an empty list instead of throwing", () => {
  assert.deepEqual(parseBlocks([{ id: "x", type: "nope" }]), []);
  assert.deepEqual(parseBlocks(null), []);
  const valid = assignIds([p("ok")]);
  assert.deepEqual(parseBlocks(valid), valid);
});

test("fnv1a refactor keeps existing digest item ids unchanged", () => {
  // Pinned value: ids are primary keys in item_states and must never change.
  const week = isoWeek(new Date("2026-09-23T00:00:00Z"));
  assert.equal(shortHash("https://a.example/1"), "a42106");
  assert.equal(itemId("research", week, "Title", "https://a.example/1"), "research-2026w39-title-a42106");
});
```

- [ ] **Step 2: A teszt futtatása, el kell buknia**

A `package.json`-ban a `test` script legyen:

```json
"test": "node --experimental-strip-types --no-warnings --test \"lib/**/*.test.ts\"",
"dup": "npx -y jscpd@4.3.0 app lib scripts proxy.ts --min-lines 6 --min-tokens 60 --threshold 1 --reporters console"
```

Futtatás: `npm test`
Elvárt: FAIL, `Cannot find module '.../lib/blocks.ts'`.

- [ ] **Step 3: Az `fnv1a` kiemelése a `lib/pipeline/util.ts`-ben**

A meglévő `shortHash`-t cseréld erre (az eredmény bitre azonos, mert az `fnv1a` első 6 jegye):

```ts
/** FNV-1a as 8 hex chars. Not for security; only for stable, content-derived ids. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 6 hex chars of fnv1a. ⚠️ Feeds digest item ids — never change its output. */
export function shortHash(text: string): string {
  return fnv1a(text).slice(0, 6);
}
```

- [ ] **Step 4: A `lib/blocks.ts` megírása**

```ts
import { z } from "zod/v4";
import { fnv1a } from "./pipeline/util.ts";

// The one content model every source is converted into and every post is rendered from.

export const inlineSchema = z.object({
  text: z.string(),
  href: z.string().optional(),
  bold: z.literal(true).optional(),
  italic: z.literal(true).optional(),
  code: z.literal(true).optional(),
});
export type Inline = z.infer<typeof inlineSchema>;

/** Text that exists in both site languages; the zod twin of `Localized` in data/digest-types.ts. */
export const localizedSchema = z.object({ hu: z.string(), en: z.string() });

const id = z.string();

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3), z.literal(4)]), text: z.string() }),
  z.object({ id, type: z.literal("paragraph"), content: z.array(inlineSchema) }),
  z.object({ id, type: z.literal("list"), ordered: z.boolean(), items: z.array(z.array(inlineSchema)) }),
  z.object({ id, type: z.literal("quote"), content: z.array(inlineSchema), cite: z.string().optional() }),
  z.object({ id, type: z.literal("code"), language: z.string().optional(), code: z.string() }),
  z.object({
    id,
    type: z.literal("image"),
    originalUrl: z.string(),
    alt: z.string(),
    caption: z.string().optional(),
    /** Storage key without width/extension; null when the image could not be mirrored. */
    path: z.string().nullable(),
    format: z.enum(["avif", "webp", "svg"]).optional(),
    widths: z.array(z.number()).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    placeholder: z.string().optional(),
  }),
  z.object({ id, type: z.literal("video"), provider: z.enum(["youtube", "vimeo"]), videoId: z.string(), start: z.number().optional() }),
  z.object({ id, type: z.literal("chapters"), items: z.array(z.object({ seconds: z.number(), title: z.string() })) }),
  z.object({
    id,
    type: z.literal("repo"),
    fullName: z.string(),
    url: z.string(),
    stars: z.number(),
    language: z.string().optional(),
    topics: z.array(z.string()),
    license: z.string().optional(),
  }),
  z.object({ id, type: z.literal("divider") }),
]);
export const blocksSchema = z.array(blockSchema);

export type Block = z.infer<typeof blockSchema>;
export type ImageBlock = Extract<Block, { type: "image" }>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A block before `assignIds`; extractors build these. */
export type BlockDraft = DistributiveOmit<Block, "id">;

/** Stored JSON → blocks. Bad data renders as an empty post instead of crashing the page. */
export const parseBlocks = (value: unknown): Block[] => blocksSchema.catch([]).parse(value ?? []);

export function safeHref(raw: string | null | undefined, base: string): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const inlineText = (spans: Inline[]) => spans.map((span) => span.text).join("");

export function blockText(block: BlockDraft): string {
  switch (block.type) {
    case "heading":
      return block.text;
    case "paragraph":
    case "quote":
      return inlineText(block.content);
    case "list":
      return block.items.map(inlineText).join("\n");
    case "code":
      return block.code;
    case "image":
      return [block.alt, block.caption].filter(Boolean).join(" ");
    case "chapters":
      return block.items.map((item) => item.title).join("\n");
    case "repo":
      return block.fullName;
    default:
      return "";
  }
}

export const plainText = (blocks: BlockDraft[]) => blocks.map(blockText).filter(Boolean).join("\n\n");

function identity(block: BlockDraft): string {
  if (block.type === "image") return block.originalUrl;
  if (block.type === "video") return `${block.provider}:${block.videoId}`;
  return blockText(block).normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Ids come from type + content, not position, so re-extraction keeps them:
 * hidden blocks and (in M2) highlights reference these.
 */
export function assignIds(drafts: BlockDraft[]): Block[] {
  const seen = new Map<string, number>();
  return drafts.map((draft) => {
    const base = `${draft.type.slice(0, 1)}${fnv1a(`${draft.type}\u0000${identity(draft)}`)}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { ...draft, id: count === 1 ? base : `${base}-${count}` } as Block;
  });
}

export const withoutIds = (blocks: Block[]): BlockDraft[] =>
  blocks.map(({ id: _id, ...draft }) => draft as BlockDraft);

export function sectionsToBlocks(sections: { heading: string; points: string[] }[]): BlockDraft[] {
  return sections.flatMap((section): BlockDraft[] => [
    { type: "heading", level: 2, text: section.heading },
    { type: "list", ordered: false, items: section.points.map((point) => [{ text: point }]) },
  ]);
}

export function limitBlocks(blocks: Block[], maxBlocks = 400, maxChars = 200_000): { blocks: Block[]; clipped: boolean } {
  const kept: Block[] = [];
  let chars = 0;
  for (const block of blocks) {
    chars += blockText(block).length;
    if (kept.length >= maxBlocks || (chars > maxChars && kept.length > 0)) return { blocks: kept, clipped: true };
    kept.push(block);
  }
  return { blocks: kept, clipped: false };
}
```

- [ ] **Step 5: A `daily.ts` átállítása a közös sémára**

A `lib/pipeline/daily.ts`-ben töröld a helyi `localized` zod-objektumot. Importáld: `import { localizedSchema } from "../blocks.ts";`, és a `curatedSchema` három `localized` hivatkozását cseréld `localizedSchema`-ra.

- [ ] **Step 6: A tesztek futtatása, át kell menniük**

Futtatás: `npm test` → Elvárt: minden PASS, a régi `util.test.ts` is.
Futtatás: `npx tsc --noEmit` → Elvárt: nincs kimenet.

- [ ] **Step 7: Commit**

```bash
git add lib/blocks.ts lib/blocks.test.ts lib/pipeline/util.ts lib/pipeline/daily.ts package.json
git commit -m "feat: add the typed content block model"
```

---

### Task 3: Forrásfelismerés, URL- és API-segédek

**Files:**
- Create: `lib/api.ts`
- Modify: `lib/pipeline/util.ts`, `lib/pipeline/util.test.ts`, `lib/supabase/server.ts`, `app/api/sources/route.ts`, `app/api/state/route.ts`

**Interfaces:**
- Consumes: semmi új
- Produces:
  - `type SourceKind = "article" | "youtube" | "arxiv" | "github" | "x" | "pdf"`
  - `detectSource(url: URL): SourceKind`
  - `youtubeId(url: URL): string | null`, `arxivId(url: URL): string | null`, `githubRepo(url: URL): { owner: string; repo: string } | null`, `xStatusId(url: URL): string | null`
  - `cooldownRemaining(extractedAt: string | null, now: Date, minutes?: number): number` (másodperc)
  - `formatTimestamp(seconds: number): string`
  - `hostOf(url: string): string`, `parseId(raw: string): number | null`
  - `lib/supabase/server.ts`: `getReader(): Promise<{ db: SupabaseClient; viewer: Viewer } | null>`; a `getViewer` erre épül
  - `lib/api.ts`: `jsonError(status: number, error: string, extra?: Record<string, unknown>): NextResponse`
  - a `sourceKind` megszűnik

- [ ] **Step 1: A tesztek bővítése** (`lib/pipeline/util.test.ts`)

Az importban cseréld a `sourceKind`-ot: `detectSource, youtubeId, arxivId, githubRepo, xStatusId, cooldownRemaining, formatTimestamp, hostOf, parseId`. A régi `sourceKind and publishedLabel` tesztet cseréld erre:

```ts
test("detectSource and its URL helpers", () => {
  const kind = (u: string) => detectSource(new URL(u));
  assert.equal(kind("https://youtu.be/dQw4w9WgXcQ?si=abc"), "youtube");
  assert.equal(kind("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), "youtube");
  assert.equal(kind("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "youtube");
  assert.equal(kind("https://www.youtube.com/@channel"), "article");
  assert.equal(kind("https://arxiv.org/abs/2401.00001v2"), "arxiv");
  assert.equal(kind("https://arxiv.org/pdf/2401.00001"), "arxiv");
  assert.equal(kind("https://arxiv.org/html/2401.00001v1/"), "arxiv");
  assert.equal(kind("https://github.com/ggml-org/llama.cpp"), "github");
  assert.equal(kind("https://github.com/ggml-org/llama.cpp/tree/master/docs"), "github");
  assert.equal(kind("https://github.com/ggml-org/llama.cpp/issues/1"), "article");
  assert.equal(kind("https://github.com/topics/llm"), "article");
  assert.equal(kind("https://x.com/karpathy/status/1886192184808149383"), "x");
  assert.equal(kind("https://twitter.com/a/status/123"), "x");
  assert.equal(kind("https://site.test/paper.PDF"), "pdf");
  assert.equal(kind("https://blog.test/post"), "article");
  assert.equal(youtubeId(new URL("https://youtu.be/dQw4w9WgXcQ")), "dQw4w9WgXcQ");
  assert.equal(youtubeId(new URL("https://youtube.com/watch?v=short")), null);
  assert.equal(arxivId(new URL("https://arxiv.org/abs/2401.00001v2")), "2401.00001");
  assert.deepEqual(githubRepo(new URL("https://github.com/a/b.git")), { owner: "a", repo: "b" });
  assert.equal(xStatusId(new URL("https://x.com/a/status/42?s=20")), "42");
});

test("cooldownRemaining and formatTimestamp", () => {
  const now = new Date("2026-09-24T10:00:00Z");
  assert.equal(cooldownRemaining(null, now), 0);
  assert.equal(cooldownRemaining("2026-09-24T09:55:00Z", now), 300);
  assert.equal(cooldownRemaining("2026-09-24T09:40:00Z", now), 0);
  assert.equal(formatTimestamp(65), "1:05");
  assert.equal(formatTimestamp(3725), "1:02:05");
});

test("hostOf and parseId", () => {
  assert.equal(hostOf("https://www.blog.test/a"), "blog.test");
  assert.equal(parseId("42"), 42);
  for (const bad of ["", "0", "4.2", "-1", "abc", "1e3", "12345678901234567"]) assert.equal(parseId(bad), null, bad);
});

test("publishedLabel", () => {
  assert.equal(publishedLabel("2026-09-22"), "09 / 22");
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `npm test` → Elvárt: FAIL, `detectSource is not a function` (vagy SyntaxError, mert az export hiányzik).

- [ ] **Step 3: Megvalósítás** (`lib/pipeline/util.ts`)

A `sourceKind` függvényt töröld, és ezt írd be a helyére:

```ts
export type SourceKind = "article" | "youtube" | "arxiv" | "github" | "x" | "pdf";

export function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null | undefined = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v") ?? /^\/(?:shorts|embed|live)\/([\w-]+)/.exec(url.pathname)?.[1];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

export function arxivId(url: URL): string | null {
  if (!/(^|\.)arxiv\.org$/.test(url.hostname)) return null;
  const match = /^\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?(?:\.pdf)?\/?$/i.exec(url.pathname);
  return match?.[1] ?? null;
}

const GITHUB_RESERVED = new Set(["orgs", "topics", "features", "settings", "marketplace", "sponsors", "about", "search", "explore"]);

export function githubRepo(url: URL): { owner: string; repo: string } | null {
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
  const [owner, repo, section] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo || GITHUB_RESERVED.has(owner) || (section && section !== "tree")) return null;
  return { owner, repo: repo.replace(/\.git$/, "") };
}

export function xStatusId(url: URL): string | null {
  const host = url.hostname.replace(/^(www|mobile)\./, "");
  if (host !== "x.com" && host !== "twitter.com") return null;
  return /^\/[^/]+\/status\/(\d+)/.exec(url.pathname)?.[1] ?? null;
}

/** Which extractor handles a submitted link. PDFs served without a .pdf path are caught later by content type. */
export function detectSource(url: URL): SourceKind {
  if (youtubeId(url)) return "youtube";
  if (arxivId(url)) return "arxiv";
  if (githubRepo(url)) return "github";
  if (xStatusId(url)) return "x";
  if (/\.pdf$/i.test(url.pathname)) return "pdf";
  return "article";
}

/** Seconds until a post may be re-extracted again. */
export function cooldownRemaining(extractedAt: string | null, now: Date, minutes = 10): number {
  if (!extractedAt) return 0;
  const ready = new Date(extractedAt).getTime() + minutes * 60_000;
  return Math.max(0, Math.ceil((ready - now.getTime()) / 1000));
}

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(Math.floor(seconds % 60)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** Route and page ids: positive integers only. */
export const parseId = (raw: string): number | null => (/^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : null);
```

- [ ] **Step 4: Közös API-segédek és a route-ok átállítása**

`lib/api.ts`:

```ts
import { NextResponse } from "next/server";

export const jsonError = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status });
```

`lib/supabase/server.ts`: a meglévő `getViewer`-t cseréld erre a párosra:

```ts
/** The signed-in reader's client, or null: the one auth check every API route starts with. */
export async function getReader(): Promise<{ db: Awaited<ReturnType<typeof createClient>>; viewer: Viewer } | null> {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;
  return claims?.sub ? { db, viewer: { id: claims.sub, email: String(claims.email ?? "") } } : null;
}

export async function getViewer(): Promise<Viewer | null> {
  return (await getReader())?.viewer ?? null;
}
```

`app/api/sources/route.ts`:

```ts
import { after, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { processSource } from "@/lib/pipeline/ingest";
import { detectSource, parseSubmittedUrl } from "@/lib/pipeline/util";
import { createAdminClient, getReader } from "@/lib/supabase/server";

export const maxDuration = 300;

export async function POST(request: Request) {
  const reader = await getReader();
  if (!reader) return jsonError(401, "unauthorized");

  const body = (await request.json().catch(() => ({}))) as { url?: unknown; note?: unknown };
  const url = parseSubmittedUrl(String(body.url ?? ""));
  if (!url) return jsonError(400, "invalid_url");
  const note = String(body.note ?? "").trim().slice(0, 500) || null;

  // Inserted as the reader (RLS stamps submitted_by); processed with the admin client.
  const { data, error } = await reader.db
    .from("sources")
    .insert({ url: url.toString(), kind: detectSource(url), note })
    .select("id")
    .single();
  if (error?.code === "23505") return jsonError(409, "already_submitted");
  if (error || !data) return jsonError(500, "insert_failed");

  // Respond now; the summary takes a while. A killed run is picked up by the daily cron.
  after(() => processSource(createAdminClient(), data.id));
  return NextResponse.json({ ok: true, id: data.id }, { status: 202 });
}
```

`app/api/state/route.ts`:
- A helyi `reader()`, `unauthorized` és `failed` függvény helyett: `import { jsonError } from "@/lib/api";`, `import { getReader } from "@/lib/supabase/server";` és `const failed = () => jsonError(500, "db_error");`.
- A `GET` és a `POST` eleje: `const reader = await getReader(); if (!reader) return jsonError(401, "unauthorized"); const db = reader.db;`.
- Minden `NextResponse.json({ error: X }, { status: N })` hívás legyen `jsonError(N, X)`.

- [ ] **Step 5: Ellenőrzés**

Futtatás: `npm test` → PASS. Futtatás: `npx tsc --noEmit`. Elvárt: csak az `ingest.ts`-ben lehet hiba, ha még a `sourceKind`-ot importálja. Ha így van, ott is cseréld `detectSource`-ra; az `ingest.ts` a 9. feladatban amúgy is újraíródik.

- [ ] **Step 6: Commit**

```bash
git add lib/api.ts lib/supabase/server.ts lib/pipeline/util.ts lib/pipeline/util.test.ts app/api/sources/route.ts app/api/state/route.ts
git commit -m "feat: detect arxiv, github, x and pdf sources; share api auth helpers"
```

---

### Task 4: HTML→blokk átalakító, 1. és 2. zajszűrő réteg

**Files:**
- Create: `lib/pipeline/html-to-blocks.ts`, `lib/pipeline/html-to-blocks.test.ts`

**Interfaces:**
- Consumes: `BlockDraft`, `Block`, `Inline`, `safeHref`, `blockText`, `inlineText`, `assignIds` (2. feladat)
- Produces:
  - `type HtmlToBlocksOptions = { baseUrl: string; imageBaseUrl?: string }`
  - `cleanDocument(root: Element): void`
  - `htmlToDrafts(html: string, options: HtmlToBlocksOptions): BlockDraft[]`
  - `htmlToBlocks(html: string, options: HtmlToBlocksOptions): Block[]`
  - `filterNoise(blocks: BlockDraft[], baseUrl: string): BlockDraft[]`

- [ ] **Step 1: A tesztek megírása**

`lib/pipeline/html-to-blocks.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { htmlToBlocks, htmlToDrafts } from "./html-to-blocks.ts";
import type { BlockDraft } from "../blocks.ts";

const base = { baseUrl: "https://blog.test/posts/one" };
const types = (blocks: BlockDraft[]) => blocks.map((b) => b.type);

test("converts headings, paragraphs with inline marks, lists, quotes and code", () => {
  const blocks = htmlToDrafts(
    `<h1>Title</h1><p>Plain <strong>bold</strong> <em>it</em> <code>x()</code> <a href="/doc">doc</a>.</p>
     <ul><li>one</li><li>two <a href="https://ext.test/">ext</a></li></ul>
     <blockquote><p>Quoted</p></blockquote>
     <pre><code class="language-ts">const a = 1;\nconst b = 2;</code></pre><hr><h4>Small</h4>`,
    base,
  );
  assert.deepEqual(types(blocks), ["heading", "paragraph", "list", "quote", "code", "divider", "heading"]);
  const paragraph = blocks[1] as Extract<BlockDraft, { type: "paragraph" }>;
  assert.deepEqual(paragraph.content, [
    { text: "Plain " }, { text: "bold", bold: true }, { text: " " }, { text: "it", italic: true }, { text: " " },
    { text: "x()", code: true }, { text: " " }, { text: "doc", href: "https://blog.test/doc" }, { text: "." },
  ]);
  const code = blocks[4] as Extract<BlockDraft, { type: "code" }>;
  assert.equal(code.language, "ts");
  assert.equal(code.code, "const a = 1;\nconst b = 2;");
  assert.equal((blocks[6] as Extract<BlockDraft, { type: "heading" }>).level, 4);
});

test("figures become images with captions; images inside paragraphs are hoisted", () => {
  const blocks = htmlToDrafts(
    `<figure><img src="/img/a.png" alt="Chart" width="800" height="400"><figcaption>Figure 1</figcaption></figure>
     <p>Before <img src="https://cdn.test/b.jpg" alt=""> after</p>`,
    base,
  );
  assert.deepEqual(types(blocks), ["image", "paragraph", "image"]);
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://blog.test/img/a.png");
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).caption, "Figure 1");
});

test("lazy images: data-src, srcset and picture", () => {
  const blocks = htmlToDrafts(
    `<img src="data:image/gif;base64,R0lGOD" data-src="/lazy.png" alt="a">
     <img srcset="/s-480.jpg 480w, /s-1200.jpg 1200w" alt="b">
     <picture><source srcset="/p.avif"><img src="/p.jpg" alt="c"></picture>`,
    base,
  );
  assert.deepEqual(
    blocks.map((b) => (b as Extract<BlockDraft, { type: "image" }>).originalUrl),
    ["https://blog.test/lazy.png", "https://blog.test/s-1200.jpg", "https://blog.test/p.jpg"],
  );
});

test("resolves relative image URLs against imageBaseUrl", () => {
  const blocks = htmlToDrafts(`<p><img src="docs/shot.png" alt=""></p><img src="//cdn.test/x.png" alt="">`, {
    baseUrl: "https://github.com/a/b/blob/main/",
    imageBaseUrl: "https://raw.githubusercontent.com/a/b/main/",
  });
  assert.equal((blocks[0] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://raw.githubusercontent.com/a/b/main/docs/shot.png");
  assert.equal((blocks[1] as Extract<BlockDraft, { type: "image" }>).originalUrl, "https://cdn.test/x.png");
});

test("layer 1 removes chrome and noise containers but never the article", () => {
  const blocks = htmlToDrafts(
    `<nav>Menu</nav><div class="ad-slot">Buy now</div><div id="newsletter-box"><p>Join 10k readers</p></div>
     <div data-ad-unit="x"><p>Promo</p></div><aside>Side</aside><footer>Foot</footer>
     <div class="social-share"><a href="https://twitter.com/intent/tweet">Tweet</a></div>
     <iframe src="https://ads.test/frame"></iframe>
     <div class="post-share-enabled"><p>${"Real article text. ".repeat(100)}</p></div>`,
    base,
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "paragraph");
});

test("layer 2 drops icons, tracking pixels, share links, boilerplate and duplicates", () => {
  const blocks = htmlToDrafts(
    `<p>Keep this sentence about models.</p><p>Keep this sentence about models.</p>
     <img src="/static/logo.svg" alt=""><img src="/x.png" width="1" height="1" alt="">
     <img src="https://img.shields.io/badge/build-passing-green" alt="">
     <p><a href="https://www.facebook.com/sharer/sharer.php?u=x">Share on Facebook</a></p>
     <p>Subscribe to our newsletter</p><h2>Related articles</h2>
     <p><a href="/next">Next post</a></p><p><a href="https://arxiv.org/abs/1">Read the paper</a></p>
     <p><a href="javascript:alert(1)">bad</a> link text here stays</p>`,
    base,
  );
  assert.deepEqual(types(blocks), ["paragraph", "paragraph", "paragraph"]);
  const last = blocks[2] as Extract<BlockDraft, { type: "paragraph" }>;
  assert.equal(last.content.some((s) => s.href), false);
  assert.equal((blocks[1] as Extract<BlockDraft, { type: "paragraph" }>).content[0].href, "https://arxiv.org/abs/1");
});

test("math keeps its alttext, youtube iframes become video blocks, tables become lists", () => {
  const blocks = htmlToDrafts(
    `<p>Energy <math alttext="E=mc^2"><mi>E</mi></math> holds.</p>
     <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
     <table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>`,
    base,
  );
  assert.deepEqual(types(blocks), ["paragraph", "video", "list"]);
  assert.deepEqual((blocks[0] as Extract<BlockDraft, { type: "paragraph" }>).content[1], { text: "E=mc^2", code: true });
  assert.equal((blocks[1] as Extract<BlockDraft, { type: "video" }>).videoId, "dQw4w9WgXcQ");
  assert.equal((blocks[2] as Extract<BlockDraft, { type: "list" }>).items.length, 2);
});

test("htmlToBlocks assigns ids", () => {
  const blocks = htmlToBlocks("<p>a</p><p>b</p>", base);
  assert.ok(blocks.every((b) => typeof b.id === "string" && b.id.length > 0));
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `npm test` → Elvárt: FAIL, `Cannot find module .../html-to-blocks.ts`.

- [ ] **Step 3: A megvalósítás** (`lib/pipeline/html-to-blocks.ts`)

```ts
import { parseHTML } from "linkedom";
import { assignIds, blockText, inlineText, safeHref, type Block, type BlockDraft, type Inline } from "../blocks.ts";

export type HtmlToBlocksOptions = { baseUrl: string; imageBaseUrl?: string };

// ── Layer 1: structural and named noise, removed before conversion ──────────

const DROP = [
  "script", "style", "noscript", "template", "form", "button", "input", "select", "textarea",
  "nav", "aside", "footer", "svg", "canvas",
  "[role=navigation]", "[role=banner]", "[role=complementary]", "[aria-hidden=true]",
].join(", ");
const NOISE_NAME = /(^|[-_])(ad|ads|adv|advert\w*|sponsor\w*|promo\w*|newsletter\w*|subscribe\w*|share\w*|sharing|social\w*|related\w*|comments?|cookie\w*|popup\w*|modal\w*|banner\w*|paywall\w*|outbrain|taboola)([-_]|$)/i;
const VIDEO_IFRAME = /^https?:\/\/(www\.)?(youtube(-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/)/i;
/** Noise boxes are small; a container with this much text is the article itself (e.g. class="post-share-enabled"). */
const MAX_NOISE_TEXT = 1500;

function isNoiseElement(el: Element): boolean {
  const names = [...(el.getAttribute("class") ?? "").split(/\s+/), el.getAttribute("id") ?? ""].filter(Boolean);
  const named = names.some((name) => NOISE_NAME.test(name));
  const adData = el.getAttributeNames().some((attr) => attr.startsWith("data-ad"));
  return (named || adData) && (el.textContent ?? "").length < MAX_NOISE_TEXT;
}

/** Strips page chrome and named noise. Mutates `root`; run it before Readability too. */
export function cleanDocument(root: Element): void {
  root.querySelectorAll(DROP).forEach((el) => el.remove());
  root.querySelectorAll("iframe").forEach((el) => {
    if (!VIDEO_IFRAME.test(el.getAttribute("src") ?? "")) el.remove();
  });
  root.querySelectorAll("*").forEach((el) => {
    if (el.isConnected && isNoiseElement(el)) el.remove();
  });
}

// ── Conversion ───────────────────────────────────────────────────────────────

type Marks = { href?: string; bold?: true; italic?: true };
type Ctx = { base: string; imageBase: string; out: BlockDraft[]; pending: Element[] };

const INLINE = new Set([
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "del", "dfn", "em", "i", "ins", "kbd",
  "label", "mark", "math", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr",
]);

const collapse = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

function largestFromSrcset(srcset: string): string | undefined {
  let best: { url: string; size: number } | undefined;
  for (const candidate of srcset.split(",")) {
    const [url, descriptor = "1x"] = candidate.trim().split(/\s+/);
    const size = Number.parseFloat(descriptor) || 1;
    if (url && (!best || size > best.size)) best = { url, size };
  }
  return best?.url;
}

function imageUrl(img: Element, ctx: Ctx): string | undefined {
  const srcset = img.getAttribute("srcset") ?? img.getAttribute("data-srcset");
  const candidates = [
    srcset ? largestFromSrcset(srcset) : undefined,
    img.getAttribute("data-src"),
    img.getAttribute("data-original"),
    img.getAttribute("src"),
  ];
  for (const candidate of candidates) {
    if (candidate && !candidate.startsWith("data:")) return safeHref(candidate, ctx.imageBase);
  }
  return undefined;
}

function pushImage(img: Element, caption: string | undefined, ctx: Ctx) {
  const url = imageUrl(img, ctx);
  if (!url) return;
  const width = Number(img.getAttribute("width"));
  const height = Number(img.getAttribute("height"));
  if ((width && width < 64) || (height && height < 64)) return; // icons and tracking pixels
  ctx.out.push({ type: "image", originalUrl: url, alt: collapse(img.getAttribute("alt")), caption: caption || undefined, path: null });
}

function flushPending(ctx: Ctx) {
  const images = ctx.pending;
  ctx.pending = [];
  for (const img of images) pushImage(img, undefined, ctx);
}

function collectInline(nodes: Node[], ctx: Ctx, marks: Marks = {}): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ");
      if (text) out.push({ text, ...marks });
      continue;
    }
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    switch (el.localName) {
      case "br":
        out.push({ text: " ", ...marks });
        break;
      case "img":
        ctx.pending.push(el);
        break;
      case "picture": {
        const img = el.querySelector("img");
        if (img) ctx.pending.push(img);
        break;
      }
      case "math": {
        const alt = collapse(el.getAttribute("alttext") ?? el.textContent);
        if (alt) out.push({ text: alt, ...marks, code: true });
        break;
      }
      case "a":
        out.push(...collectInline([...el.childNodes], ctx, { ...marks, href: safeHref(el.getAttribute("href"), ctx.base) }));
        break;
      case "strong":
      case "b":
        out.push(...collectInline([...el.childNodes], ctx, { ...marks, bold: true }));
        break;
      case "em":
      case "i":
        out.push(...collectInline([...el.childNodes], ctx, { ...marks, italic: true }));
        break;
      case "code":
      case "kbd":
      case "samp":
        out.push({ text: collapse(el.textContent), ...marks, code: true });
        break;
      default: {
        const blockish = !INLINE.has(el.localName);
        if (blockish) out.push({ text: " ", ...marks });
        out.push(...collectInline([...el.childNodes], ctx, marks));
        if (blockish) out.push({ text: " ", ...marks });
      }
    }
  }
  return out;
}

const sameMarks = (a: Inline, b: Inline) => a.href === b.href && a.bold === b.bold && a.italic === b.italic && a.code === b.code;

function normalizeInline(spans: Inline[]): Inline[] {
  const merged: Inline[] = [];
  for (const span of spans) {
    const clean: Inline = { text: span.text };
    if (span.href) clean.href = span.href;
    if (span.bold) clean.bold = true;
    if (span.italic) clean.italic = true;
    if (span.code) clean.code = true;
    const last = merged.at(-1);
    if (last && sameMarks(last, clean)) last.text += clean.text;
    else merged.push(clean);
  }
  let afterSpace = true;
  for (const span of merged) {
    if (!span.code) {
      span.text = span.text.replace(/\s+/g, " ");
      if (afterSpace) span.text = span.text.replace(/^ /, "");
    }
    if (span.text) afterSpace = span.text.endsWith(" ");
  }
  const nonEmpty = merged.filter((span) => span.text.length > 0);
  const last = nonEmpty.at(-1);
  if (last && !last.code) last.text = last.text.replace(/ $/, "");
  return nonEmpty.filter((span) => span.text.length > 0);
}

function pushParagraph(nodes: Node[], ctx: Ctx) {
  const content = normalizeInline(collectInline(nodes, ctx));
  if (inlineText(content).trim()) ctx.out.push({ type: "paragraph", content });
  flushPending(ctx);
}

function pushList(el: Element, ctx: Ctx) {
  const items: Inline[][] = [];
  const nested: Element[] = [];
  for (const li of [...el.children].filter((child) => child.localName === "li")) {
    const own = [...li.childNodes].filter((node) => {
      const isList = node.nodeType === 1 && ["ul", "ol"].includes((node as Element).localName);
      if (isList) nested.push(node as Element);
      return !isList;
    });
    const content = normalizeInline(collectInline(own, ctx));
    if (inlineText(content).trim()) items.push(content);
  }
  if (items.length) ctx.out.push({ type: "list", ordered: el.localName === "ol", items });
  flushPending(ctx);
  for (const list of nested) pushList(list, ctx);
}

function languageOf(el: Element): string | undefined {
  const classes = [el, el.querySelector("code"), el.parentElement]
    .map((node) => node?.getAttribute("class") ?? "")
    .join(" ");
  return /(?:language|lang|highlight-source)-([\w+#-]+)/.exec(classes)?.[1];
}

function pushTable(el: Element, ctx: Ctx) {
  const rows = [...el.querySelectorAll("tr")]
    .map((tr) => [...tr.children].map((cell) => collapse(cell.textContent)).filter(Boolean).join(" · "))
    .filter(Boolean)
    .map((row): Inline[] => [{ text: row }]);
  if (rows.length) ctx.out.push({ type: "list", ordered: false, items: rows });
}

function pushVideo(el: Element, ctx: Ctx) {
  const src = el.getAttribute("src") ?? "";
  const youtube = /youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/.exec(src)?.[1];
  const vimeo = /player\.vimeo\.com\/video\/(\d+)/.exec(src)?.[1];
  if (youtube) ctx.out.push({ type: "video", provider: "youtube", videoId: youtube });
  else if (vimeo) ctx.out.push({ type: "video", provider: "vimeo", videoId: vimeo });
}

function visitChildren(parent: Element, ctx: Ctx) {
  let run: Node[] = [];
  const flush = () => {
    if (run.length) pushParagraph(run, ctx);
    run = [];
  };
  for (const node of [...parent.childNodes]) {
    const inline = node.nodeType === 3 || (node.nodeType === 1 && INLINE.has((node as Element).localName));
    if (inline) {
      run.push(node);
      continue;
    }
    if (node.nodeType !== 1) continue;
    flush();
    visitElement(node as Element, ctx);
  }
  flush();
}

function visitElement(el: Element, ctx: Ctx) {
  switch (el.localName) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const text = collapse(el.textContent);
      const level = el.localName === "h3" ? 3 : ["h4", "h5", "h6"].includes(el.localName) ? 4 : 2;
      if (text) ctx.out.push({ type: "heading", level, text });
      return;
    }
    case "ul":
    case "ol":
      return pushList(el, ctx);
    case "blockquote": {
      const content = normalizeInline(collectInline([...el.childNodes], ctx));
      if (inlineText(content).trim()) ctx.out.push({ type: "quote", content, cite: safeHref(el.getAttribute("cite"), ctx.base) });
      return flushPending(ctx);
    }
    case "pre": {
      const code = (el.textContent ?? "").replace(/\n+$/, "");
      if (code.trim()) ctx.out.push({ type: "code", language: languageOf(el), code });
      return;
    }
    case "figure": {
      const img = el.querySelector("img");
      if (img) return pushImage(img, collapse(el.querySelector("figcaption")?.textContent), ctx);
      if (el.querySelector("table")) return pushTable(el.querySelector("table")!, ctx);
      return visitChildren(el, ctx);
    }
    case "img":
      return pushImage(el, undefined, ctx);
    case "picture": {
      const img = el.querySelector("img");
      if (img) pushImage(img, undefined, ctx);
      return;
    }
    case "iframe":
      return pushVideo(el, ctx);
    case "hr":
      ctx.out.push({ type: "divider" });
      return;
    case "table":
      return pushTable(el, ctx);
    default:
      return visitChildren(el, ctx);
  }
}

// ── Layer 2: block-level noise, after conversion ────────────────────────────

const SHARE_LINK = /(twitter\.com\/intent|x\.com\/intent|facebook\.com\/sharer|linkedin\.com\/share|reddit\.com\/submit|news\.ycombinator\.com\/submitlink|t\.me\/share|wa\.me\/)/i;
const BOILERPLATE = /\b(subscribe|newsletter|sign up|share (this|on)|follow us|advertisement|sponsored|related (posts|articles|stories)|you might also like|iratkozz fel|hírlevél|kapcsolódó cikkek|hirdetés|oszd meg)\b/i;
const ICON_PATH = /(icon|logo|avatar|emoji|badge|sprite|pixel|tracking|spacer|gravatar|1x1)/i;

function isNoiseBlock(block: BlockDraft, baseHost: string): boolean {
  if (block.type === "image") return ICON_PATH.test(new URL(block.originalUrl).pathname);
  if (block.type === "list") return block.items.every((item) => !inlineText(item).trim() || item.some((s) => s.href && SHARE_LINK.test(s.href)));
  if (block.type !== "paragraph" && block.type !== "heading" && block.type !== "quote") return false;
  const text = blockText(block).trim();
  if (!text) return true;
  if (text.length < 120 && BOILERPLATE.test(text)) return true;
  if (block.type === "heading") return false;
  const links = block.content.filter((span) => span.href);
  if (links.some((span) => SHARE_LINK.test(span.href!)) && text.length < 200) return true;
  // Short, link-only paragraphs pointing back into the same site are navigation ("Next post").
  const linkOnly = block.content.every((span) => span.href || !span.text.trim());
  return linkOnly && text.length < 40 && links.every((span) => new URL(span.href!).hostname === baseHost);
}

export function filterNoise(blocks: BlockDraft[], baseUrl: string): BlockDraft[] {
  const baseHost = new URL(baseUrl).hostname;
  const kept: BlockDraft[] = [];
  for (const block of blocks) {
    if (isNoiseBlock(block, baseHost)) continue;
    const previous = kept.at(-1);
    if (block.type === "divider" && (!previous || previous.type === "divider")) continue;
    if (previous && previous.type === block.type && blockText(block) && blockText(previous) === blockText(block)) continue;
    kept.push(block);
  }
  while (kept.at(-1)?.type === "divider") kept.pop();
  return kept;
}

export function htmlToDrafts(html: string, options: HtmlToBlocksOptions): BlockDraft[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const body = document.body as unknown as Element;
  cleanDocument(body);
  const ctx: Ctx = { base: options.baseUrl, imageBase: options.imageBaseUrl ?? options.baseUrl, out: [], pending: [] };
  visitChildren(body, ctx);
  return filterNoise(ctx.out, options.baseUrl);
}

export const htmlToBlocks = (html: string, options: HtmlToBlocksOptions): Block[] => assignIds(htmlToDrafts(html, options));
```

- [ ] **Step 4: Futtatás, át kell mennie**

Futtatás: `npm test` → Elvárt: minden PASS.

Ha a `layer 2` teszt a `Read the paper` bekezdésen bukik: az külső link (`arxiv.org`), ezért maradnia kell. Nézd meg a `linkOnly` feltétel host-ellenőrzését. Ha a linkedom nem ismeri a `getAttributeNames`-t, cseréld erre: `[...el.attributes].map((a) => a.name)`.

Futtatás: `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/html-to-blocks.ts lib/pipeline/html-to-blocks.test.ts
git commit -m "feat: convert html to content blocks with two noise-filter layers"
```

---

### Task 5: Biztonságos letöltés kiemelése és a képfeldolgozás

**Files:**
- Create: `lib/media.ts`, `lib/pipeline/fetch.ts`, `lib/pipeline/images.ts`, `lib/pipeline/images.test.ts`
- Modify: `lib/pipeline/ingest.ts` (a `safeFetch` importja), `package.json` (`sharp`)

**Interfaces:**
- Consumes: `Block`, `ImageBlock` (2. feladat); `isPrivateAddress`, `parseSubmittedUrl` (`util.ts`)
- Produces:
  - `fetch.ts`: `class FetchError extends Error`, `USER_AGENT: string`, `safeFetch(raw: string, init?: { accept?: string; timeoutMs?: number }): Promise<Response>`, `readLimited(response: Response, limit: number): Promise<Buffer>`, `readText(response: Response, limit: number): Promise<string>`
  - `media.ts` (tiszta, kliensoldalon is importálható): `MEDIA_BUCKET = "media"`, `MEDIA_TYPES`, `type MediaFormat`, `variantPath(key, width, format): string`, `isMediaKey(key): boolean`, `mediaUrl(key, width, format): string`
  - `images.ts`: `type Encoded`, `encodeImage(input: Buffer): Promise<Encoded | null>`, `imageKey(sourceId: number, originalUrl: string): string`, `mirrorImages(db: SupabaseClient, sourceId: number, blocks: Block[], previous?: Block[]): Promise<Block[]>`, `unusedMediaPaths(existing: string[], blocks: Block[]): string[]`

- [ ] **Step 1: A `sharp` felvétele pontos verzióval**

Futtatás: `corepack pnpm@11.25.0 add sharp@0.35.4 --save-exact`
Elvárt: a `package.json`-ban `"sharp": "0.35.4"`, és a lockfile frissül.

- [ ] **Step 2: A tesztek megírása** (`lib/pipeline/images.test.ts`)

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { isMediaKey, variantPath } from "../media.ts";
import { encodeImage, imageKey, unusedMediaPaths } from "./images.ts";
import type { Block } from "../blocks.ts";

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#f15f22" } }).png().toBuffer();

test("encodeImage makes 640 and 1280 AVIF variants plus a placeholder", async () => {
  const encoded = await encodeImage(await png(2000, 1000));
  assert.ok(encoded);
  assert.equal(encoded.format, "avif");
  assert.deepEqual(encoded.variants.map((v) => v.width), [640, 1280]);
  assert.equal(encoded.width, 2000);
  assert.equal(encoded.height, 1000);
  assert.match(encoded.placeholder ?? "", /^data:image\/webp;base64,/);
  assert.equal((await sharp(encoded.variants[1].data).metadata()).width, 1280);
});

test("encodeImage keeps small images at their own width and drops icons", async () => {
  const small = await encodeImage(await png(300, 200));
  assert.deepEqual(small?.variants.map((v) => v.width), [300]);
  assert.equal(await encodeImage(await png(32, 32)), null);
});

test("image keys are content-addressed and validated", () => {
  const key = imageKey(42, "https://x.test/a.png");
  assert.equal(key, imageKey(42, "https://x.test/a.png"));
  assert.match(key, /^42\/[0-9a-f]{16}$/);
  assert.equal(variantPath(key, 640, "avif"), `${key}-640.avif`);
  assert.equal(isMediaKey(`${key}-640.avif`), true);
  assert.equal(isMediaKey("../secret"), false);
  assert.equal(isMediaKey(`${key}-640.png`), false);
});

test("unusedMediaPaths keeps every variant still referenced", () => {
  const key = imageKey(1, "https://x.test/a.png");
  const blocks: Block[] = [
    { id: "i1", type: "image", originalUrl: "https://x.test/a.png", alt: "", path: key, format: "avif", widths: [640, 1280] },
  ];
  const existing = [`${key}-640.avif`, `${key}-1280.avif`, "1/deadbeefdeadbeef-640.avif"];
  assert.deepEqual(unusedMediaPaths(existing, blocks), ["1/deadbeefdeadbeef-640.avif"]);
});
```

- [ ] **Step 3: Futtatás, el kell buknia**

Futtatás: `npm test` → Elvárt: FAIL, `Cannot find module .../images.ts`.

- [ ] **Step 4: A `lib/pipeline/fetch.ts` megírása**

A `safeFetch` a mostani `ingest.ts`-ből jön, kiegészítve az `accept` fejléccel, a `FetchError`-ral és a `readLimited`-del:

```ts
import { lookup } from "node:dns/promises";
import { isPrivateAddress, parseSubmittedUrl } from "./util.ts";

export const USER_AGENT = "Mozilla/5.0 (compatible; NeonRadar/1.0; private research digest)";

/** The source itself is unreachable: the fallback chain cannot help, the submission fails. */
export class FetchError extends Error {}

/**
 * Fetches a URL without reaching internal hosts: every hop is re-parsed,
 * DNS-resolved and checked, and redirects are followed by hand.
 * ponytail: a DNS answer can still change between lookup and connect
 * (rebinding); pin the resolved IP with an undici Agent if submitters stop being invited.
 */
export async function safeFetch(raw: string, init: { accept?: string; timeoutMs?: number } = {}): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    const url = parseSubmittedUrl(current);
    if (!url) throw new FetchError("blocked url");
    let addresses: { address: string }[];
    try {
      addresses = await lookup(url.hostname, { all: true });
    } catch {
      throw new FetchError(`cannot resolve ${url.hostname}`);
    }
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new FetchError("blocked address");
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: init.accept ?? "*/*" },
        signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
        redirect: "manual",
      });
    } catch (error) {
      throw new FetchError(`fetch failed: ${error instanceof Error ? error.message : error}`);
    }
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return response;
    current = new URL(location, url).toString();
  }
  throw new FetchError("too many redirects");
}

/** Reads the body, refusing anything over `limit` bytes. */
export async function readLimited(response: Response, limit: number): Promise<Buffer> {
  if (Number(response.headers.get("content-length") ?? 0) > limit) throw new Error(`larger than ${limit} bytes`);
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error(`larger than ${limit} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export const readText = async (response: Response, limit: number) => new TextDecoder().decode(await readLimited(response, limit));
```

Az `ingest.ts`-ből töröld a helyi `safeFetch`-et, és importáld: `import { safeFetch } from "./fetch.ts";`. Töröld a már nem használt `lookup` és `isPrivateAddress` importot is.

- [ ] **Step 5: A `lib/media.ts` és a `lib/pipeline/images.ts` megírása**

`lib/media.ts` (nincs benne `sharp` és `node:` import, mert a renderer a kliensen is betölti):

```ts
// Pure: shared by the image pipeline, the /media route and the renderer (also client-side).
export const MEDIA_BUCKET = "media";
export const MEDIA_TYPES = { avif: "image/avif", webp: "image/webp", svg: "image/svg+xml" } as const;
export type MediaFormat = keyof typeof MEDIA_TYPES;

export const variantPath = (key: string, width: number, format: MediaFormat) => `${key}-${width}.${format}`;

export const isMediaKey = (key: string) => /^\d+\/[0-9a-f]{16}-\d+\.(avif|webp|svg)$/.test(key);

export const mediaUrl = (key: string, width: number, format: MediaFormat) => `/media/${variantPath(key, width, format)}`;
```

`lib/pipeline/images.ts`:

```ts
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Block, ImageBlock } from "../blocks.ts";
import { MEDIA_BUCKET, MEDIA_TYPES, variantPath, type MediaFormat } from "../media.ts";
import { readLimited, safeFetch } from "./fetch.ts";

const MAX_IMAGES = 30;
const MAX_BYTES = 5 * 1024 * 1024;
const WIDTHS = [640, 1280];
const MIN_SIDE = 64;
const CONCURRENCY = 4;
const PIXEL_LIMIT = 40_000_000; // decompression-bomb guard

export type Encoded = {
  format: MediaFormat;
  width: number;
  height: number;
  placeholder?: string;
  variants: { width: number; data: Buffer }[];
};

export const imageKey = (sourceId: number, originalUrl: string) =>
  `${sourceId}/${createHash("sha1").update(originalUrl).digest("hex").slice(0, 16)}`;

/** AVIF at two widths (animated → animated WebP); null for images too small to be content. */
export async function encodeImage(input: Buffer): Promise<Encoded | null> {
  const meta = await sharp(input, { limitInputPixels: PIXEL_LIMIT }).metadata();
  const width = meta.width ?? 0;
  const height = meta.pageHeight ?? meta.height ?? 0;
  if (width < MIN_SIDE || height < MIN_SIDE) return null;
  if (meta.format === "svg") return { format: "svg", width, height, variants: [{ width, data: input }] };

  const animated = (meta.pages ?? 1) > 1;
  const format: MediaFormat = animated ? "webp" : "avif";
  const targets = [...new Set(WIDTHS.map((target) => Math.min(target, width)))];
  const variants = await Promise.all(
    targets.map(async (target) => {
      const resized = sharp(input, { animated, limitInputPixels: PIXEL_LIMIT }).resize({ width: target, withoutEnlargement: true });
      const data = await (animated ? resized.webp({ quality: 75 }) : resized.avif({ quality: 50, effort: 4 })).toBuffer();
      return { width: target, data };
    }),
  );
  const tiny = await sharp(input, { limitInputPixels: PIXEL_LIMIT }).resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
  return { format, width, height, placeholder: `data:image/webp;base64,${tiny.toString("base64")}`, variants };
}

async function eachLimited<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
  }));
}

const isMirrored = (block: Block): block is ImageBlock => block.type === "image" && Boolean(block.path);

/**
 * Downloads, encodes and uploads image blocks. Images already mirrored in
 * `previous` are reused by URL; too-small images and those past the 30 limit
 * are dropped; a failed download keeps the block with `path: null`.
 */
export async function mirrorImages(db: SupabaseClient, sourceId: number, blocks: Block[], previous: Block[] = []): Promise<Block[]> {
  const reuse = new Map(previous.filter(isMirrored).map((block) => [block.originalUrl, block]));
  const images = blocks.filter((block): block is ImageBlock => block.type === "image");
  const allowed = new Set(images.slice(0, MAX_IMAGES).map((image) => image.id));
  const results = new Map<string, ImageBlock | null>();

  await eachLimited(images.filter((image) => allowed.has(image.id)), CONCURRENCY, async (image) => {
    const old = reuse.get(image.originalUrl);
    if (old) {
      results.set(image.id, { ...image, path: old.path, format: old.format, widths: old.widths, width: old.width, height: old.height, placeholder: old.placeholder });
      return;
    }
    try {
      const response = await safeFetch(image.originalUrl, { accept: "image/avif,image/webp,image/*;q=0.8" });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.startsWith("image/")) throw new Error(`not an image (${response.status} ${type})`);
      const encoded = await encodeImage(await readLimited(response, MAX_BYTES));
      if (!encoded) {
        results.set(image.id, null);
        return;
      }
      const key = imageKey(sourceId, image.originalUrl);
      for (const variant of encoded.variants) {
        const { error } = await db.storage
          .from(MEDIA_BUCKET)
          .upload(variantPath(key, variant.width, encoded.format), variant.data, { contentType: MEDIA_TYPES[encoded.format], upsert: true });
        if (error) throw error;
      }
      results.set(image.id, {
        ...image,
        path: key,
        format: encoded.format,
        widths: encoded.variants.map((variant) => variant.width),
        width: encoded.width,
        height: encoded.height,
        placeholder: encoded.placeholder,
      });
    } catch (error) {
      console.warn(`image ${image.originalUrl}: ${error instanceof Error ? error.message : error}`);
      results.set(image.id, { ...image, path: null });
    }
  });

  return blocks.flatMap((block) => {
    if (block.type !== "image") return [block];
    if (!allowed.has(block.id)) return [];
    const result = results.get(block.id);
    return result === null ? [] : [result ?? block];
  });
}

/** Stored objects no longer referenced by `blocks` (after a re-extraction). */
export function unusedMediaPaths(existing: string[], blocks: Block[]): string[] {
  const used = new Set(
    blocks.filter(isMirrored).flatMap((block) => (block.widths ?? []).map((width) => variantPath(block.path!, width, block.format ?? "avif"))),
  );
  return existing.filter((path) => !used.has(path));
}
```

- [ ] **Step 6: Futtatás, át kell mennie**

Futtatás: `npm test` → PASS (az AVIF-kódolás miatt pár másodperc). Futtatás: `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add lib/media.ts lib/pipeline/fetch.ts lib/pipeline/images.ts lib/pipeline/images.test.ts lib/pipeline/ingest.ts package.json pnpm-lock.yaml
git commit -m "feat: mirror images as responsive AVIF variants"
```

---

### Task 6: A `/media` route

**Files:**
- Create: `app/media/[...path]/route.ts`

**Interfaces:**
- Consumes: `isMediaKey`, `MEDIA_BUCKET`, `MEDIA_TYPES` (`lib/media.ts`, 5. feladat); `getViewer`, `createAdminClient` (`lib/supabase/server.ts`)
- Produces: `GET /media/<sourceId>/<hash>-<width>.<avif|webp|svg>`

- [ ] **Step 1: A route megírása**

```ts
import { MEDIA_BUCKET, MEDIA_TYPES, isMediaKey } from "@/lib/media";
import { createAdminClient, getViewer } from "@/lib/supabase/server";

// Mirrored images are for signed-in readers only. Keys are content-addressed,
// so a response never changes: cache it for a year, privately.
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!(await getViewer())) return new Response("unauthorized", { status: 401 });
  const key = (await params).path.join("/");
  if (!isMediaKey(key)) return new Response("not found", { status: 404 });

  const { data, error } = await createAdminClient().storage.from(MEDIA_BUCKET).download(key);
  if (error || !data) return new Response("not found", { status: 404 });

  const extension = key.slice(key.lastIndexOf(".") + 1) as keyof typeof MEDIA_TYPES;
  return new Response(await data.arrayBuffer(), {
    headers: {
      "content-type": MEDIA_TYPES[extension],
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
```

- [ ] **Step 2: Ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint`.
Futtatás: `npx next dev -p 3000` a háttérben, majd `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/media/1/0000000000000000-640.avif`.
Elvárt: `307` (a proxy a loginra irányít) vagy `401`. A 200-as esetet a 9. feladat élő próbája ellenőrzi.

- [ ] **Step 3: Commit**

```bash
git add "app/media/[...path]/route.ts"
git commit -m "feat: serve mirrored images behind the session check"
```

---

### Task 7: LLM-bemenetek, a kinyerő-típusok, és az article, PDF, GitHub és arXiv kinyerő

**Files:**
- Modify: `lib/llm.ts`
- Create: `lib/pipeline/extract/types.ts`, `lib/pipeline/extract/article.ts`, `lib/pipeline/extract/pdf.ts`, `lib/pipeline/extract/github.ts`, `lib/pipeline/extract/arxiv.ts`, `lib/pipeline/extract/extract.test.ts`

**Interfaces:**
- Consumes: `htmlToBlocks`, `htmlToDrafts`, `cleanDocument` (4. feladat); `safeFetch`, `readLimited`, `readText`, `FetchError` (5. feladat); `assignIds`, `plainText`, `withoutIds`, `BlockDraft` (2. feladat); `githubRepo`, `arxivId`, `hostOf` (3. feladat)
- Produces:
  - `llm.ts`: `Task` új értékekkel; `generate(db, task, schema, prompt, options?: { youtubeUrl?: string; pdfBase64?: string })`
  - `types.ts`: `type ExtractedMeta`, `type Extracted`, `type Extractor = (db: SupabaseClient, url: string, note: string) => Promise<Extracted>`
  - `article.ts`: `extractArticle: Extractor`, `articleFromHtml(html: string, finalUrl: string, robotsHeader?: string | null): Extracted`, `readPageMeta(document: Document): PageMeta`
  - `github.ts`: `extractGithub: Extractor`
  - `pdf.ts`: `extractPdf: Extractor`, `extractPdfResponse(db, url, response, note): Promise<Extracted>`, `fromLlmBlock(block: LlmBlock): BlockDraft | null`
  - `arxiv.ts`: `extractArxiv: Extractor`, `parseArxivAtom(xml: string): ArxivMeta`, `isArxivHtml(html: string): boolean`

- [ ] **Step 1: Az `llm.ts` bővítése**

A `Task` típus:

```ts
export type Task =
  | "daily_shortlist" | "daily_curate" | "ingest_article" | "ingest_video"
  | "ingest_pdf" | "ingest_cleanup" | "translate_post";
```

A `gemini()` aláírása és a részek összeállítása:

```ts
async function gemini<T extends z.ZodType>(
  model: string,
  schema: T,
  prompt: string,
  media: { youtubeUrl?: string; pdfBase64?: string } = {},
): Promise<z.infer<T>> {
  const parts: unknown[] = [{ text: prompt }];
  if (media.youtubeUrl) parts.unshift({ file_data: { file_uri: media.youtubeUrl } });
  if (media.pdfBase64) parts.unshift({ inline_data: { mime_type: "application/pdf", data: media.pdfBase64 } });
```

A `mediaResolution` feltétele változatlanul `media.youtubeUrl`. A `generate` opciótípusa `options: { youtubeUrl?: string; pdfBase64?: string } = {}`, a cikluson belül pedig:

```ts
    // Only Gemini reads video and PDF input.
    if ((options.youtubeUrl || options.pdfBase64) && route.provider !== "gemini") continue;
    try {
      return route.provider === "gemini"
        ? await gemini(route.model, schema, prompt, options)
        : await groq(route.model, schema, prompt);
```

- [ ] **Step 2: A tesztek megírása** (`lib/pipeline/extract/extract.test.ts`)

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { articleFromHtml } from "./article.ts";
import { isArxivHtml, parseArxivAtom } from "./arxiv.ts";
import { fromLlmBlock } from "./pdf.ts";

const page = (head: string, body: string) => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const article = `<nav>Menu</nav><article><h1>Big news</h1>${"<p>Sentence about local models and inference speed. </p>".repeat(12)}
  <figure><img src="/a.png" alt="Chart" width="800" height="400"><figcaption>Speed</figcaption></figure></article>
  <footer>© Site</footer>`;

test("articleFromHtml reads blocks and page metadata", () => {
  const result = articleFromHtml(
    page(`<title>Big news</title><meta property="og:site_name" content="Test Blog"><meta property="article:published_time" content="2026-09-20T10:00:00Z">`, article),
    "https://blog.test/post",
  );
  assert.equal(result.siteName, "Test Blog");
  assert.equal(result.publishedAt, "2026-09-20");
  assert.equal(result.meta.noarchive, undefined);
  assert.ok(result.blocks.some((b) => b.type === "image"));
  assert.ok(result.blocks.every((b) => b.type !== "paragraph" || !b.content.some((s) => s.text.includes("Menu"))));
  assert.ok(result.text.includes("local models"));
});

test("articleFromHtml honours noarchive from meta or header", () => {
  const meta = articleFromHtml(page(`<meta name="robots" content="index, noarchive">`, article), "https://blog.test/p");
  assert.equal(meta.meta.noarchive, true);
  const header = articleFromHtml(page("", article), "https://blog.test/p", "noarchive");
  assert.equal(header.meta.noarchive, true);
});

test("articleFromHtml rejects pages with no readable content", () => {
  assert.throws(() => articleFromHtml(page("", "<div>tiny</div>"), "https://blog.test/p"));
});

test("fromLlmBlock maps the flat model schema and drops malformed blocks", () => {
  assert.deepEqual(fromLlmBlock({ type: "heading", text: "Intro", level: 5 }), { type: "heading", level: 4, text: "Intro" });
  assert.deepEqual(fromLlmBlock({ type: "paragraph", text: "Body" }), { type: "paragraph", content: [{ text: "Body" }] });
  assert.deepEqual(fromLlmBlock({ type: "list", ordered: true, items: ["a", "b"] }), { type: "list", ordered: true, items: [[{ text: "a" }], [{ text: "b" }]] });
  assert.deepEqual(fromLlmBlock({ type: "code", code: "x = 1", language: "py" }), { type: "code", code: "x = 1", language: "py" });
  assert.equal(fromLlmBlock({ type: "list", items: [] }), null);
  assert.equal(fromLlmBlock({ type: "paragraph", text: "  " }), null);
});

test("arXiv helpers", () => {
  assert.equal(isArxivHtml('<div class="ltx_page_main">'), true);
  assert.equal(isArxivHtml("<p>No HTML for this paper</p>"), false);
  const meta = parseArxivAtom(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <title>Attention Is All
      You Need</title><summary>We propose the Transformer.</summary><published>2017-06-12T17:57:34Z</published>
    <author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author></entry></feed>`);
  assert.deepEqual(meta, { title: "Attention Is All You Need", summary: "We propose the Transformer.", published: "2017-06-12", authors: ["Ashish Vaswani", "Noam Shazeer"] });
});
```

- [ ] **Step 3: Futtatás, el kell buknia**

Futtatás: `npm test` → Elvárt: FAIL, `Cannot find module .../article.ts`.

- [ ] **Step 4: `lib/pipeline/extract/types.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Block } from "../../blocks.ts";

export type ExtractedMeta = Record<string, unknown> & {
  noarchive?: boolean;
  truncated?: boolean;
  extractionFailed?: boolean;
};

export type Extracted = {
  blocks: Block[];
  title: string;
  author: string | null;
  siteName: string;
  /** YYYY-MM-DD */
  publishedAt: string | null;
  meta: ExtractedMeta;
  /** What the summarizer reads; for noarchive pages this is all that is used. */
  text: string;
  /** Set when the extractor already wrote the summary in the same model call (YouTube). */
  generated?: {
    title: { hu: string; en: string };
    summary: { hu: string; en: string };
    keyPoints: { hu: string[]; en: string[] };
    tags: string[];
  };
};

export type Extractor = (db: SupabaseClient, url: string, note: string) => Promise<Extracted>;
```

- [ ] **Step 5: `lib/pipeline/extract/article.ts`**

```ts
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { plainText } from "../../blocks.ts";
import { FetchError, readText, safeFetch } from "../fetch.ts";
import { cleanDocument, htmlToBlocks } from "../html-to-blocks.ts";
import { hostOf } from "../util.ts";
import { extractPdfResponse } from "./pdf.ts";
import type { Extracted, Extractor } from "./types.ts";

const MAX_HTML = 8 * 1024 * 1024;

export type PageMeta = { title?: string; description?: string; siteName?: string; published?: string; robots: string };

/** The page's own metadata; also the last-resort content of `metadataOnly`. */
export function readPageMeta(document: Document): PageMeta {
  const content = (selector: string) => document.querySelector(selector)?.getAttribute("content")?.trim() || undefined;
  return {
    title: content('meta[property="og:title"]') ?? (document.querySelector("title")?.textContent?.trim() || undefined),
    description: content('meta[property="og:description"]') ?? content('meta[name="description"]'),
    siteName: content('meta[property="og:site_name"]'),
    published: content('meta[property="article:published_time"]'),
    robots: content('meta[name="robots"]') ?? "",
  };
}

/** Pure: page HTML → blocks and metadata. Throws when nothing readable is left. */
export function articleFromHtml(html: string, finalUrl: string, robotsHeader?: string | null): Extracted {
  const doc = parseHTML(html).document as unknown as Document;
  const page = readPageMeta(doc);
  cleanDocument(doc.body as unknown as Element);
  const parsed = new Readability(doc).parse();
  const blocks = htmlToBlocks(parsed?.content ?? "", { baseUrl: finalUrl });
  const text = plainText(blocks);
  if (text.length < 200) throw new Error("no readable article text found");

  const date = page.published ?? parsed?.publishedTime ?? undefined;
  return {
    blocks,
    title: parsed?.title?.trim() || page.title || finalUrl,
    author: (parsed?.byline ?? null)?.slice(0, 120) ?? null,
    siteName: page.siteName ?? hostOf(finalUrl),
    publishedAt: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString().slice(0, 10) : null,
    meta: /noarchive/i.test(`${page.robots} ${robotsHeader ?? ""}`) ? { noarchive: true } : {},
    text,
  };
}

export const extractArticle: Extractor = async (db, url, note) => {
  const response = await safeFetch(url, { accept: "text/html,application/xhtml+xml,application/pdf;q=0.9" });
  if (!response.ok) throw new FetchError(`fetch ${response.status}`);
  if ((response.headers.get("content-type") ?? "").includes("application/pdf")) return extractPdfResponse(db, url, response, note);
  return articleFromHtml(await readText(response, MAX_HTML), response.url || url, response.headers.get("x-robots-tag"));
};
```

(A `response.url` a kézi átirányítás miatt az utolsó ugrás URL-je, mert a `safeFetch` minden ugrásnál új `fetch`-et indít.)

- [ ] **Step 6: `lib/pipeline/extract/pdf.ts`**

```ts
import { z } from "zod/v4";
import { assignIds, plainText, type BlockDraft } from "../../blocks.ts";
import { generate } from "../../llm.ts";
import { FetchError, readLimited, safeFetch } from "../fetch.ts";
import { hostOf } from "../util.ts";
import type { Extracted, Extractor } from "./types.ts";

const MAX_PDF = 20 * 1024 * 1024;

// Flat on purpose: one object shape is the most reliable structured output across models.
const llmBlockSchema = z.object({
  type: z.enum(["heading", "paragraph", "list", "quote", "code"]),
  text: z.string().optional(),
  level: z.int().optional(),
  ordered: z.boolean().optional(),
  items: z.array(z.string()).optional(),
  code: z.string().optional(),
  language: z.string().optional(),
});
type LlmBlock = z.infer<typeof llmBlockSchema>;

const pdfSchema = z.object({ title: z.string(), author: z.string().optional(), blocks: z.array(llmBlockSchema).max(400) });

export function fromLlmBlock(block: LlmBlock): BlockDraft | null {
  const text = block.text?.trim() ?? "";
  switch (block.type) {
    case "heading":
      return text ? { type: "heading", level: Math.min(4, Math.max(2, block.level ?? 2)) as 2 | 3 | 4, text } : null;
    case "paragraph":
      return text ? { type: "paragraph", content: [{ text }] } : null;
    case "quote":
      return text ? { type: "quote", content: [{ text }] } : null;
    case "list": {
      const items = (block.items ?? []).map((item) => item.trim()).filter(Boolean);
      return items.length ? { type: "list", ordered: Boolean(block.ordered), items: items.map((item) => [{ text: item }]) } : null;
    }
    case "code":
      return block.code?.trim() ? { type: "code", code: block.code, ...(block.language ? { language: block.language } : {}) } : null;
  }
}

const PDF_INSTRUCTIONS = `Transcribe the attached PDF into structured blocks, faithfully and in its original language.
- title: the document title. author: the authors, if stated.
- blocks: headings (level 2–4), paragraphs, lists, quotes and code, in reading order.
- Skip page headers, footers, page numbers and reference lists. Describe no figures.
- If the document is very long, stop after roughly 40,000 words.`;

export async function extractPdfResponse(db: Parameters<Extractor>[0], url: string, response: Response, note: string): Promise<Extracted> {
  const data = await readLimited(response, MAX_PDF);
  const result = await generate(db, "ingest_pdf", pdfSchema, `${PDF_INSTRUCTIONS}${note}`, { pdfBase64: data.toString("base64") });
  const blocks = assignIds(result.blocks.map(fromLlmBlock).filter((block): block is BlockDraft => block !== null));
  return {
    blocks,
    title: result.title || new URL(url).pathname.split("/").pop() || url,
    author: result.author ?? null,
    siteName: hostOf(url),
    publishedAt: null,
    meta: {},
    text: plainText(blocks),
  };
}

export const extractPdf: Extractor = async (db, url, note) => {
  const response = await safeFetch(url, { accept: "application/pdf" });
  if (!response.ok) throw new FetchError(`fetch ${response.status}`);
  return extractPdfResponse(db, url, response, note);
};
```

- [ ] **Step 7: `lib/pipeline/extract/github.ts`**

```ts
import { assignIds, plainText, type BlockDraft } from "../../blocks.ts";
import { FetchError } from "../fetch.ts";
import { htmlToDrafts } from "../html-to-blocks.ts";
import { githubRepo } from "../util.ts";
import type { Extractor } from "./types.ts";

type RepoInfo = {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics?: string[];
  license: { spdx_id: string | null } | null;
  default_branch: string;
  pushed_at: string | null;
  owner: { login: string };
};

function headers(accept: string): Record<string, string> {
  const result: Record<string, string> = { accept, "user-agent": "NeonRadar" };
  if (process.env.GITHUB_TOKEN) result.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return result;
}

export const extractGithub: Extractor = async (_db, url) => {
  const repo = githubRepo(new URL(url));
  if (!repo) throw new Error("not a GitHub repository URL");
  const api = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;

  const infoResponse = await fetch(api, { headers: headers("application/vnd.github+json"), signal: AbortSignal.timeout(20_000) });
  if (!infoResponse.ok) throw new FetchError(`github ${infoResponse.status}`);
  const info = (await infoResponse.json()) as RepoInfo;

  const readmeResponse = await fetch(`${api}/readme`, { headers: headers("application/vnd.github.html+json"), signal: AbortSignal.timeout(20_000) });
  const readme = readmeResponse.ok ? await readmeResponse.text() : "";
  const branch = encodeURIComponent(info.default_branch);

  const drafts: BlockDraft[] = [
    {
      type: "repo",
      fullName: info.full_name,
      url: info.html_url,
      stars: info.stargazers_count,
      language: info.language ?? undefined,
      topics: info.topics ?? [],
      license: info.license?.spdx_id && info.license.spdx_id !== "NOASSERTION" ? info.license.spdx_id : undefined,
    },
    ...htmlToDrafts(readme, {
      baseUrl: `https://github.com/${info.full_name}/blob/${branch}/`,
      imageBaseUrl: `https://raw.githubusercontent.com/${info.full_name}/${branch}/`,
    }),
  ];
  const blocks = assignIds(drafts);
  return {
    blocks,
    title: info.full_name,
    author: info.owner.login,
    siteName: "GitHub",
    publishedAt: info.pushed_at?.slice(0, 10) ?? null,
    meta: { stars: info.stargazers_count, language: info.language, topics: info.topics ?? [] },
    text: [info.description ?? "", plainText(blocks)].join("\n\n"),
  };
};
```

- [ ] **Step 8: `lib/pipeline/extract/arxiv.ts`**

```ts
import { XMLParser } from "fast-xml-parser";
import { assignIds, withoutIds, type Block, type BlockDraft } from "../../blocks.ts";
import { readText, safeFetch } from "../fetch.ts";
import { arxivId } from "../util.ts";
import { articleFromHtml } from "./article.ts";
import { extractPdf } from "./pdf.ts";
import type { Extractor } from "./types.ts";

export type ArxivMeta = { title: string; summary: string; published: string | null; authors: string[] };

const xml = new XMLParser();
const squash = (text: unknown) => String(text ?? "").replace(/\s+/g, " ").trim();

export function parseArxivAtom(body: string): ArxivMeta {
  const entry = (xml.parse(body) as { feed?: { entry?: Record<string, unknown> } }).feed?.entry ?? {};
  const authors = ([] as { name?: string }[]).concat((entry.author as { name?: string }[] | { name?: string }) ?? []);
  const published = squash(entry.published);
  return {
    title: squash(entry.title),
    summary: squash(entry.summary),
    published: published ? published.slice(0, 10) : null,
    authors: authors.map((author) => squash(author.name)).filter(Boolean),
  };
}

export const isArxivHtml = (html: string) => html.includes("ltx_page_main") || html.includes("ltx_document");

async function metadata(id: string): Promise<ArxivMeta> {
  const response = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`arxiv api ${response.status}`);
  return parseArxivAtom(await response.text());
}

const byline = (authors: string[]) => (authors.length > 3 ? `${authors.slice(0, 3).join(", ")} et al.` : authors.join(", ")) || null;

export const extractArxiv: Extractor = async (db, url, note) => {
  const id = arxivId(new URL(url));
  if (!id) throw new Error("not an arXiv URL");
  const info = await metadata(id);
  const meta = { arxivId: id, authors: info.authors };

  try {
    const response = await safeFetch(`https://arxiv.org/html/${id}`, { accept: "text/html" });
    const html = response.ok ? await readText(response, 16 * 1024 * 1024) : "";
    if (isArxivHtml(html)) {
      // Figures are relative to the paper's directory, so the base needs a trailing slash.
      const base = (response.url || `https://arxiv.org/html/${id}`).replace(/\/?$/, "/");
      const article = articleFromHtml(html, base);
      return { ...article, title: info.title || article.title, author: byline(info.authors), siteName: "arXiv", publishedAt: info.published, meta };
    }
  } catch (error) {
    console.warn(`arxiv html ${id}: ${error instanceof Error ? error.message : error}`);
  }

  // No HTML version: the abstract always, the full text from the PDF when it can be read.
  const abstract: BlockDraft[] = [
    { type: "heading", level: 2, text: "Abstract" },
    { type: "paragraph", content: [{ text: info.summary }] },
  ];
  let body: Block[] = [];
  try {
    body = (await extractPdf(db, `https://arxiv.org/pdf/${id}`, note)).blocks;
  } catch (error) {
    console.warn(`arxiv pdf ${id}: ${error instanceof Error ? error.message : error}`);
  }
  const blocks = assignIds([...abstract, ...withoutIds(body)]);
  return {
    blocks,
    title: info.title,
    author: byline(info.authors),
    siteName: "arXiv",
    publishedAt: info.published,
    meta,
    text: [info.summary, ...body.map((block) => (block.type === "paragraph" ? block.content.map((s) => s.text).join("") : ""))].join("\n\n"),
  };
};
```

- [ ] **Step 9: Futtatás**

Futtatás: `npm test` → PASS. Futtatás: `npx tsc --noEmit` → nincs kimenet.

- [ ] **Step 10: Commit**

```bash
git add lib/llm.ts lib/pipeline/extract
git commit -m "feat: extract articles, pdfs, github repos and arxiv papers into blocks"
```

---

### Task 8: YouTube és X kinyerő, összefoglaló és a visszaesési lánc

**Files:**
- Create: `lib/pipeline/summary.ts`, `lib/pipeline/extract/youtube.ts`, `lib/pipeline/extract/x.ts`, `lib/pipeline/extract/index.ts`, `lib/pipeline/extract/media.test.ts`

**Interfaces:**
- Consumes: `generate` (`lib/llm.ts`); `Extracted`, `Extractor` (7. feladat); `assignIds`, `plainText`, `sectionsToBlocks`, `BlockDraft`, `Inline` (2. feladat); `htmlToDrafts` (4. feladat); `youtubeId`, `SourceKind`, `hostOf` (3. feladat); `safeFetch`, `readText`, `FetchError` (5. feladat); `readPageMeta` (7. feladat); `localizedSchema` (2. feladat)
- Produces:
  - `summary.ts`: `summarySchema`, `type Generated`, `SUMMARY_INSTRUCTIONS`, `summarize(db, extracted: Extracted, note: string): Promise<Generated>`, `writeNotes(db, extracted: Extracted): Promise<Block[]>`
  - `x.ts`: `extractX: Extractor`, `parseTweetHtml(html: string): { paragraphs: Inline[][]; text: string; date: string | null }`
  - `youtube.ts`: `extractYoutube: Extractor`
  - `index.ts`: `extract(db, kind: SourceKind, url: string, note: string): Promise<Extracted>`, `metadataOnly(url: string): Promise<Extracted>`

- [ ] **Step 1: A tesztek megírása** (`lib/pipeline/extract/media.test.ts`)

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTweetHtml } from "./x.ts";

test("parseTweetHtml reads the post text, links and date from oEmbed html", () => {
  const post = parseTweetHtml(
    `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">There&#39;s a new kind of coding <a href="https://t.co/x">t.co/x</a></p>&mdash; Andrej Karpathy (@karpathy) <a href="https://twitter.com/karpathy/status/1">February 2, 2025</a></blockquote>`,
  );
  assert.equal(post.text, "There's a new kind of coding t.co/x");
  assert.equal(post.paragraphs[0].at(-1)?.href, "https://t.co/x");
  assert.equal(post.date, "2025-02-02");
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `npm test` → Elvárt: FAIL, `Cannot find module .../x.ts`.

- [ ] **Step 3: `lib/pipeline/summary.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { digestTags } from "../../data/digest-types.ts";
import { assignIds, localizedSchema, sectionsToBlocks, type Block } from "../blocks.ts";
import { generate } from "../llm.ts";
import type { Extracted } from "./extract/types.ts";

export const summarySchema = z.object({
  title: localizedSchema,
  summary: localizedSchema,
  keyPoints: z.object({ hu: z.array(z.string()).max(8), en: z.array(z.string()).max(8) }),
  tags: z.array(z.enum(digestTags)).max(4),
});
export type Generated = z.infer<typeof summarySchema>;

export const SUMMARY_INSTRUCTIONS = `Write a bilingual (Hungarian + English) library entry for an AI engineer.
- title: concrete headline. summary: one paragraph (4–6 sentences) on what it says and why it matters.
- keyPoints: 3–8 short takeaways, same points in both languages.
- tags: 1–4 from the allowed vocabulary only.
- Hungarian must be natural and idiomatic, not a literal translation.
- Only state what the source says.`;

const MAX_PROMPT_TEXT = 60_000;

export function summarize(db: SupabaseClient, extracted: Extracted, note: string): Promise<Generated> {
  const failed = extracted.meta.extractionFailed ? "\nOnly the page's own description was available; say so briefly." : "";
  return generate(
    db,
    "ingest_article",
    summarySchema,
    `${SUMMARY_INSTRUCTIONS}${failed}${note}\n\nSOURCE "${extracted.title}" (${extracted.siteName}):\n${extracted.text.slice(0, MAX_PROMPT_TEXT)}`,
  );
}

const notesSchema = z.object({
  sections: z.array(z.object({ heading: z.string(), points: z.array(z.string()).max(10) })).max(8),
});

/**
 * For noarchive pages: notes in our own words instead of the text. Facts and
 * ideas are free to use; a sentence-by-sentence paraphrase would still be a derivative work.
 */
export async function writeNotes(db: SupabaseClient, extracted: Extracted): Promise<Block[]> {
  const { sections } = await generate(
    db,
    "ingest_article",
    notesSchema,
    `Write structured study notes about this source, in the source's language, entirely in your own words.
- Group the facts, claims and numbers into 2–8 titled sections of short points.
- Do not reproduce sentences; quote at most a few words, in quotation marks, when exact wording matters.

SOURCE "${extracted.title}":
${extracted.text.slice(0, MAX_PROMPT_TEXT)}`,
  );
  return assignIds(sectionsToBlocks(sections));
}
```

- [ ] **Step 4: `lib/pipeline/extract/x.ts`**

```ts
import { parseHTML } from "linkedom";
import { assignIds, inlineText, type BlockDraft, type Inline } from "../../blocks.ts";
import { FetchError } from "../fetch.ts";
import { htmlToDrafts } from "../html-to-blocks.ts";
import type { Extractor } from "./types.ts";

export function parseTweetHtml(html: string): { paragraphs: Inline[][]; text: string; date: string | null } {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const paragraphs = [...document.querySelectorAll("blockquote p")]
    .flatMap((p) => htmlToDrafts(p.outerHTML, { baseUrl: "https://x.com/" }))
    .filter((block): block is Extract<BlockDraft, { type: "paragraph" }> => block.type === "paragraph")
    .map((block) => block.content);
  const dateText = [...document.querySelectorAll("blockquote > a")].at(-1)?.textContent ?? "";
  const parsed = Date.parse(`${dateText} UTC`);
  return {
    paragraphs,
    text: paragraphs.map(inlineText).join("\n\n"),
    date: Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10),
  };
}

// oEmbed returns a single post without login; threads and images are out of reach.
export const extractX: Extractor = async (_db, url) => {
  const response = await fetch(`https://publish.twitter.com/oembed?omit_script=true&url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new FetchError(`x oembed ${response.status}`);
  const data = (await response.json()) as { author_name?: string; html?: string };
  const post = parseTweetHtml(data.html ?? "");
  if (!post.text) throw new Error("empty post");
  const author = data.author_name ?? null;
  return {
    blocks: assignIds(post.paragraphs.map((content): BlockDraft => ({ type: "paragraph", content }))),
    title: `${author ?? "X"}: ${post.text.slice(0, 80)}${post.text.length > 80 ? "…" : ""}`,
    author,
    siteName: "X",
    publishedAt: post.date,
    meta: { truncated: true },
    text: post.text,
  };
};
```

- [ ] **Step 5: `lib/pipeline/extract/youtube.ts`**

```ts
import { z } from "zod/v4";
import { assignIds, type BlockDraft } from "../../blocks.ts";
import { generate } from "../../llm.ts";
import { SUMMARY_INSTRUCTIONS, summarySchema } from "../summary.ts";
import { youtubeId } from "../util.ts";
import type { Extractor } from "./types.ts";

const videoSchema = summarySchema.extend({
  chapters: z.array(z.object({ seconds: z.int().min(0), title: z.string() })).max(40),
});

// One model call writes the summary and the chapters; the video itself is only embedded.
export const extractYoutube: Extractor = async (db, url, note) => {
  const id = youtubeId(new URL(url));
  if (!id) throw new Error("not a YouTube video URL");
  const watchUrl = `https://www.youtube.com/watch?v=${id}`;
  const oembed = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`, { signal: AbortSignal.timeout(15_000) });
  const info = oembed.ok ? ((await oembed.json()) as { title?: string; author_name?: string }) : {};
  const title = info.title ?? watchUrl;

  const { chapters, ...generated } = await generate(
    db,
    "ingest_video",
    videoSchema,
    `${SUMMARY_INSTRUCTIONS}\n- chapters: the video's sections in order, each with its start time in whole seconds (empty if it has no clear sections).\nThe source is the attached YouTube video "${title}".${note}`,
    { youtubeUrl: watchUrl },
  );

  const drafts: BlockDraft[] = [{ type: "video", provider: "youtube", videoId: id }];
  if (chapters.length) drafts.push({ type: "chapters", items: chapters });
  return {
    blocks: assignIds(drafts),
    title,
    author: info.author_name ?? null,
    siteName: "YouTube",
    publishedAt: null,
    meta: { videoId: id },
    text: "",
    generated,
  };
};
```

- [ ] **Step 6: `lib/pipeline/extract/index.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseHTML } from "linkedom";
import { FetchError, readText, safeFetch } from "../fetch.ts";
import { hostOf, type SourceKind } from "../util.ts";
import { extractArticle, readPageMeta } from "./article.ts";
import { extractArxiv } from "./arxiv.ts";
import { extractGithub } from "./github.ts";
import { extractPdf } from "./pdf.ts";
import type { Extracted, Extractor } from "./types.ts";
import { extractX } from "./x.ts";
import { extractYoutube } from "./youtube.ts";

const extractors: Record<SourceKind, Extractor> = {
  article: extractArticle,
  youtube: extractYoutube,
  arxiv: extractArxiv,
  github: extractGithub,
  x: extractX,
  pdf: extractPdf,
};

const failure = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Last resort: title and description only. Throws FetchError when the page itself is unreachable. */
export async function metadataOnly(url: string): Promise<Extracted> {
  const response = await safeFetch(url, { accept: "text/html" });
  if (!response.ok) throw new FetchError(`fetch ${response.status}`);
  const page = readPageMeta(parseHTML(await readText(response, 2 * 1024 * 1024)).document as unknown as Document);
  const title = page.title ?? url;
  return {
    blocks: [],
    title,
    author: null,
    siteName: page.siteName ?? hostOf(url),
    publishedAt: null,
    meta: { extractionFailed: true },
    text: `${title}\n\n${page.description ?? ""}`,
  };
}

/** The source's own extractor, then the generic article one, then metadata only. */
export async function extract(db: SupabaseClient, kind: SourceKind, url: string, note: string): Promise<Extracted> {
  try {
    return await extractors[kind](db, url, note);
  } catch (error) {
    if (error instanceof FetchError && kind === "article") throw error;
    console.warn(`${kind} extractor failed for ${url}: ${failure(error)}`);
  }
  if (kind !== "article") {
    try {
      return await extractArticle(db, url, note);
    } catch (error) {
      console.warn(`article fallback failed for ${url}: ${failure(error)}`);
    }
  }
  return metadataOnly(url);
}
```

- [ ] **Step 7: Futtatás**

Futtatás: `npm test` → PASS. Futtatás: `npx tsc --noEmit` → nincs kimenet.

- [ ] **Step 8: Commit**

```bash
git add lib/pipeline/summary.ts lib/pipeline/extract
git commit -m "feat: extract youtube and x sources with a fallback chain"
```

---

### Task 9: AI-zajszűrés és az új `processSource`

**Files:**
- Create: `lib/pipeline/cleanup.ts`, `lib/pipeline/cleanup.test.ts`, `lib/pipeline/ingest.test.ts`, `scripts/ingest-url.mts`
- Modify: `lib/pipeline/ingest.ts` (teljes újraírás), `package.json` (`ingest` script)

**Interfaces:**
- Consumes: `extract` (8. feladat); `summarize`, `writeNotes` (8. feladat); `mirrorImages`, `unusedMediaPaths`, `MEDIA_BUCKET` (5. feladat); `limitBlocks`, `parseBlocks`, `Block` (2. feladat); `generate`
- Produces:
  - `cleanup.ts`: `cleanupListing(blocks: Block[]): string`, `applyCleanup(blocks: Block[], remove: string[]): Block[]`, `aiCleanup(db, blocks: Block[]): Promise<Block[]>`
  - `ingest.ts`: `processSource(db, id: number): Promise<void>`, `retryPendingSources(db): Promise<number>` (az aláírás változatlan), `failureUpdate(hasPrevious: boolean, message: string)`, `removeUnusedMedia(db, sourceId: number, blocks: Block[]): Promise<void>`

- [ ] **Step 1: A tesztek megírása**

`lib/pipeline/cleanup.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds, type BlockDraft } from "../blocks.ts";
import { applyCleanup, cleanupListing } from "./cleanup.ts";

const blocks = assignIds(Array.from({ length: 10 }, (_, i): BlockDraft => ({ type: "paragraph", content: [{ text: `p${i} ${"x".repeat(200)}` }] })));

test("cleanupListing shows id, type and a 120 character preview", () => {
  const first = cleanupListing(blocks).split("\n")[0];
  assert.ok(first.startsWith(`${blocks[0].id} [paragraph] p0 `));
  assert.ok(first.length < 160);
});

test("applyCleanup removes named blocks but refuses to gut the article", () => {
  assert.equal(applyCleanup(blocks, [blocks[0].id, blocks[1].id]).length, 8);
  assert.equal(applyCleanup(blocks, blocks.slice(0, 6).map((b) => b.id)).length, 10);
  assert.equal(applyCleanup(blocks, ["unknown"]).length, 10);
});
```

`lib/pipeline/ingest.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { failureUpdate } from "./ingest.ts";

test("failureUpdate keeps a published post when re-extraction fails", () => {
  assert.deepEqual(failureUpdate(true, "fetch 404"), { error: "fetch 404" });
  assert.deepEqual(failureUpdate(false, "fetch 404"), { status: "failed", error: "fetch 404" });
  assert.equal(failureUpdate(false, "x".repeat(900)).error.length, 500);
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `npm test` → Elvárt: FAIL, `Cannot find module .../cleanup.ts`.

- [ ] **Step 3: `lib/pipeline/cleanup.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { blockText, type Block } from "../blocks.ts";
import { generate } from "../llm.ts";

const cleanupSchema = z.object({ remove: z.array(z.string()) });

export const cleanupListing = (blocks: Block[]) =>
  blocks.map((block) => `${block.id} [${block.type}] ${blockText(block).replace(/\s+/g, " ").slice(0, 120)}`).join("\n");

/** Removal that would drop half the article is a model error, not cleanup. */
export function applyCleanup(blocks: Block[], remove: string[]): Block[] {
  const drop = new Set(remove);
  const kept = blocks.filter((block) => !drop.has(block.id));
  return kept.length >= blocks.length / 2 + 1 || kept.length === blocks.length ? kept : blocks;
}

/** Layer 3: a cheap model flags leftovers the rules missed. Failure just skips it. */
export async function aiCleanup(db: SupabaseClient, blocks: Block[]): Promise<Block[]> {
  if (blocks.length < 3) return blocks;
  try {
    const { remove } = await generate(
      db,
      "ingest_cleanup",
      cleanupSchema,
      `Below are the blocks of a web article, one per line: id, [type], first characters.
List in "remove" the ids of blocks that are NOT part of the article itself: ads, sponsor notes,
newsletter or subscription prompts, share/follow buttons, cookie notices, author bios, "related posts",
comment sections, navigation. When unsure, keep the block.

${cleanupListing(blocks)}`,
    );
    return applyCleanup(blocks, remove);
  } catch (error) {
    console.warn(`ai cleanup skipped: ${error instanceof Error ? error.message : error}`);
    return blocks;
  }
}
```

Ellenőrizd a tesztet: 10 blokkból 2 törlése után 8 marad, és `8 >= 10/2 + 1 = 6`, tehát elfogadja. 6 törlése után 4 marad, `4 < 6`, tehát elutasítja.

- [ ] **Step 4: Az `ingest.ts` teljes újraírása**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { limitBlocks, parseBlocks, type Block } from "../blocks.ts";
import { aiCleanup } from "./cleanup.ts";
import { extract } from "./extract/index.ts";
import { MEDIA_BUCKET, mirrorImages, unusedMediaPaths } from "./images.ts";
import { summarize, writeNotes } from "./summary.ts";
import type { SourceKind } from "./util.ts";

const MAX_ATTEMPTS = 3;

type Source = { id: number; url: string; kind: SourceKind; note: string | null; attempts: number };

/** A failed re-extraction must not unpublish a post that already exists. */
export function failureUpdate(hasPrevious: boolean, message: string): { status?: "failed"; error: string } {
  const error = message.slice(0, 500);
  return hasPrevious ? { error } : { status: "failed", error };
}

export async function removeUnusedMedia(db: SupabaseClient, sourceId: number, blocks: Block[]): Promise<void> {
  const { data } = await db.storage.from(MEDIA_BUCKET).list(String(sourceId), { limit: 1000 });
  const unused = unusedMediaPaths((data ?? []).map((object) => `${sourceId}/${object.name}`), blocks);
  if (unused.length) await db.storage.from(MEDIA_BUCKET).remove(unused);
}

async function buildPost(db: SupabaseClient, source: Source, previous: Block[]) {
  const note = source.note ? `\nThe submitter's note: ${source.note}` : "";
  const extracted = await extract(db, source.kind, source.url, note);
  const meta: Record<string, unknown> = { ...extracted.meta };
  let blocks: Block[];

  if (extracted.meta.noarchive) {
    blocks = await writeNotes(db, extracted);
    meta.mirrored = false;
  } else {
    const limited = limitBlocks(await aiCleanup(db, extracted.blocks));
    blocks = await mirrorImages(db, source.id, limited.blocks, previous);
    meta.mirrored = !extracted.meta.extractionFailed && blocks.length > 0;
    if (limited.clipped) meta.clipped = true;
  }

  const generated = extracted.generated ?? (await summarize(db, extracted, note));
  return {
    title: generated.title,
    summary: generated.summary,
    key_points: generated.keyPoints,
    tags: generated.tags,
    author: extracted.author,
    source_site: extracted.siteName,
    published_at: extracted.publishedAt,
    blocks,
    meta,
  };
}

/**
 * Turns a submitted source into a post, or refreshes an existing one.
 * Only machine fields are written: `overrides` and `hidden_blocks` belong to
 * the submitter and are never touched here. Replaces only on success.
 */
export async function processSource(db: SupabaseClient, id: number): Promise<void> {
  const { data: source, error } = await db.from("sources").select("id, url, kind, note, attempts").eq("id", id).single<Source>();
  if (error || !source) throw error ?? new Error(`source ${id} not found`);
  await db.from("sources").update({ attempts: source.attempts + 1 }).eq("id", id);
  const { data: existing } = await db.from("posts").select("id, blocks").eq("source_id", id).maybeSingle();
  const previous = existing ? parseBlocks(existing.blocks) : [];

  try {
    const post = await buildPost(db, source, previous);
    const { error: saveError } = await db.from("posts").upsert(
      { source_id: source.id, kind: source.kind, url: source.url, ...post, blocks_hu: null, extracted_at: new Date().toISOString() },
      { onConflict: "source_id" },
    );
    if (saveError) throw saveError;
    await removeUnusedMedia(db, source.id, post.blocks);
    await db.from("sources").update({ status: "done", error: null }).eq("id", id);
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : String(failure);
    await db.from("sources").update(failureUpdate(Boolean(existing), message)).eq("id", id);
  }
}

/** Sources that never finished (e.g. the function was killed) or failed fewer than MAX_ATTEMPTS times. */
export async function retryPendingSources(db: SupabaseClient): Promise<number> {
  const { data } = await db
    .from("sources")
    .select("id")
    .neq("status", "done")
    .lt("attempts", MAX_ATTEMPTS)
    .order("id")
    .limit(10);
  for (const row of data ?? []) await processSource(db, row.id as number);
  return data?.length ?? 0;
}
```

- [ ] **Step 5: Futtatás**

Futtatás: `npm test` → PASS. Futtatás: `npx tsc --noEmit && npm run lint`.

- [ ] **Step 6: Fejlesztői eszköz és élő próba**

Előfeltétel: a Task 1-es migráció már lefutott, és a `.env.local`-ban megvan a Supabase és a Gemini kulcs.

Hozd létre a `scripts/ingest-url.mts`-t. Ez commitolva marad, mert a 14. feladat is ezt használja, és a felhasználónak is hasznos:

```ts
// Dev tool: runs one URL through the real pipeline against the configured Supabase project.
// Usage: npm run ingest -- <url>   (submits as the first invited user)
import { createClient } from "@supabase/supabase-js";
import { processSource } from "../lib/pipeline/ingest.ts";
import { detectSource, parseSubmittedUrl } from "../lib/pipeline/util.ts";

const url = parseSubmittedUrl(process.argv[2] ?? "");
if (!url) throw new Error("usage: npm run ingest -- <http(s) url>");
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data: users } = await db.auth.admin.listUsers();
const submitter = users?.users[0]?.id;
if (!submitter) throw new Error("no user to submit as: invite one first");

const { data: source, error } = await db
  .from("sources")
  .insert({ url: url.toString(), kind: detectSource(url), submitted_by: submitter })
  .select("id")
  .single();
if (error) throw error;
await processSource(db, source.id);

const { data: status } = await db.from("sources").select("status, error").eq("id", source.id).single();
const { data: post } = await db.from("posts").select("id, kind, source_site, meta, blocks").eq("source_id", source.id).maybeSingle();
console.log({
  source: source.id,
  ...status,
  post: post?.id,
  site: post?.source_site,
  meta: post?.meta,
  blocks: (post?.blocks as { type: string }[] | undefined)?.map((block) => block.type).join(","),
});
```

A `package.json` `scripts` részébe: `"ingest": "node --env-file=.env.local --experimental-strip-types --no-warnings scripts/ingest-url.mts"`.

Futtatás: `npm run ingest -- https://huggingface.co/blog/smollm3`
Elvárt:
- `status: 'done'`
- kb. 50–150 blokk, köztük `image`-ek
- a Supabase Storage `media/<source>/` mappájában `*-640.avif` és `*-1280.avif` fájlok

- [ ] **Step 7: Commit**

```bash
git add lib/pipeline/cleanup.ts lib/pipeline/cleanup.test.ts lib/pipeline/ingest.ts lib/pipeline/ingest.test.ts scripts/ingest-url.mts package.json
git commit -m "feat: build posts from blocks with ai cleanup and replace-on-success"
```

---

### Task 10: Közös UI-elemek és a meglévő ismétlések kiváltása

**Files:**
- Modify: `components/ui/button.tsx`, `app/globals.css`, `app/components/page-header.tsx`, `app/archive/page.tsx`, `app/library/page.tsx`, `app/login/page.tsx`, `app/library/submit-form.tsx`, `app/components/digest-dashboard.tsx`, `app/components/language-toggle.tsx`, `app/error.tsx`, `app/not-found.tsx`, `CLAUDE.md`

**Interfaces:**
- Produces:
  - a `Button` új variánsai: `ink` (ink háttér, hoverre signal), `signal` (signal háttér, ink keret), `brutal` (paper háttér, ink keret, hoverre signal)
  - `focus-ring` utility; a színe a `--focus` változóval írható felül
  - `PageHero(props: { eyebrow: string; title: string; lead: ReactNode; aside?: ReactNode })` az `app/components/page-header.tsx`-ben

- [ ] **Step 1: Mérés előtte**

Futtatás: `npm run dup` és `npx -y jscpd@4.3.0 app lib --min-lines 4 --min-tokens 35 --reporters console`.
Jegyezd fel az eredményt. A tervezéskor a 6/60-as küszöbön 0 klón volt, a 4/35-ösön 2 kicsi: az archívum és a Library hero-szekciója, valamint a dashboard két `modelContext`-eszköze (ez utóbbi két külön eszköz sémája, maradhat).

- [ ] **Step 2: Gombvariánsok** (`components/ui/button.tsx`)

A `variant` objektumba, a `link:` sor után:

```ts
        // House variants. rounded-* is already 0 through --radius, so no rounded-none needed.
        ink: "bg-ink font-mono text-xs text-paper hover:bg-signal hover:text-ink",
        signal: "border-2 border-ink bg-signal font-mono text-xs text-ink hover:bg-ink hover:text-paper",
        brutal: "border-2 border-ink bg-paper font-mono text-xs text-ink hover:bg-signal",
```

- [ ] **Step 3: `focus-ring` utility** (`app/globals.css`, a meglévő `@utility` sorok után)

```css
/* Keyboard focus in the house style. Override the colour with --focus (e.g. on signal-coloured controls). */
@utility focus-ring {
  &:focus-visible {
    outline: 2px solid var(--focus, var(--signal));
    outline-offset: 2px;
  }
}
```

- [ ] **Step 4: `PageHero`** (`app/components/page-header.tsx`, a `PageHeader` alá; `import type { ReactNode } from "react";`)

```tsx
/** The cream title band of the secondary pages: eyebrow, `TITLE//`, lead text, optional side panel. */
export function PageHero({ eyebrow, title, lead, aside }: { eyebrow: string; title: string; lead: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b-2 border-signal bg-cream px-4 py-10 text-ink sm:px-10 sm:py-16">
      <div className={`mx-auto max-w-6xl ${aside ? "grid gap-8 lg:grid-cols-[1fr_minmax(0,460px)] lg:items-end" : ""}`}>
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-signal">{eyebrow}</p>
          <h1 className="mt-3 font-display text-[clamp(2.6rem,11vw,8.8rem)] leading-[0.78] tracking-[-0.07em]">
            {title}
            <span className="text-signal">{"//"}</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-7 text-ink/65">{lead}</p>
        </div>
        {aside}
      </div>
    </section>
  );
}
```

Az `app/archive/page.tsx`-ben a cream `<section>` helyére: `<PageHero eyebrow="WEEKLY FREEZE / HETI ZÁRÁS" title="ARCHIVE" lead={…a mostani nyelvfüggő szöveg…} />`.
Az `app/library/page.tsx`-ben: `<PageHero eyebrow="MIRRORED SOURCES / KÖNYVTÁR" title="LIBRARY" lead={…} aside={<SubmitForm language={lang} />} />`.

- [ ] **Step 5: A meglévő ismétlések kiváltása**

- **Fókuszkeret:** minden `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal` helyére `focus-ring` kerül. A dashboard chip-sávjánál `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink` helyett `focus-ring [--focus:var(--ink)]`.
- **`ink` gombok:**
  - A dashboard „Megnyitás” gombja `<Button asChild variant="ink">` lesz.
  - A login gombja `<Button type="submit" variant="ink" className="w-full">` lesz.
  - Az `error.tsx` és a `not-found.tsx` nyers gombja, illetve linkje `<Button variant="ink" className="mt-6 min-h-10 w-full">` lesz (a linknél `asChild`-dal).
- **`signal` gombok:** a dashboard to-do „+” gombja `<Button size="icon" variant="signal" …>`, a Library beküldő gombja `<Button type="submit" variant="signal" className="min-h-10" …>`.

Ellenőrzés: ezeknek nem szabad találatot adniuk:

```bash
grep -rn "focus-visible:outline-2" app
grep -rn "rounded-none bg-ink font-mono\|border-2 border-ink bg-signal\|border-b-2 border-signal bg-cream" app --include=*.tsx | grep -v page-header.tsx
```

- [ ] **Step 6: `CLAUDE.md`**

A „Design language” szakasz végére: „Közös vezérlők: `Button` `ink` / `signal` / `brutal` variáns, `focus-ring` utility, `PageHeader` és `PageHero`. Ezeket használd, ne ismételd az osztálylistákat.” A `button.tsx`-re vonatkozó figyelmeztetésbe: „…carries an extended size set and the house variants `ink` / `signal` / `brutal`…”.

- [ ] **Step 7: Ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`.
Elvárt:
- minden zöld
- a 4/35-ös futás legfeljebb 1 klónt mutat (a `modelContext`-et)
- Playwright 360 px-en: a `/login`, `/archive` és `/library` kinézete nem változott (összehasonlítás az előtte készült képpel), és a Tab-bal végigléptetett elemeken látszik a narancs fókuszkeret

- [ ] **Step 8: Commit**

```bash
git add components/ui/button.tsx app CLAUDE.md
git commit -m "refactor: share button variants, focus ring and page hero"
```

---

### Task 11: Renderer és a poszt oldal

**Files:**
- Create: `app/components/post-blocks.tsx`, `app/library/[id]/post-toolbar.tsx`
- Modify: `lib/content.ts`, `app/library/[id]/page.tsx`, `app/library/page.tsx`

**Interfaces:**
- Consumes: `Block`, `parseBlocks`, `plainText` (2. feladat); `formatTimestamp`, `SourceKind`, `hostOf`, `parseId` (3. feladat); `mediaUrl` (`lib/media.ts`, 5. feladat); a `Button` variánsai (10. feladat); `getLanguage` (`lib/language.ts`)
- Produces:
  - `content.ts`: `type PostMeta`, `type Post` (a mezőket lásd lent), `getPost(db, id): Promise<Post | null>`, `getPosts(db): Promise<Post[]>`
  - `post-blocks.tsx`: `PostBlocks(props: { blocks: Block[]; language: Language; hidden?: string[]; showHidden?: boolean; videoStart?: number; controls?: (block: Block) => ReactNode })`
  - `post-toolbar.tsx`: `PostToolbar(props: { postId: number; language: Language; hasTranslation: boolean; showingTranslation: boolean; canEdit: boolean })`. A fordítás gomb a 12. feladatban kap valódi route-ot; itt már hívja a `/api/posts/[id]/translate`-et.

- [ ] **Step 1: `lib/content.ts`: a `Post` típus és a lekérdezések**

A meglévő `Post`, `POST_COLUMNS`, `toPost`, `getPosts`, `getPost` helyére:

```ts
import { parseBlocks, type Block } from "@/lib/blocks";
import type { SourceKind } from "@/lib/pipeline/util";

export type PostMeta = {
  mirrored?: boolean;
  noarchive?: boolean;
  extractionFailed?: boolean;
  truncated?: boolean;
  clipped?: boolean;
};

export type Post = {
  id: number;
  sourceId: number;
  kind: SourceKind;
  url: string;
  author: string | null;
  siteName: string | null;
  publishedAt: string | null;
  title: Localized;
  summary: Localized;
  keyPoints: Record<"hu" | "en", string[]>;
  tags: string[];
  blocks: Block[];
  blocksHu: Block[] | null;
  meta: PostMeta;
  hiddenBlocks: string[];
  submittedBy: string | null;
  extractedAt: string | null;
  createdAt: string;
};

const LIST_COLUMNS = "id, source_id, kind, url, author, source_site, published_at, title, summary, key_points, tags, meta, overrides, hidden_blocks, extracted_at, created_at";
const POST_COLUMNS = `${LIST_COLUMNS}, blocks, blocks_hu, sources(submitted_by)`;

type Overrides = { title?: Localized; summary?: Localized };

function toPost(row: Record<string, unknown>): Post {
  const overrides = (row.overrides ?? {}) as Overrides;
  const source = row.sources as { submitted_by: string } | null | undefined;
  return {
    id: row.id as number,
    sourceId: row.source_id as number,
    kind: row.kind as SourceKind,
    url: row.url as string,
    author: row.author as string | null,
    siteName: row.source_site as string | null,
    publishedAt: row.published_at as string | null,
    // Submitter edits win over the model's text; re-extraction never overwrites them.
    title: overrides.title ?? (row.title as Localized),
    summary: overrides.summary ?? (row.summary as Localized),
    keyPoints: row.key_points as Post["keyPoints"],
    tags: row.tags as string[],
    blocks: parseBlocks(row.blocks),
    blocksHu: row.blocks_hu ? parseBlocks(row.blocks_hu) : null,
    meta: (row.meta ?? {}) as PostMeta,
    hiddenBlocks: (row.hidden_blocks ?? []) as string[],
    submittedBy: source?.submitted_by ?? null,
    extractedAt: row.extracted_at as string | null,
    createdAt: row.created_at as string,
  };
}

export async function getPosts(db: SupabaseClient): Promise<Post[]> {
  const { data } = await db.from("posts").select(LIST_COLUMNS).order("created_at", { ascending: false }).limit(100);
  return (data ?? []).map(toPost);
}

export async function getPost(db: SupabaseClient, id: number): Promise<Post | null> {
  const { data } = await db.from("posts").select(POST_COLUMNS).eq("id", id).maybeSingle();
  return data ? toPost(data) : null;
}
```

- [ ] **Step 2: `app/components/post-blocks.tsx`**

```tsx
import type { ReactNode } from "react";
import type { Language } from "@/data/digest-types";
import type { Block, ImageBlock, Inline } from "@/lib/blocks";
import { mediaUrl } from "@/lib/media";
import { formatTimestamp } from "@/lib/pipeline/util";

// Plain component (no hooks, no server-only imports) so the editor can reuse it client-side.

const labels = {
  hu: { hidden: (n: number) => `${n} elrejtett blokk — megjelenítés`, missing: "A kép nem érhető el", chapters: "Fejezetek", stars: "csillag" },
  en: { hidden: (n: number) => `${n} hidden block${n > 1 ? "s" : ""} — show`, missing: "Image unavailable", chapters: "Chapters", stars: "stars" },
};

function InlineContent({ spans }: { spans: Inline[] }) {
  return spans.map((span, index) => {
    let node: ReactNode = span.text;
    if (span.code) node = <code className="bg-ink/10 px-1 font-mono text-[0.9em]">{node}</code>;
    if (span.italic) node = <em>{node}</em>;
    if (span.bold) node = <strong>{node}</strong>;
    if (span.href) {
      node = (
        <a href={span.href} target="_blank" rel="noreferrer" className="text-signal underline underline-offset-2 hover:text-ink">
          {node}
        </a>
      );
    }
    return <span key={index}>{node}</span>;
  });
}

function ImageView({ block, priority, language }: { block: ImageBlock; priority: boolean; language: Language }) {
  if (!block.path || !block.format || !block.widths?.length) {
    return (
      <p className="border-2 border-dashed border-ink/35 p-4 font-mono text-xs text-ink/60">
        {labels[language].missing}:{" "}
        <a href={block.originalUrl} target="_blank" rel="noreferrer" className="text-signal underline [overflow-wrap:anywhere]">
          {block.originalUrl}
        </a>
      </p>
    );
  }
  const largest = Math.max(...block.widths);
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element -- variants are pre-encoded; next/image would re-optimize them */}
      <img
        src={mediaUrl(block.path, largest, block.format)}
        srcSet={block.format === "svg" ? undefined : block.widths.map((w) => `${mediaUrl(block.path!, w, block.format!)} ${w}w`).join(", ")}
        sizes="(min-width: 768px) 680px, 100vw"
        alt={block.alt}
        width={block.width}
        height={block.height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className="h-auto w-full border-2 border-ink bg-cream bg-cover"
        style={block.placeholder ? { backgroundImage: `url(${block.placeholder})` } : undefined}
      />
      {block.caption && <figcaption className="mt-2 font-mono text-xs leading-5 text-ink/60">{block.caption}</figcaption>}
    </figure>
  );
}

function BlockView({ block, priority, videoStart, language }: { block: Block; priority: boolean; videoStart?: number; language: Language }) {
  switch (block.type) {
    case "heading": {
      const size = { 2: "text-3xl", 3: "text-2xl", 4: "text-xl" }[block.level];
      const Tag = `h${block.level}` as "h2" | "h3" | "h4";
      return <Tag className={`mt-10 font-display ${size} leading-[1.05] tracking-tight [overflow-wrap:anywhere]`}>{block.text}</Tag>;
    }
    case "paragraph":
      return <p className="[overflow-wrap:anywhere]"><InlineContent spans={block.content} /></p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-2 pl-6 [overflow-wrap:anywhere]`}>
          {block.items.map((item, index) => <li key={index}><InlineContent spans={item} /></li>)}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote className="border-l-4 border-signal pl-5 text-ink/80 [overflow-wrap:anywhere]">
          <InlineContent spans={block.content} />
        </blockquote>
      );
    case "code":
      return (
        <div className="border-2 border-ink bg-ink text-paper">
          {block.language && <p className="border-b border-paper/15 px-4 py-1 font-mono text-[10px] tracking-[0.15em] text-paper/50">{block.language.toUpperCase()}</p>}
          <pre className="overflow-x-auto p-4 font-mono text-sm leading-6"><code>{block.code}</code></pre>
        </div>
      );
    case "image":
      return <ImageView block={block} priority={priority} language={language} />;
    case "video": {
      const src = block.provider === "youtube"
        ? `https://www.youtube-nocookie.com/embed/${block.videoId}${videoStart ? `?start=${videoStart}&autoplay=1` : ""}`
        : `https://player.vimeo.com/video/${block.videoId}${videoStart ? `#t=${videoStart}s` : ""}`;
      return (
        <div id="video" className="aspect-video scroll-mt-24 border-2 border-ink">
          <iframe src={src} title="Video" allow="encrypted-media; picture-in-picture; autoplay" allowFullScreen className="size-full" />
        </div>
      );
    }
    case "chapters":
      return (
        <nav aria-label={labels[language].chapters} className="border-2 border-ink bg-paper p-4">
          <p className="font-mono text-[10px] tracking-[0.15em] text-signal">{labels[language].chapters.toUpperCase()}</p>
          <ol className="mt-2 space-y-1">
            {block.items.map((chapter) => (
              <li key={chapter.seconds}>
                <a href={`?t=${chapter.seconds}#video`} className="flex min-h-10 items-center gap-3 font-mono text-sm hover:text-signal sm:min-h-0">
                  <span className="w-16 shrink-0 text-signal">{formatTimestamp(chapter.seconds)}</span>
                  <span>{chapter.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      );
    case "repo":
      return (
        <a href={block.url} target="_blank" rel="noreferrer" className="block border-2 border-ink bg-paper p-5 shadow-[5px_5px_0_var(--ink)] transition hover:shadow-[8px_8px_0_var(--signal)]">
          <p className="font-mono text-sm font-bold [overflow-wrap:anywhere]">{block.fullName}</p>
          <p className="mt-2 font-mono text-xs text-ink/60">
            ★ {block.stars.toLocaleString("hu-HU")} {labels[language].stars}
            {block.language && ` · ${block.language}`}
            {block.license && ` · ${block.license}`}
          </p>
          {block.topics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {block.topics.slice(0, 8).map((topic) => <span key={topic} className="border border-ink/30 px-2 py-1 font-mono text-[10px]">#{topic}</span>)}
            </div>
          )}
        </a>
      );
    case "divider":
      return <hr className="border-t-2 border-ink" />;
  }
}

export function PostBlocks({
  blocks,
  language,
  hidden = [],
  showHidden = false,
  videoStart,
  controls,
}: {
  blocks: Block[];
  language: Language;
  hidden?: string[];
  showHidden?: boolean;
  videoStart?: number;
  /** Edit mode: rendered beside every block, and hidden blocks stay visible (dimmed). */
  controls?: (block: Block) => ReactNode;
}) {
  const hiddenSet = new Set(hidden);
  const out: ReactNode[] = [];
  let run = 0;
  let firstImage = true;
  const flushHidden = (key: string) => {
    if (!run) return;
    out.push(
      <a key={`hidden-${key}`} href="?hidden=show" className="block border border-dashed border-ink/35 px-4 py-2 font-mono text-xs text-ink/55 hover:text-signal">
        {labels[language].hidden(run)}
      </a>,
    );
    run = 0;
  };
  for (const block of blocks) {
    const isHidden = hiddenSet.has(block.id);
    if (isHidden && !showHidden && !controls) {
      run++;
      continue;
    }
    flushHidden(block.id);
    const priority = block.type === "image" && firstImage;
    if (block.type === "image") firstImage = false;
    out.push(
      <div key={block.id} id={`b-${block.id}`} data-block-id={block.id} className={`scroll-mt-24 ${controls ? "relative pr-12" : ""} ${isHidden ? "opacity-40" : ""}`}>
        {controls?.(block)}
        <BlockView block={block} priority={priority} videoStart={videoStart} language={language} />
      </div>,
    );
  }
  flushHidden("end");
  return <div className="space-y-5 text-[17px] leading-[1.7]">{out}</div>;
}
```

- [ ] **Step 3: `app/library/[id]/post-toolbar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Languages, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Language } from "@/data/digest-types";

const copy = {
  hu: { original: "Eredeti", translated: "Magyarul", translate: "Fordítás magyarra", working: "Fordítás…", failed: "A fordítás nem sikerült, próbáld újra.", edit: "Szerkesztés" },
  en: { original: "Original", translated: "Hungarian", translate: "Translate to Hungarian", working: "Translating…", failed: "Translation failed, try again.", edit: "Edit" },
};

export function PostToolbar({ postId, language, hasTranslation, showingTranslation, canEdit }: {
  postId: number;
  language: Language;
  hasTranslation: boolean;
  showingTranslation: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const t = copy[language];

  async function translate() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/posts/${postId}/translate`, { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
      router.push(`/library/${postId}?text=hu`);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasTranslation ? (
        <div className="flex" role="group">
          <Button asChild variant={showingTranslation ? "brutal" : "ink"} className="min-h-10">
            <Link href={`/library/${postId}`} aria-current={!showingTranslation}>{t.original}</Link>
          </Button>
          <Button asChild variant={showingTranslation ? "ink" : "brutal"} className="-ml-0.5 min-h-10">
            <Link href={`/library/${postId}?text=hu`} aria-current={showingTranslation}>{t.translated}</Link>
          </Button>
        </div>
      ) : (
        <Button variant="brutal" className="min-h-10" onClick={() => void translate()} disabled={busy}>
          <Languages /> {busy ? t.working : t.translate}
        </Button>
      )}
      {canEdit && (
        <Button asChild variant="brutal" className="min-h-10">
          <Link href={`/library/${postId}?edit=1`}><PenLine /> {t.edit}</Link>
        </Button>
      )}
      {failed && <p role="status" className="font-mono text-xs text-signal">{t.failed}</p>}
    </div>
  );
}
```

- [ ] **Step 4: `app/library/[id]/page.tsx` újraírása**

```tsx
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { LanguageToggle } from "@/app/components/language-toggle";
import { PageHeader } from "@/app/components/page-header";
import { PostBlocks } from "@/app/components/post-blocks";
import { Button } from "@/components/ui/button";
import { plainText } from "@/lib/blocks";
import { getPost } from "@/lib/content";
import { getLanguage } from "@/lib/language";
import { hostOf, parseId } from "@/lib/pipeline/util";
import { createClient, getViewer } from "@/lib/supabase/server";
import { PostToolbar } from "./post-toolbar";

export const dynamic = "force-dynamic";

const kindLabel = { article: "ARTICLE", youtube: "VIDEO", arxiv: "PAPER", github: "REPO", x: "POST", pdf: "PDF" } as const;

const notices = {
  hu: { noarchive: "Saját összefoglaló — az eredeti:", failed: "A tartalmat nem sikerült átmenteni — az eredeti:", truncated: "Csak az első poszt került be.", clipped: "A forrás túl hosszú volt, az eleje került be.", original: "Eredeti forrás", min: "perc" },
  en: { noarchive: "Our own notes — the original:", failed: "The content could not be mirrored — the original:", truncated: "Only the first post was captured.", clipped: "The source was too long; the beginning was kept.", original: "Original source", min: "min" },
};

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ text?: string; hidden?: string; t?: string; edit?: string }>;
}) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/library/${id}`);
  const query = await searchParams;
  const language = await getLanguage();
  const postId = parseId(id);
  const post = postId ? await getPost(await createClient(), postId) : null;
  if (!post) notFound();

  const t = notices[language];
  const canEdit = post.submittedBy === viewer.id;
  const showingTranslation = query.text === "hu" && Boolean(post.blocksHu);
  const blocks = showingTranslation ? post.blocksHu! : post.blocks;
  const minutes = Math.max(1, Math.round(plainText(post.blocks).split(/\s+/).length / 220));
  const start = Number.parseInt(query.t ?? "", 10);

  return (
    <main className="min-h-dvh bg-ink text-paper">
      <PageHeader backHref="/library" backLabel="LIBRARY">
        <LanguageToggle language={language} />
      </PageHeader>

      <article className="bg-cream text-ink">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-10 sm:py-16">
          <header className="border-b-2 border-ink pb-6">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tracking-[0.15em] text-signal">
              <span className="border border-signal px-2 py-0.5">{kindLabel[post.kind]}</span>
              <span>{post.siteName ?? hostOf(post.url)}</span>
              {post.author && <span className="text-ink/60">{post.author}</span>}
              {post.publishedAt && <span className="text-ink/60">{post.publishedAt}</span>}
              <span className="text-ink/60">{minutes} {t.min}</span>
            </p>
            <h1 className="mt-4 font-display text-[clamp(1.9rem,6vw,4.6rem)] leading-[0.95] tracking-[-0.05em] [overflow-wrap:anywhere]">{post.title[language]}</h1>
            {(post.meta.noarchive || post.meta.extractionFailed) && (
              <p className="mt-4 border-l-4 border-signal pl-4 text-sm">
                {post.meta.noarchive ? t.noarchive : t.failed}{" "}
                <a href={post.url} target="_blank" rel="noreferrer" className="text-signal underline [overflow-wrap:anywhere]">{post.url}</a>
              </p>
            )}
            {post.meta.truncated && <p className="mt-2 font-mono text-xs text-ink/60">{t.truncated}</p>}
            {post.meta.clipped && <p className="mt-2 font-mono text-xs text-ink/60">{t.clipped}</p>}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <PostToolbar postId={post.id} language={language} hasTranslation={Boolean(post.blocksHu)} showingTranslation={showingTranslation} canEdit={canEdit} />
              <Button asChild variant="ink" className="min-h-10">
                <a href={post.url} target="_blank" rel="noreferrer">{t.original} <ExternalLink /></a>
              </Button>
            </div>
          </header>

          <p className="mt-8 text-lg leading-8">{post.summary[language]}</p>
          {post.keyPoints[language].length > 0 && (
            <div className="mt-8 border-l-4 border-signal pl-5">
              <p className="font-mono text-[10px] tracking-[0.15em] text-signal">{language === "hu" ? "KULCSPONTOK" : "KEY POINTS"}</p>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-base leading-7">
                {post.keyPoints[language].map((point) => <li key={point}>{point}</li>)}
              </ul>
            </div>
          )}

          {blocks.length > 0 && (
            <section className="mt-12">
              <PostBlocks
                blocks={blocks}
                language={language}
                hidden={post.hiddenBlocks}
                showHidden={query.hidden === "show"}
                videoStart={Number.isFinite(start) && start > 0 ? start : undefined}
              />
            </section>
          )}

          <p className="mt-12 border-t-2 border-ink pt-4 font-mono text-[10px] tracking-[0.15em] text-ink/55 [overflow-wrap:anywhere]">
            © {post.author ?? post.siteName ?? hostOf(post.url)} · {post.url}
          </p>
        </div>
      </article>
    </main>
  );
}
```

(Az `edit=1` ágat a 13. feladat adja hozzá.)

- [ ] **Step 5: `app/library/page.tsx`: típusikonok és `hostOf`**

A kártyán a `new URL(post.url).hostname` helyére `hostOf(post.url)` kerüljön (import: `@/lib/pipeline/util`). Cseréld le az ikon-importot és az ikonválasztást is:

```tsx
import { BookOpen, FileText, FlaskConical, GitFork, MessageSquareQuote, PlayCircle } from "lucide-react";
// …
const kindIcons = { article: FileText, youtube: PlayCircle, arxiv: FlaskConical, github: GitFork, x: MessageSquareQuote, pdf: FileText } as const;
// a map-en belül:
const Icon = kindIcons[post.kind];
// és a MIRRORED jelvény feltétele:
{post.meta.mirrored && <span className="ml-auto flex items-center gap-1 font-mono text-[10px] opacity-60"><BookOpen className="size-3" /> MIRRORED</span>}
```

- [ ] **Step 6: Ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test`.
Futtatás: `npx next dev -p 3000`. Nyisd meg a 9. feladat élő próbájában elkészült poszt oldalát (`/library/<id>`) egy bejelentkezett Playwright-munkamenetben, 360 és 1280 px-en. A belépéshez a `generateLink` + `/auth/callback` módszer kell, ahogy a korábbi ellenőrzésnél.
Elvárt:
- van forrásjelölő fejléc
- a képek a `/media/...avif` címről jönnek (hálózati lista: 200, `image/avif`)
- nincs vízszintes görgetés (`scrollWidth <= innerWidth`)

- [ ] **Step 7: Commit**

```bash
git add app/components/post-blocks.tsx "app/library/[id]" app/library/page.tsx lib/content.ts
git commit -m "feat: render posts from blocks with an attribution header"
```

---

### Task 12: Fordítás kérésre

**Files:**
- Create: `lib/translate.ts`, `lib/translate.test.ts`, `app/api/posts/[id]/translate/route.ts`

**Interfaces:**
- Consumes: `Block`, `parseBlocks` (2. feladat); `generate` (`lib/llm.ts`); `getReader`, `jsonError`, `parseId` (3. feladat); `createAdminClient`
- Produces:
  - `type TranslationItem = { id: string; text?: string; spans?: string[]; items?: string[][]; caption?: string; alt?: string; chapters?: string[] }`
  - `translatable(blocks: Block[]): TranslationItem[]`
  - `chunkTranslatable(items: TranslationItem[], maxChars?: number): TranslationItem[][]`
  - `applyTranslation(blocks: Block[], translated: TranslationItem[]): Block[] | null`
  - `translationSchema`
  - `POST /api/posts/[id]/translate` → `{ ok: true }` / 401 / 404 / 502

- [ ] **Step 1: A tesztek megírása** (`lib/translate.test.ts`)

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { assignIds, type BlockDraft } from "./blocks.ts";
import { applyTranslation, chunkTranslatable, translatable } from "./translate.ts";

const blocks = assignIds([
  { type: "heading", level: 2, text: "Results" },
  { type: "paragraph", content: [{ text: "Read the " }, { text: "paper", href: "https://a.test/" }, { text: " now." }] },
  { type: "list", ordered: false, items: [[{ text: "one" }], [{ text: "two" }]] },
  { type: "code", code: "x = 1" },
  { type: "image", originalUrl: "https://a.test/i.png", alt: "chart", caption: "Speed", path: "1/abc", placeholder: "data:image/webp;base64,AAA" },
] satisfies BlockDraft[]);

test("translatable sends text only: no code, no image data", () => {
  const view = translatable(blocks);
  assert.equal(view.length, 4);
  assert.deepEqual(view[1], { id: blocks[1].id, spans: ["Read the ", "paper", " now."] });
  assert.equal(JSON.stringify(view).includes("base64"), false);
});

test("applyTranslation keeps structure, links and image data", () => {
  const result = applyTranslation(blocks, [
    { id: blocks[0].id, text: "Eredmények" },
    { id: blocks[1].id, spans: ["Olvasd el a ", "cikket", " most."] },
    { id: blocks[2].id, items: [["egy"], ["kettő"]] },
    { id: blocks[4].id, alt: "grafikon", caption: "Sebesség" },
  ]);
  assert.ok(result);
  assert.equal(result[1].type === "paragraph" && result[1].content[1].href, "https://a.test/");
  assert.equal(result[1].type === "paragraph" && result[1].content[1].text, "cikket");
  assert.equal(result[3].type === "code" && result[3].code, "x = 1");
  assert.equal(result[4].type === "image" && result[4].placeholder, "data:image/webp;base64,AAA");
  assert.deepEqual(result.map((b) => b.id), blocks.map((b) => b.id));
});

test("applyTranslation span mismatch: that block falls back to plain text", () => {
  const result = applyTranslation(blocks, [
    { id: blocks[0].id, text: "Eredmények" },
    { id: blocks[1].id, spans: ["Olvasd el most a cikket."] },
    { id: blocks[2].id, items: [["egy"], ["kettő"]] },
    { id: blocks[4].id, alt: "grafikon", caption: "Sebesség" },
  ]);
  assert.ok(result);
  assert.deepEqual(result[1].type === "paragraph" && result[1].content, [{ text: "Olvasd el most a cikket." }]);
});

test("applyTranslation rejects a missing block", () => {
  assert.equal(applyTranslation(blocks, [{ id: blocks[0].id, text: "Eredmények" }]), null);
});

test("chunkTranslatable splits by size and keeps order", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, text: "x".repeat(4000) }));
  const chunks = chunkTranslatable(items, 10_000);
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.flat().map((item) => item.id), items.map((item) => item.id));
});
```

- [ ] **Step 2: Futtatás, el kell buknia**

Futtatás: `npm test` → Elvárt: FAIL, `Cannot find module .../translate.ts`.

- [ ] **Step 3: `lib/translate.ts`**

```ts
import { z } from "zod/v4";
import type { Block, Inline } from "./blocks.ts";

// Only text goes to the model and only text comes back; structure, links and
// image data are copied from the original, so a translation cannot corrupt them.

export const translationItemSchema = z.object({
  id: z.string(),
  text: z.string().optional(),
  spans: z.array(z.string()).optional(),
  items: z.array(z.array(z.string())).optional(),
  caption: z.string().optional(),
  alt: z.string().optional(),
  chapters: z.array(z.string()).optional(),
});
export type TranslationItem = z.infer<typeof translationItemSchema>;
export const translationSchema = z.object({ blocks: z.array(translationItemSchema) });

export function translatable(blocks: Block[]): TranslationItem[] {
  return blocks.flatMap((block): TranslationItem[] => {
    switch (block.type) {
      case "heading":
        return [{ id: block.id, text: block.text }];
      case "paragraph":
      case "quote":
        return [{ id: block.id, spans: block.content.map((span) => span.text) }];
      case "list":
        return [{ id: block.id, items: block.items.map((item) => item.map((span) => span.text)) }];
      case "image":
        return block.alt || block.caption ? [{ id: block.id, alt: block.alt, caption: block.caption }] : [];
      case "chapters":
        return [{ id: block.id, chapters: block.items.map((item) => item.title) }];
      default:
        return [];
    }
  });
}

export function chunkTranslatable(items: TranslationItem[], maxChars = 15_000): TranslationItem[][] {
  const chunks: TranslationItem[][] = [];
  let current: TranslationItem[] = [];
  let size = 0;
  for (const item of items) {
    const length = JSON.stringify(item).length;
    if (current.length && size + length > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Same span count keeps the marks; otherwise the block degrades to one plain span. */
function spansFrom(original: Inline[], translated: string[] | undefined): Inline[] {
  if (!translated) return original;
  if (translated.length === original.length) return original.map((span, i) => ({ ...span, text: translated[i] }));
  return [{ text: translated.join("") }];
}

/** Null when a translatable block is missing from the answer: the caller must not save it. */
export function applyTranslation(blocks: Block[], translated: TranslationItem[]): Block[] | null {
  const byId = new Map(translated.map((item) => [item.id, item]));
  if (translatable(blocks).some((item) => !byId.has(item.id))) return null;
  return blocks.map((block): Block => {
    const item = byId.get(block.id);
    if (!item) return block;
    switch (block.type) {
      case "heading":
        return { ...block, text: item.text ?? block.text };
      case "paragraph":
      case "quote":
        return { ...block, content: spansFrom(block.content, item.spans) };
      case "list":
        return { ...block, items: block.items.map((spans, i) => spansFrom(spans, item.items?.[i])) };
      case "image":
        return { ...block, alt: item.alt ?? block.alt, caption: item.caption ?? block.caption };
      case "chapters":
        return { ...block, items: block.items.map((chapter, i) => ({ ...chapter, title: item.chapters?.[i] ?? chapter.title })) };
      default:
        return block;
    }
  });
}

export const TRANSLATE_INSTRUCTIONS = `Translate every text field of these content blocks into natural, idiomatic Hungarian.
- Return the same blocks with the same ids and the same fields.
- "spans" are consecutive pieces of one sentence (some are links or bold): return exactly as many spans, each translated so that joined together they read naturally.
- Keep code, URLs, product and model names, numbers and units unchanged.`;
```

- [ ] **Step 4: A route** (`app/api/posts/[id]/translate/route.ts`)

```ts
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { parseBlocks } from "@/lib/blocks";
import { generate } from "@/lib/llm";
import { parseId } from "@/lib/pipeline/util";
import { createAdminClient, getReader } from "@/lib/supabase/server";
import { TRANSLATE_INSTRUCTIONS, applyTranslation, chunkTranslatable, translatable, translationSchema } from "@/lib/translate";

export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const reader = await getReader();
  if (!reader) return jsonError(401, "unauthorized");
  const postId = parseId((await params).id);
  const { data: post } = postId
    ? await reader.db.from("posts").select("id, blocks, blocks_hu").eq("id", postId).maybeSingle()
    : { data: null };
  if (!post) return jsonError(404, "not_found");
  if (post.blocks_hu) return NextResponse.json({ ok: true });

  // model_settings and posts writes need the secret key; the reader was checked above.
  const admin = createAdminClient();
  const blocks = parseBlocks(post.blocks);
  try {
    const answers = await Promise.all(
      chunkTranslatable(translatable(blocks)).map((chunk) =>
        generate(admin, "translate_post", translationSchema, `${TRANSLATE_INSTRUCTIONS}\n\n${JSON.stringify(chunk)}`),
      ),
    );
    const translated = applyTranslation(blocks, answers.flatMap((answer) => answer.blocks));
    if (!translated) return jsonError(502, "translation_shape");
    const { error } = await admin.from("posts").update({ blocks_hu: translated }).eq("id", post.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn(`translate ${post.id}: ${error instanceof Error ? error.message : error}`);
    return jsonError(502, "translation_failed");
  }
}
```

- [ ] **Step 5: Ellenőrzés**

Futtatás: `npm test && npx tsc --noEmit && npm run lint`.
Élőben, dev szerveren, belépve: a 9. feladat posztján katt a „Fordítás magyarra” gombra. Elvárt: átirányítás a `?text=hu` címre, a szöveg magyarul, a linkek és a képek a helyükön, és egy második kattintás nem hív modellt (a `blocks_hu` már ki van töltve).

- [ ] **Step 6: Commit**

```bash
git add lib/translate.ts lib/translate.test.ts "app/api/posts/[id]/translate"
git commit -m "feat: translate posts to hungarian on demand"
```

---

### Task 13: Kis javítások: szerkesztő, mentés, újrakinyerés

**Files:**
- Create: `app/api/posts/[id]/route.ts`, `app/api/posts/[id]/reextract/route.ts`, `app/library/[id]/post-editor.tsx`
- Modify: `app/library/[id]/page.tsx` (az `edit=1` ág)

**Interfaces:**
- Consumes: `update_post_overrides` RPC (1. feladat); `processSource` (9. feladat); `cooldownRemaining`, `parseId`, `getReader`, `jsonError` (3. feladat); a `Button` variánsai (10. feladat); `PostBlocks` (11. feladat); `Post` (11. feladat)
- Produces:
  - `PATCH /api/posts/[id]` body `{ title?: {hu,en}; summary?: {hu,en}; hidden: string[] }` → `{ ok }` / 400 / 401 / 403
  - `POST /api/posts/[id]/reextract` → 202 / 401 / 403 / 404 / 429 `{ retryAfter }`
  - `PostEditor(props: { post: Post; language: Language })`

- [ ] **Step 1: A mentő route** (`app/api/posts/[id]/route.ts`)

```ts
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { jsonError } from "@/lib/api";
import { parseId } from "@/lib/pipeline/util";
import { getReader } from "@/lib/supabase/server";

const text = (max: number) => z.string().trim().min(1).max(max);
const patchSchema = z.object({
  title: z.object({ hu: text(300), en: text(300) }).optional(),
  summary: z.object({ hu: text(3000), en: text(3000) }).optional(),
  hidden: z.array(z.string().max(40)).max(400),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const reader = await getReader();
  if (!reader) return jsonError(401, "unauthorized");
  const postId = parseId((await params).id);
  const body = patchSchema.safeParse(await request.json().catch(() => null));
  if (!postId || !body.success) return jsonError(400, "invalid");

  const { title, summary, hidden } = body.data;
  // The function checks that the caller submitted this post; RLS cannot restrict columns.
  const { error } = await reader.db.rpc("update_post_overrides", {
    p_post: postId,
    p_overrides: { ...(title && { title }), ...(summary && { summary }) },
    p_hidden: hidden,
  });
  if (error?.code === "42501") return jsonError(403, "forbidden");
  if (error) return jsonError(500, "db_error");
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Az újrakinyerő route** (`app/api/posts/[id]/reextract/route.ts`)

```ts
import { after, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { processSource } from "@/lib/pipeline/ingest";
import { cooldownRemaining, parseId } from "@/lib/pipeline/util";
import { createAdminClient, getViewer } from "@/lib/supabase/server";

export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return jsonError(401, "unauthorized");
  const postId = parseId((await params).id);
  const admin = createAdminClient();
  const { data: post } = postId
    ? await admin.from("posts").select("source_id, extracted_at, sources(submitted_by)").eq("id", postId).maybeSingle()
    : { data: null };
  if (!post) return jsonError(404, "not_found");
  const source = post.sources as unknown as { submitted_by: string } | null;
  if (source?.submitted_by !== viewer.id) return jsonError(403, "forbidden");

  const wait = cooldownRemaining(post.extracted_at, new Date());
  if (wait > 0) return jsonError(429, "cooldown", { retryAfter: wait });

  after(() => processSource(admin, post.source_id));
  return NextResponse.json({ ok: true }, { status: 202 });
}
```

- [ ] **Step 3: A szerkesztő** (`app/library/[id]/post-editor.tsx`)

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { PostBlocks } from "@/app/components/post-blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Language } from "@/data/digest-types";
import type { Post } from "@/lib/content";

const copy = {
  hu: { title: "Cím", summary: "Összefoglaló", save: "Mentés", cancel: "Mégse", saving: "Mentés…", reextract: "Újrakinyerés", started: "Az újrakinyerés elindult, pár perc múlva frissül.", cooldown: (s: number) => `Újrakinyerés ${Math.ceil(s / 60)} perc múlva lehetséges.`, failed: "Nem sikerült, próbáld újra.", hide: "Elrejtés", show: "Megjelenítés" },
  en: { title: "Title", summary: "Summary", save: "Save", cancel: "Cancel", saving: "Saving…", reextract: "Re-extract", started: "Re-extraction started; the post updates in a few minutes.", cooldown: (s: number) => `Re-extraction possible in ${Math.ceil(s / 60)} min.`, failed: "That failed, try again.", hide: "Hide", show: "Show" },
};

export function PostEditor({ post, language }: { post: Post; language: Language }) {
  const router = useRouter();
  const t = copy[language];
  const [title, setTitle] = useState(post.title);
  const [summary, setSummary] = useState(post.summary);
  const [hidden, setHidden] = useState(() => new Set(post.hiddenBlocks));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const toggle = (id: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function save() {
    setBusy(true);
    const response = await fetch(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, summary, hidden: [...hidden] }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) return setStatus(t.failed);
    router.push(`/library/${post.id}`);
    router.refresh();
  }

  async function reextract() {
    const response = await fetch(`/api/posts/${post.id}/reextract`, { method: "POST" }).catch(() => null);
    const data = (await response?.json().catch(() => ({}))) as { retryAfter?: number };
    if (response?.status === 429 && data.retryAfter) setStatus(t.cooldown(data.retryAfter));
    else setStatus(response?.ok ? t.started : t.failed);
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 border-2 border-ink bg-paper p-5 sm:grid-cols-2">
        {(["hu", "en"] as const).map((lang) => (
          <div key={lang} className="space-y-3">
            <label className="block space-y-1 font-mono text-xs">
              <span>{t.title} ({lang.toUpperCase()})</span>
              <Input value={title[lang]} onChange={(e) => setTitle({ ...title, [lang]: e.target.value })} className="min-h-10 border-2 border-ink bg-paper" />
            </label>
            <label className="block space-y-1 font-mono text-xs">
              <span>{t.summary} ({lang.toUpperCase()})</span>
              <Textarea value={summary[lang]} onChange={(e) => setSummary({ ...summary, [lang]: e.target.value })} rows={5} className="border-2 border-ink bg-paper" />
            </label>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ink" className="min-h-10" onClick={() => void save()} disabled={busy}>{busy ? t.saving : t.save}</Button>
        <Button asChild variant="brutal" className="min-h-10"><Link href={`/library/${post.id}`}>{t.cancel}</Link></Button>
        <Button variant="brutal" className="min-h-10" onClick={() => void reextract()}><RefreshCw /> {t.reextract}</Button>
        {status && <p role="status" className="font-mono text-xs text-ink/70">{status}</p>}
      </div>
      <PostBlocks
        blocks={post.blocks}
        language={language}
        hidden={[...hidden]}
        controls={(block) => (
          <Button
            variant="brutal"
            size="icon-lg"
            onClick={() => toggle(block.id)}
            aria-label={hidden.has(block.id) ? t.show : t.hide}
            aria-pressed={hidden.has(block.id)}
            className="absolute top-0 right-0"
          >
            {hidden.has(block.id) ? <Eye /> : <EyeOff />}
          </Button>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 4: Az `edit=1` ág a poszt oldalon**

A `page.tsx`-ben importáld: `import { PostEditor } from "./post-editor";`. A `blocks.length > 0 && (<section …>)` részt cseréld erre:

```tsx
          {query.edit === "1" && canEdit ? (
            <section className="mt-12">
              <PostEditor post={post} language={language} />
            </section>
          ) : (
            blocks.length > 0 && (
              <section className="mt-12">
                <PostBlocks
                  blocks={blocks}
                  language={language}
                  hidden={post.hiddenBlocks}
                  showHidden={query.hidden === "show"}
                  videoStart={Number.isFinite(start) && start > 0 ? start : undefined}
                />
              </section>
            )
          )}
```

- [ ] **Step 5: Ellenőrzés**

Futtatás: `npx tsc --noEmit && npm run lint && npm test`.
Élőben, a beküldő fiókkal belépve, a 9. feladat posztján:
1. „Szerkesztés”, az első bekezdés elrejtése, a cím átírása, Mentés. Elvárt: a nézetben „1 elrejtett blokk” sáv és az új cím.
2. „Újrakinyerés” közvetlenül utána. Elvárt: „…perc múlva lehetséges” (429), mert az `extracted_at` 10 percen belül van.
3. Az admin klienssel állítsd az `extracted_at`-et 11 perccel korábbra, és indítsd újra. Elvárt: 202; pár perc múlva az `extracted_at` frissül, a cím és az elrejtett blokk viszont megmarad.
4. Egy másik (nem beküldő) felhasználónál a PATCH 403-at ad. Ha nincs másik fiók, a `curl`-lel, session nélküli kérés 401-et adjon.

- [ ] **Step 6: Commit**

```bash
git add "app/api/posts/[id]" "app/library/[id]"
git commit -m "feat: let submitters hide blocks, edit titles and re-extract"
```

---

### Task 14: Élő próba forrástípusonként, dokumentáció, a `body` oszlop törlése

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `TODO.md`, `docs/superpowers/specs/2026-09-24-unified-post-template-design.md` (a `media/<post_id>` → `media/<source_id>` eltérés rögzítése)
- Create: `supabase/migrations/20260925000000_drop_post_body.sql`

- [ ] **Step 1: Élő próba mind a hat forrásra**

A 9. feladatban készült `npm run ingest` paranccsal, egyenként:

```bash
npm run ingest -- https://simonwillison.net/2024/Dec/31/llms-in-2024/
npm run ingest -- https://www.youtube.com/watch?v=zjkBMFhNj_g
npm run ingest -- https://arxiv.org/abs/2401.00001
npm run ingest -- https://arxiv.org/abs/1706.03762
npm run ingest -- https://github.com/ggml-org/llama.cpp
npm run ingest -- https://x.com/karpathy/status/1886192184808149383
```

Elvárt forrásonként: `status: done`, és:

| Forrás | Elvárt eredmény |
| --- | --- |
| cikk | képek `path`-szal, a „Subscribe” sorok nélkül |
| YouTube | `video` + `chapters` blokk |
| arXiv HTML | ábrák |
| arXiv PDF-fel (1706.03762, ha nincs HTML-je) | absztrakt + PDF-szöveg |
| GitHub | `repo` kártya + README, badge-képek nélkül |
| X | `truncated: true` |

Minden posztot nézz meg Playwrighttal 360 és 1280 px-en (forrásjelölés, nincs vízszintes görgetés, a képek AVIF-ek). Ha egy forrás hibás, javítsd az érintett kinyerőt, adj hozzá egy regressziós tesztet, és commitolj.

A próbaposztok az éles Library-ben jelennek meg. A végén kérdezd meg a felhasználót, maradjanak-e. Ha nem kellenek, a `sources` sorok törlése a posztokat is törli (cascade), és a `removeUnusedMedia(db, sourceId, [])` a képeket is.

- [ ] **Step 2: A dokumentáció frissítése**

- **`CLAUDE.md`, „How content gets in”, 2. pont:** a link-beküldés leírása legyen ez: `detectSource` → `lib/pipeline/extract/<kind>.ts` (visszaesés: article, majd metaadat) → háromrétegű zajszűrés (`html-to-blocks.ts`, `cleanup.ts`) → `limitBlocks` → `mirrorImages` (AVIF, `media/<source_id>/…`, `/media` route) → `summarize` / `writeNotes` (noarchive) → mentés. Csak siker esetén cserél, és az `overrides` / `hidden_blocks` mezőt nem írja.
- **`CLAUDE.md`, Commands:** `npm run dup` (jscpd, legfeljebb 1% ismétlés) és `npm run ingest -- <url>` (egy link feldolgozása helyben).
- **`CLAUDE.md`, Layout:** új sorok a `lib/blocks.ts`, `lib/translate.ts`, `lib/pipeline/extract/`, `app/media/`, `app/components/post-blocks.tsx` fájloknak.
- **`CLAUDE.md`, Data contract:** egy bekezdés a blokkmodellről. Az `id` tartalomból képződik és stabil, a renderer egyetlen, nyers HTML nincs.
- **`README.md`:** a Library bekezdésébe kerüljön be, hogy a tartalom blokkokra bontva, képekkel tükröződik, és a források: cikk, YouTube, arXiv, PDF, GitHub, X.
- **`TODO.md`:** az 1. alprojektnél az M1 legyen pipálva; új pont: „M2 olvasóeszközök — terv szükséges”.
- **Spec:** a 3. szakaszban az útvonal legyen `media/<source_id>/…` (egy forráshoz egy poszt tartozik, és a poszt azonosítója még nem létezik, amikor a képek feltöltődnek).

- [ ] **Step 3: A `body` oszlop törlése** (csak a deploy után)

`supabase/migrations/20260925000000_drop_post_body.sql`:

```sql
-- Run only after the block-based code is deployed: older deployments read this column.
alter table public.posts drop column body;
```

Kérd meg a felhasználót, hogy ezt **a `main`-re pusholás és a sikeres Vercel-deploy után** futtassa az SQL Editorban.

- [ ] **Step 4: Végső ellenőrzés és commit**

Futtatás: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`. Elvárt: minden zöld, és a `dup` nem mutat új klónt a 10. feladat mérése óta.

```bash
git add CLAUDE.md README.md TODO.md docs supabase/migrations/20260925000000_drop_post_body.sql
git commit -m "docs: document the block pipeline and schedule dropping posts.body"
```

---

### Task 15: A teljes projekt átnézése: tesztek, funkciópróba, refaktor, kódminőség, duplikáció, dokumentáció, onboarding-README

A felhasználó kérte (2026-09-24). A cél, hogy a projekt karbantartható legyen, és egy új fejlesztő a README-ből el tudjon indulni.

A kiinduló lista a kódbázis-átnézés: `.superpowers/brainstorm/codebase-audit.md` (24 javaslat, fájl- és sorhivatkozással). Ebben a feladatban az ott „M1”-nek, illetve a lent felsorolt „Later” pontok készülnek el.

Három dolog **nem része** a feladatnak:
- **A `digest-dashboard.tsx` szétbontása** (az átnézés 11–13. pontja). Ezt a UI/UX A mérföldkő teljesen átírja, lásd `docs/superpowers/specs/2026-09-24-ux-signals-search-design.md` és `docs/superpowers/plans/2026-09-24-ux-a-app-shell.md`.
- **A nem használt vendored `components/ui` fájlok törlése.** A UI/UX mérföldkövek még használhatják őket. A listájuk bekerül a jelentésbe.
- **Új funkció.**

**Files:** (a pontos lista az átnézésből, lépésenként)
- Modify:
  - `lib/pipeline/util.ts`, `lib/pipeline/fetch.ts`, `lib/pipeline/collect.ts`, `lib/pipeline/daily.ts`, `lib/pipeline/ingest.ts`, `lib/pipeline/html-to-blocks.ts`, `lib/pipeline/extract/*.ts`, `lib/llm.ts`, `lib/content.ts`, `lib/post-view.ts`
  - `app/api/cron/daily/route.ts`, `app/api/sources/route.ts`, `app/api/state/route.ts`
  - `app/page.tsx`, `app/archive/**`, `app/library/**`
  - `package.json`, `pnpm-lock.yaml`, `CLAUDE.md`, `README.md`, `TODO.md`, `data/digest-types.ts`
- Create:
  - `lib/pipeline/html-noise.ts`
  - `lib/pipeline/fake-db.ts` (a `mock-fetch.ts` adatbázis-része ide költözik)
  - `lib/state.ts` + `lib/state.test.ts`
  - `lib/pipeline/collect.test.ts`, `lib/pipeline/daily.test.ts`, `lib/llm.test.ts`

**Interfaces:**
- Produces:
  - `errorMessage(error: unknown): string` (`lib/pipeline/util.ts`)
  - `ensureOk(response: Response, label: string): Promise<Response>`: ha nem ok, `cancelBody`, majd `FetchError`
  - `apiFetch(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<Response>`: `USER_AGENT` és időkorlát (mindkettő a `lib/pipeline/fetch.ts`-ben)
  - `parseStateAction(body: unknown)` (`lib/state.ts`): zod-dal ellenőrzött, diszkriminált akció
  - `curatePrompt(...)` és `toDigestRows(...)` (`lib/pipeline/daily.ts`): tiszta függvények
  - `mockFetch(t, handler)` és `withGeminiKey(t)`: a takarítás `t.after`-rel automatikus

- [ ] **Step 1: Kiinduló mérés.**
  - Futtasd: `npm test`, `npm run dup`, `npx -y jscpd@4.3.0 app lib scripts proxy.ts --min-lines 4 --min-tokens 35 --reporters console`.
  - Listázd a 300 sornál hosszabb, kézzel írt fájlokat.
  - Az eredmény a jelentés elejére kerül.
- [ ] **Step 2: Refaktor és duplikáció** (az átnézés 4–7., 9. és 20–21. pontja). Minden alpontnál az a mérce, hogy a kód könnyebben érthető legyen.
  - `errorMessage()` a 14 darab `error instanceof Error ? error.message : error` helyett.
  - `ensureOk()` és `apiFetch()` a 7 darab „nem ok → cancelBody → throw” minta és a 6 fix hostos fetch helyett. A `collect.ts` saját `get()`-je ezekre épül.
  - Apró tiszta összevonások:
    - egy `videoFromUrl` a `html-to-blocks.ts` két videó-parsere helyett;
    - egy YouTube-id ellenőrzés;
    - a `parseSubmittedUrl` az `isPrivateAddress`-t használja;
    - egyetlen `publishedDate` (x.ts, collect.ts);
    - a `Generated` típus újrahasznosítása;
    - a nem használt `Week.label` törlése.
  - Cron és hibák:
    - a `retryPendingSources` akkor is fusson, ha a `runDaily` hibát dob (külön try);
    - a cron route `jsonError`-t használjon;
    - a `sources` és a `state` route naplózza a DB-hibákat;
    - az `ingest.ts` három ellenőrizetlen `sources.update` eredményét nézd meg, és naplózd.
  - Az oldalak `getReader()`-t használjanak a `getViewer()` + `createClient()` páros helyett (5 oldal).
  - Töröld a review-történetet vagy a tervet idéző kommenteket, és a mutáns-azonosítókat a tesztnevekből. Egy komment azt mondja el, miért működik így a kód, nem azt, hogyan készült.
  - Szedd szét a `html-to-blocks.ts`-t: a zajszabályok a `html-noise.ts`-be kerülnek, a konverzió marad. A meglévő tesztek változatlanul zöldek maradnak.
  - Tesztsegédek:
    - a `fakeDb` a `lib/pipeline/fake-db.ts`-be költözik;
    - a `mockFetch(t, …)` és a `withGeminiKey(t)` maga regisztrálja a takarítást `t.after`-rel;
    - ez megszünteti a tesztekben lévő 45 ismétlődés nagy részét.
- [ ] **Step 3: Tesztek pótlása** (az átnézés 15–19. pontja). Minden új teszt bukjon el, ha a védett viselkedést visszafordítod.
  - `collect.ts`: a `parseFeed` RSS- és Atom-mintákra, valamint a jelöltek URL-alapú duplikációszűrése.
  - `daily.ts`: a `curatePrompt()` / `toDigestRows()` kiemelése. Teszt kell arra, hogy az `itemId` örökre stabil marad, mert a `CLAUDE.md` szerint az `item_states` elsődleges kulcsának fele. Kell egy `fakeDb`-s bekötési teszt is.
  - `/api/state`: a `parseStateAction()` kiemelése, tesztekkel az összes akcióra és a hibás bemenetekre.
  - `llm.ts` útválasztás:
    - a hiányzó kulcsú útvonal kimarad;
    - a média (YouTube, PDF) csak Geminire megy;
    - a tartalék útvonal fut, ha az első elbukik;
    - a hibák összegződnek.
  - A `toPost` átkerül a `lib/post-view.ts`-be. Teszt az `overrides` elsőbbségére és az `archiveAt` dátumszámítására.
- [ ] **Step 4: Függőségek** (supply-chain szabály).
  - Minden `^` tartomány a lockfile-ban szereplő pontos verzióra rögzül.
  - A `jscpd@4.3.0` pontos devDependency lesz, és az `npm run dup` a helyi binárist hívja (`jscpd …`, nem `npx -y`).
  - A lockfile újragenerálása: `corepack pnpm@11.25.0 install`. A `pnpm-workspace.yaml` `minimumReleaseAge: 10080` beállítása (7 nap) marad, ne gyengítsd.
  - A nem használt vendored komponensek és a csak általuk használt függőségek listája a jelentésbe kerül, de nem törlöd őket.
- [ ] **Step 5: Funkciópróba** (a kontroller futtatja, a 14. feladat élő próbája után). Bejelentkezve, Playwrighttal, 360 és 1280 px-en, lépésről lépésre:
  1. belépés;
  2. Radar: olvasott, mentés, teendő;
  3. archív hét;
  4. Library-beküldés, forrástípusonként egy link;
  5. poszt-oldal: blokkok, képek, videó és fejezetek, forrásjelölés, sávok;
  6. fordítás;
  7. szerkesztés, elrejtés, újrakinyerés és a 10 perces várakozás;
  8. a `/media` kijelentkezve 401-et ad;
  9. egy `noarchive` oldal;
  10. sehol nincs vízszintes görgetés.

  Minden talált hibára regressziós tesztet írsz és javítasz, vagy a `TODO.md`-be kerül indoklással.
- [ ] **Step 6: Dokumentáció.**
  - `CLAUDE.md`:
    - az átnézés 3. és 22. pontja: az RPC és a Storage írási útjai, a `generate()` opciói, az `npm test` sor, a relatív importok listája, a komponensszám, a `noarchive` / `posts.body` sor, a képek árvái forrás törlésekor;
    - a `model_settings` feladatlistája: `ingest_pdf`, `ingest_cleanup`, `translate_post`;
    - a fordító és a szerkesztő route-ok;
    - a tesztsegédek (`fake-db.ts`, `mock-fetch.ts`);
    - a konvenciók: duplikációs kapu, copy-objektum komponensenként.
  - `data/digest-types.ts:46`: az id formátuma.
  - Nyilvános `lib/` függvényeknél JSDoc csak ott, ahol a viselkedés nem egyértelmű.
- [ ] **Step 7: Onboarding-README** (angolul, mint a mostani README; a célközönség egy új fejlesztő). Minden parancsot és útvonalat ellenőrizz a kódban. A szakaszok:
  1. **What it is:** két bekezdés, a Radar és a Library.
  2. **How it works:**
     - egy Mermaid-ábra a két íróval: a napi cron és a link-beküldés;
     - a blokk-pipeline (kinyerők, háromrétegű zajszűrés, képtükrözés, összefoglaló vagy noarchive-jegyzet);
     - a fordítás;
     - az auth, az RLS és a `update_post_overrides` RPC;
     - a `model_settings`.
  3. **Quick start (local):**
     - előfeltételek;
     - `corepack pnpm@11.25.0 install --frozen-lockfile`;
     - `.env.local`;
     - Supabase: a migrációk sorrendben, meghívás;
     - az első kiadás (`curl … /api/cron/daily`);
     - egy link helyben: `npm run ingest -- <url>`, azzal a figyelmeztetéssel, hogy a beállított projektbe ír.
  4. **Deploy:** Vercel és Supabase, a környezeti változók, a cron.
  5. **Project tour:** könyvtártérkép, soronként egy mondattal, és hol érdemes elkezdeni az olvasást.
  6. **Recipes:**
     - új hírforrás (`feeds.ts`);
     - új forrás-kinyerő (`lib/pipeline/extract/`);
     - új vagy módosított modell-feladat a `model_settings`-ben;
     - új migráció (additív, SQL Editor);
     - új felületi szöveg (copy-objektum);
     - tesztek, `dup` és lint futtatása.
  7. **Testing:** `node --test` a `lib/`-ben, a `fake-db` és a `mock-fetch` segédek, mi nincs lefedve (a felület), és hogyan ellenőrizzük (Playwright).
  8. **Conventions:**
     - a design-nyelv röviden, hivatkozással a `CLAUDE.md`-re;
     - kétnyelvűség;
     - duplikációs kapu;
     - Conventional Commits;
     - pontos verziók és 7 napos kor.
  9. **Content & copyright:** `noindex`, meghívásos belépés, `noarchive`, takedown.
  10. **Troubleshooting:**
      - a magic link rossz címre visz;
      - a cron 401-et ad;
      - Gemini-keret;
      - migrációs hibák;
      - lejárt GitHub-token.
  11. **Roadmap:** hivatkozás a `TODO.md`-re és a `docs/superpowers/` specekre és tervekre.
- [ ] **Step 8: Végső ellenőrzés és commit.**
  - Futtasd: `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run dup`. Elvárt: minden zöld, 0 klón.
  - A jelentésbe írd be az előtte és utána mért számokat: tesztszám, 4/35-ös klónok, a legnagyobb fájlok mérete.
  - Témánként külön commit legyen: `refactor: …`, `test: …`, `chore(deps): pin exact versions …`, `docs: …`.

---

A push a felhasználó feladata: `! git push origin <branch>`, vagy a `main` beolvasztása után `! git push origin main`.
