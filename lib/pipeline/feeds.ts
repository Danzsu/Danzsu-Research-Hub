import type { DigestCategory } from "../../data/digest-types.ts";

// Checked live on 2026-09-23. A dead feed only logs a warning; the run continues.
// truthful_sites.md documents these lists, with the candidates; lib/truthful-sites.test.ts keeps them equal.
// `limit` caps high-volume feeds (arXiv publishes hundreds a day).
/** The items a feed contributes when it sets no `limit`. */
export const DEFAULT_FEED_LIMIT = 25;
// `exclude` drops items by title or link: a feed's own promotions, or pages that repeat its articles.
export const feeds: Array<{ name: string; url: string; hint: DigestCategory; limit?: number; exclude?: RegExp }> = [
  { name: "arXiv cs.CL", url: "https://rss.arxiv.org/rss/cs.CL", hint: "research", limit: 40 },
  { name: "arXiv cs.AI", url: "https://rss.arxiv.org/rss/cs.AI", hint: "research", limit: 40 },
  { name: "Hugging Face", url: "https://huggingface.co/blog/feed.xml", hint: "local" },
  { name: "Ollama", url: "https://ollama.com/blog/rss.xml", hint: "local" },
  { name: "r/LocalLLaMA", url: "https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day", hint: "local", limit: 15 },
  { name: "Simon Willison", url: "https://simonwillison.net/atom/everything/", hint: "local", limit: 15 },
  { name: "OpenAI", url: "https://openai.com/news/rss.xml", hint: "companies" },
  { name: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", hint: "companies" },
  { name: "Google AI", url: "https://blog.google/technology/ai/rss/", hint: "companies" },
  { name: "NVIDIA", url: "https://blogs.nvidia.com/blog/category/generative-ai/feed/", hint: "companies" },
  { name: "AWS ML", url: "https://aws.amazon.com/blogs/machine-learning/feed/", hint: "companies", limit: 10 },
  { name: "The Decoder", url: "https://the-decoder.com/feed/", hint: "companies", limit: 20 },
  { name: "Interconnects", url: "https://www.interconnects.ai/feed", hint: "research" },
  // Its course and event ads ("LAST CALL FOR ENROLLMENT: …", "ByteByteGo Live is here") share the feed with the articles.
  { name: "ByteByteGo", url: "https://blog.bytebytego.com/feed", hint: "research", limit: 5, exclude: /enrollment|bytebytego live/i },
  // Anthropic publishes no RSS; a community mirror (github.com/Olshansk/rss-feeds) builds these from anthropic.com, whose URLs the items keep.
  { name: "Anthropic", url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml", hint: "companies" },
  { name: "Anthropic Engineering", url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_engineering.xml", hint: "research" },
  // DeepLearning.AI's own feed for The Batch, on its CMS host. A whole weekly issue (`/issue-372/`) repeats its articles.
  { name: "The Batch", url: "https://charonhub.deeplearning.ai/rss/", hint: "research", exclude: /\/issue-\d+\/?$/ },
  // Checked live on 2026-09-29. Meta's AI Research category on its engineering blog: ai.meta.com has no feed.
  { name: "Mistral", url: "https://mistral.ai/rss.xml", hint: "companies" },
  { name: "Microsoft Research", url: "https://www.microsoft.com/en-us/research/feed/", hint: "research" },
  { name: "Meta AI Research", url: "https://engineering.fb.com/category/ai-research/feed/", hint: "research" },
  { name: "Anthropic Research", url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_research.xml", hint: "research" },
  { name: "OpenAI Research", url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_openai_research.xml", hint: "research" },
  // The Chinese labs (DeepSeek, Qwen, Kimi, Zhipu, MiniMax) publish no feeds; these two newsletters cover them.
  { name: "Recode China AI", url: "https://recodechinaai.substack.com/feed", hint: "companies" },
  { name: "ChinAI", url: "https://chinai.substack.com/feed", hint: "companies" },
];

// Hacker News (Algolia) queries; only stories above the points floor.
// The last five catch big launches from labs without a feed (xAI blocks automated requests).
export const hnQueries = ["LLM", "AI model", "open weights", "AI agents", "Grok", "DeepSeek", "Qwen", "Kimi", "MiniMax"];

// GitHub topics searched for repos created in the last week, ranked by stars.
export const githubTopics = ["llm", "ai-agents", "generative-ai", "local-llm", "rag", "mcp"];
