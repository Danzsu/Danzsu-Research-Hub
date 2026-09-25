import { XMLParser } from "fast-xml-parser";
import type { DigestCategory } from "../../data/digest-types.ts";
import { apiFetch, ensureOk, githubHeaders } from "./fetch.ts";
import { feeds, githubTopics, hnQueries } from "./feeds.ts";
import { list, publishedDate, settledValues, xmlText } from "./util.ts";

export type Candidate = {
  url: string;
  title: string;
  source: string;
  snippet: string;
  publishedAt: string; // YYYY-MM-DD
  hint: DigestCategory;
};

export type Repo = { repo: string; focus: string; url: string; stars: number };

const DAY = 86_400_000;

const get = async (url: string, headers?: Record<string, string>) => ensureOk(await apiFetch(url, { headers }), url);

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
const isoDate = (value: unknown) => publishedDate(xmlText(value)) ?? new Date().toISOString().slice(0, 10);

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

type FeedEntry = Record<string, unknown>;

/** RSS 2.0 and Atom, the two shapes the feed list uses. */
export function parseFeed(body: string, feed: { name: string; hint: DigestCategory }, since: Date): Candidate[] {
  const doc = xml.parse(body) as { rss?: { channel?: { item?: FeedEntry | FeedEntry[] } }; feed?: { entry?: FeedEntry | FeedEntry[] } };
  const entries = doc.rss ? list(doc.rss.channel?.item) : list(doc.feed?.entry);

  return entries.flatMap((entry) => {
    const links = list(entry.link as unknown);
    const link = typeof links[0] === "string"
      ? links[0]
      : xmlText((links.find((l) => (l as FeedEntry)["@_rel"] !== "self" && (l as FeedEntry)["@_rel"] !== "replies") as FeedEntry | undefined)?.["@_href"]);
    const published = entry.pubDate ?? entry.published ?? entry.updated ?? entry["dc:date"];
    const date = new Date(xmlText(published));
    if (!link || (!Number.isNaN(date.getTime()) && date < since)) return [];
    return [{
      url: link.trim(),
      title: stripHtml(xmlText(entry.title)),
      source: feed.name,
      snippet: stripHtml(xmlText(entry.description ?? entry.summary ?? entry.content)).slice(0, 400),
      publishedAt: isoDate(published),
      hint: feed.hint,
    }];
  });
}

async function fromFeeds(since: Date): Promise<Candidate[]> {
  const results = await Promise.allSettled(
    feeds.map(async (feed) => parseFeed(await (await get(feed.url)).text(), feed, since).slice(0, feed.limit ?? 25)),
  );
  return settledValues(results, (i) => `feed failed: ${feeds[i].name}`).flat();
}

async function fromHackerNews(since: Date): Promise<Candidate[]> {
  const after = Math.floor(since.getTime() / 1000);
  const results = await Promise.allSettled(
    hnQueries.map(async (query) => {
      const url = `https://hn.algolia.com/api/v1/search?tags=story&query=${encodeURIComponent(query)}&numericFilters=created_at_i>${after},points>80`;
      const data = (await (await get(url)).json()) as {
        hits: Array<{ title: string; url?: string; created_at: string; points: number; objectID: string }>;
      };
      return data.hits.filter((hit) => hit.url).map((hit): Candidate => ({
        url: hit.url!,
        title: hit.title,
        source: `Hacker News · ${hit.points} pts`,
        snippet: "",
        publishedAt: hit.created_at.slice(0, 10),
        hint: "companies",
      }));
    }),
  );
  return settledValues(results, (i) => `hacker news query failed: ${hnQueries[i]}`).flat();
}

export async function collectRepos(now: Date): Promise<Repo[]> {
  const since = new Date(now.getTime() - 7 * DAY).toISOString().slice(0, 10);
  const headers = githubHeaders("application/vnd.github+json");

  const results = await Promise.allSettled(
    githubTopics.map(async (topic) => {
      const q = encodeURIComponent(`topic:${topic} created:>${since}`);
      const data = (await (await get(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=10`, headers)).json()) as {
        items: Array<{ full_name: string; description: string | null; html_url: string; stargazers_count: number }>;
      };
      return data.items;
    }),
  );

  const byName = new Map<string, Repo>();
  for (const items of settledValues(results, (i) => `github topic failed: ${githubTopics[i]}`)) {
    for (const item of items) {
      byName.set(item.full_name, {
        repo: item.full_name,
        focus: (item.description ?? "").slice(0, 90),
        url: item.html_url,
        stars: item.stargazers_count,
      });
    }
  }
  // 25, not 10: raw star counts favour awesome-lists; curation picks the final ten.
  return [...byName.values()].sort((a, b) => b.stars - a.stars).slice(0, 25);
}

/** First of each URL (ignoring a fragment and a trailing slash) wins; untitled candidates are dropped. */
export function dedupeCandidates(all: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return all.filter((candidate) => {
    const key = candidate.url.replace(/#.*$/, "").replace(/\/$/, "");
    if (seen.has(key) || !candidate.title) return false;
    seen.add(key);
    return true;
  });
}

/** Everything published since `since`, deduplicated by URL. */
export async function collectCandidates(since: Date): Promise<Candidate[]> {
  return dedupeCandidates([...(await fromFeeds(since)), ...(await fromHackerNews(since))]);
}
