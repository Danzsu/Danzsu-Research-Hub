import type { DigestCategory } from "../data/digest-types.ts";

// Checked live on 2026-09-23. A dead feed only logs a warning; the run continues.
// The daily run's sources: truthful_sites.md documents these lists, with the candidates; lib/truthful-sites.test.ts keeps them equal.
// `limit` caps high-volume feeds (arXiv publishes hundreds a day).
/** The items a feed contributes when it sets no `limit`. */
export const DEFAULT_FEED_LIMIT = 25;
// `exclude` drops items by title or link: a feed's own promotions, or pages that repeat its articles.
// `weight` is how far a source is trusted, 1 neutral: a lab's own post 1.4, a community or secondary source below 1.
export const feeds: Array<{ name: string; url: string; hint: DigestCategory; limit?: number; exclude?: RegExp; weight?: number }> = [
  // 2026-10-12: about 485 papers a day, unranked, and 59 of them in both lists; the ranked papers come from dailyPapers below.
  { name: "arXiv cs.CL", url: "https://rss.arxiv.org/rss/cs.CL", hint: "research", weight: 0.7, limit: 10 },
  { name: "arXiv cs.AI", url: "https://rss.arxiv.org/rss/cs.AI", hint: "research", weight: 0.7, limit: 10 },
  { name: "Hugging Face", url: "https://huggingface.co/blog/feed.xml", hint: "local", weight: 1.3 },
  { name: "Ollama", url: "https://ollama.com/blog/rss.xml", hint: "local", weight: 1.3 },
  { name: "Simon Willison", url: "https://simonwillison.net/atom/everything/", hint: "local", weight: 1.2, limit: 15 },
  { name: "OpenAI", url: "https://openai.com/news/rss.xml", hint: "companies", weight: 1.4 },
  { name: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", hint: "companies", weight: 1.4 },
  { name: "Google AI", url: "https://blog.google/technology/ai/rss/", hint: "companies", weight: 1.3 },
  { name: "NVIDIA", url: "https://blogs.nvidia.com/blog/category/generative-ai/feed/", hint: "companies", weight: 1.2 },
  // Mostly Bedrock how-tos: about 6 a day (2026-10-12).
  { name: "AWS ML", url: "https://aws.amazon.com/blogs/machine-learning/feed/", hint: "companies", weight: 0.8, limit: 5 },
  { name: "The Decoder", url: "https://the-decoder.com/feed/", hint: "companies", weight: 0.9, limit: 20 },
  { name: "Interconnects", url: "https://www.interconnects.ai/feed", hint: "research", weight: 1.1 },
  // Its course and event ads ("LAST CALL FOR ENROLLMENT: …", "ByteByteGo Live is here") share the feed with the articles.
  { name: "ByteByteGo", url: "https://blog.bytebytego.com/feed", hint: "research", weight: 0.8, limit: 5, exclude: /enrollment|bytebytego live/i },
  // Anthropic publishes no RSS; a community mirror (github.com/Olshansk/rss-feeds) builds these from anthropic.com, whose URLs the items keep.
  { name: "Anthropic", url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml", hint: "companies", weight: 1.4 },
  { name: "Anthropic Engineering", url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_engineering.xml", hint: "research", weight: 1.4 },
  // DeepLearning.AI's own feed for The Batch, on its CMS host. A whole weekly issue (`/issue-372/`) repeats its articles.
  { name: "The Batch", url: "https://charonhub.deeplearning.ai/rss/", hint: "research", exclude: /\/issue-\d+\/?$/ },
  // Checked live on 2026-09-29. Meta's AI Research category on its engineering blog: ai.meta.com has no feed.
  { name: "Mistral", url: "https://mistral.ai/news/rss", hint: "companies", weight: 1.3 },
  { name: "Microsoft Research", url: "https://www.microsoft.com/en-us/research/feed/", hint: "research", weight: 1.2 },
  { name: "Meta AI Research", url: "https://engineering.fb.com/category/ai-research/feed/", hint: "research", weight: 1.2 },
  { name: "Anthropic Research", url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_research.xml", hint: "research", weight: 1.4 },
  // The Chinese labs (DeepSeek, Qwen, Kimi, Zhipu, MiniMax) publish no feeds; these two newsletters cover them.
  { name: "Recode China AI", url: "https://www.recodechinaai.com/feed", hint: "companies", weight: 0.9 },
  { name: "ChinAI", url: "https://chinai.substack.com/feed", hint: "companies", weight: 0.9 },
  // Checked live on 2026-10-11. Two secondary sources, which often repeat a lab's own announcement, and a free engineering blog.
  { name: "The Rundown AI", url: "https://www.therundown.ai/feed", hint: "companies", weight: 0.8, limit: 10 },
  { name: "MIT Technology Review", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed", hint: "companies", weight: 0.9, limit: 10 },
  { name: "Pragmatic Engineer", url: "https://blog.pragmaticengineer.com/rss/", hint: "research", limit: 5 },
];

// Hugging Face Daily Papers: the arXiv papers the community submits and upvotes, read per finished day (a day's
// votes are still coming in while it runs). Checked live on 2026-10-12.
export const dailyPapers = { name: "HF Daily Papers", url: "https://huggingface.co/api/daily_papers", limit: 15 };

// Hacker News (Algolia) queries; only stories above the points floor.
export const hnQueries = ["LLM", "AI model", "open weights", "AI agents"];
// Lab names, for the big launches of labs without a feed (xAI blocks automated requests). Searched
// exactly and in titles only: typo tolerance reads "Grok" as "Growing" (2026-09-30: 3 of 23 hits).
export const hnNames = ["Grok", "DeepSeek", "Qwen", "Kimi", "MiniMax"];

// GitHub topics searched for repos created in the last week, ranked by stars.
export const githubTopics = ["llm", "ai-agents", "generative-ai", "local-llm", "rag", "mcp"];
