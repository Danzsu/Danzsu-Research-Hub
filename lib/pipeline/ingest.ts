import { Readability } from "@mozilla/readability";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseHTML } from "linkedom";
import { z } from "zod/v4";
import { digestTags } from "../../data/digest-types.ts";
import { lookup } from "node:dns/promises";
import { generate } from "../llm.ts";
import { isPrivateAddress, parseSubmittedUrl } from "./util.ts";

const MAX_ATTEMPTS = 3;
const MAX_BODY = 200_000;
const MAX_PROMPT_TEXT = 60_000;

const localized = z.object({ hu: z.string(), en: z.string() });
const postSchema = z.object({
  title: localized,
  summary: localized,
  keyPoints: z.object({ hu: z.array(z.string()).max(8), en: z.array(z.string()).max(8) }),
  tags: z.array(z.enum(digestTags)).max(4),
});

const INSTRUCTIONS = `Write a bilingual (Hungarian + English) library entry for an AI engineer.
- title: concrete headline. summary: one paragraph (4–6 sentences) on what it says and why it matters.
- keyPoints: 3–8 short takeaways, same points in both languages.
- tags: 1–4 from the allowed vocabulary only.
- Hungarian must be natural and idiomatic, not a literal translation.
- Only state what the source says.`;

type Article = { title: string; author: string | null; body: string | null; text: string };

/**
 * Fetches a user-submitted URL without reaching internal hosts: every hop is
 * re-parsed, DNS-resolved and checked, and redirects are followed by hand.
 * ponytail: a DNS answer can still change between lookup and connect
 * (rebinding); pin the resolved IP with an undici Agent if submitters stop being invited.
 */
async function safeFetch(raw: string): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    const url = parseSubmittedUrl(current);
    if (!url) throw new Error("blocked url");
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new Error("blocked address");
    }
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; NeonRadar/1.0; private research digest)" },
      signal: AbortSignal.timeout(20_000),
      redirect: "manual",
    });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return response;
    current = new URL(location, url).toString();
  }
  throw new Error("too many redirects");
}

async function readArticle(url: string): Promise<Article> {
  const response = await safeFetch(url);
  if (!response.ok) throw new Error(`fetch ${response.status}`);
  const html = await response.text();
  const { document } = parseHTML(html);

  // noarchive = the publisher asked not to be copied: keep metadata, drop the body.
  const robots = document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "";
  const mayMirror = !/noarchive/i.test(robots) && !/noarchive/i.test(response.headers.get("x-robots-tag") ?? "");

  const parsed = new Readability(document as unknown as Document).parse();
  // One block per paragraph-level element, so the mirror keeps its paragraphs.
  const BLOCKS = "p, h1, h2, h3, h4, li, pre, blockquote";
  const blocks = parseHTML(`<main>${parsed?.content ?? ""}</main>`).document.querySelectorAll(BLOCKS);
  const text = [...blocks]
    .filter((block) => !block.querySelector(BLOCKS)) // innermost only: <li><p> would repeat
    .map((block) => (block.textContent ?? "").replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
  if (text.length < 200) throw new Error("no readable article text found");
  return {
    title: parsed?.title ?? url,
    author: (parsed?.byline ?? parsed?.siteName ?? null)?.slice(0, 120) ?? null,
    body: mayMirror ? text.slice(0, MAX_BODY) : null,
    text,
  };
}

async function readVideo(url: string) {
  const oembed = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const meta = oembed.ok ? ((await oembed.json()) as { title?: string; author_name?: string }) : {};
  return { title: meta.title ?? url, author: meta.author_name ?? null };
}

/** Turns one submitted source into a post. Safe to re-run; failures are recorded on the source. */
export async function processSource(db: SupabaseClient, id: number): Promise<void> {
  const { data: source, error } = await db
    .from("sources")
    .select("id, url, kind, note, attempts")
    .eq("id", id)
    .single();
  if (error || !source) throw error ?? new Error(`source ${id} not found`);
  await db.from("sources").update({ attempts: source.attempts + 1 }).eq("id", id);

  try {
    const note = source.note ? `\nThe submitter's note: ${source.note}` : "";
    let post: { author: string | null; body: string | null; generated: z.infer<typeof postSchema> };

    if (source.kind === "youtube") {
      const video = await readVideo(source.url);
      post = {
        author: video.author,
        body: null,
        generated: await generate(
          db,
          "ingest_video",
          postSchema,
          `${INSTRUCTIONS}\nThe source is the attached YouTube video "${video.title}".${note}`,
          { youtubeUrl: source.url },
        ),
      };
    } else {
      const article = await readArticle(source.url);
      post = {
        author: article.author,
        body: article.body,
        generated: await generate(
          db,
          "ingest_article",
          postSchema,
          `${INSTRUCTIONS}${note}\n\nARTICLE "${article.title}":\n${article.text.slice(0, MAX_PROMPT_TEXT)}`,
        ),
      };
    }

    const { error: insertError } = await db.from("posts").upsert(
      {
        source_id: source.id,
        kind: source.kind,
        url: source.url,
        author: post.author,
        body: post.body,
        title: post.generated.title,
        summary: post.generated.summary,
        key_points: post.generated.keyPoints,
        tags: post.generated.tags,
      },
      { onConflict: "source_id" },
    );
    if (insertError) throw insertError;
    await db.from("sources").update({ status: "done", error: null }).eq("id", id);
  } catch (failure) {
    await db
      .from("sources")
      .update({ status: "failed", error: String(failure instanceof Error ? failure.message : failure).slice(0, 500) })
      .eq("id", id);
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
