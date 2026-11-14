import { digestTags, inBoth } from "../../data/digest-types.ts";
import type { Extracted } from "./extract/types.ts";
import type { Generated } from "./summary.ts";

// A post made without a model: the page's own lead as the summary and keyword-matched tags. The daily Top 10
// alone gets a model-written brief (briefs.ts); everything else reads the mirrored page itself.

const SUMMARY_TARGET = 280;
const SUMMARY_MAX = 600;
const TITLE_MAX = 300;
const TAGS_MAX = 4;
const TAG_TEXT_CHARS = 4000;

const TAG_PATTERNS: Record<(typeof digestTags)[number], RegExp> = {
  inference: /\b(inference|latency|throughput|tokens? per second)\b/gi,
  quantization: /\b(quantiz\w*|gguf|ggml|awq|gptq|int[48]|fp8|4-bit|8-bit)\b/gi,
  runtime: /\b(llama\.cpp|vllm|ollama|onnx|tensorrt|mlx|runtime)\b/gi,
  serving: /\b(serving|deployment|kubernetes|autoscal\w*|self-host\w*)\b/gi,
  "fine-tuning": /\b(fine-?tun\w*|lora|qlora|sft|instruction[- ]tun\w*)\b/gi,
  training: /\b(pre-?training|post-?training|training run|training data|gpu cluster)\b/gi,
  agents: /\b(agents?|agentic|mcp|tool use|function calling)\b/gi,
  evals: /\b(evals?|evaluations?)\b/gi,
  benchmarks: /\b(benchmarks?|leaderboard|swe-bench|mmlu|arena)\b/gi,
  reasoning: /\b(reasoning|chain[- ]of[- ]thought|thinking models?)\b/gi,
  multimodal: /\b(multimodal|vision|image generation|text-to-image|video generation|speech|audio)\b/gi,
  rag: /\b(rag|retrieval|embeddings?|vector (db|database|search)|reranker)\b/gi,
  safety: /\b(safety|jailbreaks?|red[- ]team\w*|misuse|guardrails?)\b/gi,
  alignment: /\b(alignment|rlhf|constitutional|reward model)\b/gi,
  "open-weights": /\b(open[- ]weights?|open[- ]source model|apache 2\.0|hugging ?face)\b/gi,
  tooling: /\b(sdk|library|framework|cli|toolkit|api)\b/gi,
  policy: /\b(regulation|policy|legislation|lawsuit|copyright|government|eu ai act)\b/gi,
  funding: /\b(raises?|funding|series [a-d]|valuation|acquires?|acquisition|investors?)\b/gi,
};

/** The leading sentences of a text, up to a paragraph's worth: at least SUMMARY_TARGET characters when the text has them. */
export function leadSummary(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const sentences = flat.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [flat];
  let lead = "";
  for (const sentence of sentences) {
    if (lead && (lead + sentence).length > SUMMARY_MAX) break;
    lead = `${lead} ${sentence.trim()}`.trim();
    if (lead.length >= SUMMARY_TARGET) break;
  }
  if (lead.length <= SUMMARY_MAX) return lead;
  const cut = lead.slice(0, SUMMARY_MAX);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/** Up to TAGS_MAX tags from the vocabulary: the most often matched, a title match counting double. */
export function keywordTags(title: string, text: string): string[] {
  const body = text.slice(0, TAG_TEXT_CHARS);
  const scored = digestTags
    .map((tag) => {
      const pattern = TAG_PATTERNS[tag];
      return { tag, hits: (body.match(pattern)?.length ?? 0) + 2 * (title.match(pattern)?.length ?? 0) };
    })
    .filter((entry) => entry.hits >= 2)
    .sort((a, b) => b.hits - a.hits);
  return scored.slice(0, TAGS_MAX).map((entry) => entry.tag);
}

export function quickSummary(extracted: Extracted): Generated {
  return {
    title: inBoth(extracted.title.slice(0, TITLE_MAX)),
    summary: inBoth(leadSummary(extracted.text)),
    keyPoints: { hu: [], en: [] },
    tags: keywordTags(extracted.title, extracted.text),
    brief: { hu: [], en: [] },
  };
}
