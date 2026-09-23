import type { DigestCategory } from "../../data/digest-types.ts";

// Checked live on 2026-09-23. A dead feed only logs a warning; the run continues.
// `limit` caps high-volume feeds (arXiv publishes hundreds a day).
export const feeds: Array<{ name: string; url: string; hint: DigestCategory; limit?: number }> = [
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
];

// Hacker News (Algolia) queries; only stories above the points floor.
export const hnQueries = ["LLM", "AI model", "open weights", "AI agents"];

// GitHub topics searched for repos created in the last week, ranked by stars.
export const githubTopics = ["llm", "ai-agents", "generative-ai", "local-llm", "rag", "mcp"];
