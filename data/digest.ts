/**
 * Seed content for the Radar view.
 *
 * This is demo data: it exists so every UI path (filters, must-read grid, saved
 * view, GitHub view, progress, empty state) has something to render before the
 * ingest pipeline runs. Every `url` was verified live at authoring time; nothing
 * here should 404.
 *
 * ⚠️ `DigestItem.id` values are permanent — see the note in `digest-types.ts`.
 */

import type {
  ArchiveIssue,
  CurrentIssue,
  DigestItem,
  GithubTopEntry,
} from "./digest-types";

export type {
  ArchiveIssue,
  CurrentIssue,
  DigestCategory,
  DigestItem,
  GithubTopEntry,
  Language,
  Localized,
} from "./digest-types";

/**
 * Controlled vocabulary. Tag filtering only produces useful clusters if the
 * vocabulary stays small — free-form tags degrade into singletons within weeks.
 */
export const digestTags = [
  "inference",
  "quantization",
  "runtime",
  "serving",
  "fine-tuning",
  "training",
  "agents",
  "evals",
  "benchmarks",
  "reasoning",
  "multimodal",
  "rag",
  "safety",
  "alignment",
  "open-weights",
  "tooling",
  "policy",
  "funding",
] as const;

export const currentIssue: CurrentIssue = {
  label: "2026 / W39",
  updated: "09. 22. 18:00",
  archiveAt: "09. 25. 16:00",
};

export const digestItems: DigestItem[] = [
  {
    id: "research-2026w39-attention-is-all-you-need",
    category: "research",
    mustRead: true,
    score: 97,
    readMinutes: 14,
    publishedLabel: "09 / 22",
    publishedAt: "2026-09-22",
    source: "arXiv",
    url: "https://arxiv.org/abs/1706.03762",
    tags: ["reasoning", "training", "benchmarks"],
    title: {
      hu: "A transformer-architektúra alapdolgozata, újraolvasva",
      en: "The transformer paper, read again",
    },
    summary: {
      hu: "Az eredeti transformer-cikk máig az a referencia, amihez minden új architektúra-javaslat méri magát. Érdemes évente egyszer visszatérni hozzá, mert a mai optimalizációk többsége ennek a felépítésnek a szűk keresztmetszeteit kerülgeti.",
      en: "The original transformer paper is still the reference every new architecture proposal measures itself against. Worth revisiting yearly: most of today's optimisations are working around bottlenecks this design introduced.",
    },
    why: {
      hu: "Aki a mai inferencia-optimalizációkat érteni akarja, annak az eredeti szűk keresztmetszeteket kell ismernie.",
      en: "Understanding today's inference optimisations starts with knowing the bottlenecks they work around.",
    },
  },
  {
    id: "local-2026w39-llama-cpp-runtime",
    category: "local",
    mustRead: true,
    score: 94,
    readMinutes: 9,
    publishedLabel: "09 / 22",
    publishedAt: "2026-09-22",
    source: "ggml-org",
    url: "https://github.com/ggml-org/llama.cpp",
    tags: ["runtime", "quantization", "inference"],
    title: {
      hu: "llama.cpp: a helyi inferencia de facto futtatókörnyezete",
      en: "llama.cpp: the de facto local inference runtime",
    },
    summary: {
      hu: "A GGUF formátum és a llama.cpp kvantálási készlete lett az a közös nevező, amire a helyi LLM-ökoszisztéma nagy része épül. A projekt tempója miatt érdemes a release-eket követni, nem a főágat.",
      en: "The GGUF format and llama.cpp's quantisation toolkit have become the common denominator most of the local LLM ecosystem builds on. Given the pace, follow the releases rather than main.",
    },
    why: {
      hu: "Ha helyben futtatsz modellt, valószínűleg ezt futtatod — akár közvetlenül, akár egy wrapperen keresztül.",
      en: "If you run a model locally you are probably running this, directly or through a wrapper.",
    },
  },
  {
    id: "companies-2026w39-anthropic-news",
    category: "companies",
    mustRead: true,
    score: 91,
    readMinutes: 6,
    publishedLabel: "09 / 21",
    publishedAt: "2026-09-21",
    source: "Anthropic",
    url: "https://www.anthropic.com/news",
    tags: ["safety", "alignment", "policy"],
    title: {
      hu: "Anthropic bejelentések és modellfrissítések",
      en: "Anthropic announcements and model updates",
    },
    summary: {
      hu: "A modellkiadások mellett itt jelennek meg a használati irányelvek és a biztonsági keretrendszer változásai is, amelyek gyakran korábban jeleznek termékirányt, mint maga a modellkártya.",
      en: "Alongside model releases, this is where usage policy and safety framework changes land — these often signal product direction earlier than the model card does.",
    },
    why: {
      hu: "A szabályzat-változások gyakran hamarabb mutatják a terméktervet, mint a modellkiadások.",
      en: "Policy changes often reveal the product roadmap before the model releases do.",
    },
  },
  {
    id: "local-2026w39-vllm-serving",
    category: "local",
    score: 89,
    readMinutes: 8,
    publishedLabel: "09 / 21",
    publishedAt: "2026-09-21",
    source: "vLLM",
    url: "https://github.com/vllm-project/vllm",
    tags: ["serving", "inference", "tooling"],
    title: {
      hu: "vLLM: átbocsátóképesség-orientált modellkiszolgálás",
      en: "vLLM: throughput-oriented model serving",
    },
    summary: {
      hu: "A PagedAttention és a folyamatos batchelés ott hoz igazi különbséget, ahol több párhuzamos kérést kell kiszolgálni. Egyfelhasználós asztali használatra viszont gyakran túlméretezett a llama.cpp-hez képest.",
      en: "PagedAttention and continuous batching pay off when serving many concurrent requests. For single-user desktop work it is often overkill next to llama.cpp.",
    },
    why: {
      hu: "A választóvonal nem a modellméret, hanem a párhuzamosság — ezt könnyű elrontani.",
      en: "The deciding factor is concurrency, not model size — an easy call to get wrong.",
    },
  },
  {
    id: "research-2026w39-hf-daily-papers",
    category: "research",
    score: 87,
    readMinutes: 5,
    publishedLabel: "09 / 21",
    publishedAt: "2026-09-21",
    source: "Hugging Face",
    url: "https://huggingface.co/papers",
    tags: ["benchmarks", "evals", "open-weights"],
    title: {
      hu: "Hugging Face napi kiemelt kutatási cikkek",
      en: "Hugging Face daily papers",
    },
    summary: {
      hu: "Közösségi szavazással rangsorolt napi válogatás. Jó előszűrő az arXiv zajához, de a rangsor a láthatóságot méri, nem a minőséget — érdemes ezt fejben tartani.",
      en: "A community-voted daily selection. A useful pre-filter for arXiv noise, though the ranking measures visibility rather than quality — worth keeping in mind.",
    },
    why: {
      hu: "A leggyorsabb módja annak, hogy lásd, min dolgozik ténylegesen a mezőny.",
      en: "The fastest way to see what the field is actually working on this week.",
    },
  },
  {
    id: "research-2026w39-lmarena-leaderboard",
    category: "research",
    score: 85,
    readMinutes: 4,
    publishedLabel: "09 / 20",
    publishedAt: "2026-09-20",
    source: "LMArena",
    url: "https://lmarena.ai",
    tags: ["evals", "benchmarks", "reasoning"],
    title: {
      hu: "LMArena: emberi preferencia-alapú modellrangsor",
      en: "LMArena: human preference model rankings",
    },
    summary: {
      hu: "Páros összehasonlításokból számolt Elo-rangsor. Az egyetlen széles körben használt mérés, amit nehéz közvetlenül optimalizálni — de a stílus-preferenciát is méri, nem csak a képességet.",
      en: "An Elo ranking computed from pairwise comparisons. One of the few widely used measures that is hard to optimise against directly — though it also measures style preference, not just capability.",
    },
    why: {
      hu: "A benchmark-számoknál jobban korrelál azzal, hogy egy modell használata milyen érzés.",
      en: "Correlates with how a model feels to use better than benchmark numbers do.",
    },
  },
  {
    id: "local-2026w39-ollama-model-registry",
    category: "local",
    score: 83,
    readMinutes: 5,
    publishedLabel: "09 / 20",
    publishedAt: "2026-09-20",
    source: "Ollama",
    url: "https://github.com/ollama/ollama",
    tags: ["runtime", "tooling", "open-weights"],
    title: {
      hu: "Ollama: modellkezelés egyetlen paranccsal",
      en: "Ollama: one-command model management",
    },
    summary: {
      hu: "A llama.cpp fölé húzott regiszter- és API-réteg, ami a helyi modellek telepítését a Docker-élményhez közelíti. A kényelem ára, hogy a kvantálási döntéseket elrejti.",
      en: "A registry and API layer over llama.cpp that brings local model setup close to the Docker experience. The convenience hides the quantisation decisions.",
    },
    why: {
      hu: "A legrövidebb út odáig, hogy egy helyi modell OpenAI-kompatibilis végponton szóljon.",
      en: "The shortest path to a local model behind an OpenAI-compatible endpoint.",
    },
  },
  {
    id: "companies-2026w39-deepmind-blog",
    category: "companies",
    score: 82,
    readMinutes: 7,
    publishedLabel: "09 / 20",
    publishedAt: "2026-09-20",
    source: "Google DeepMind",
    url: "https://deepmind.google/discover/blog/",
    tags: ["multimodal", "reasoning", "training"],
    title: {
      hu: "Google DeepMind kutatási és termékbejelentések",
      en: "Google DeepMind research and product announcements",
    },
    summary: {
      hu: "A Gemini-vonal frissítései mellett itt jelennek meg a tudományos alkalmazások is. A kettő ritkán találkozik, de a hosszú távú irányt a kutatási oldal jelzi pontosabban.",
      en: "Gemini line updates sit alongside scientific applications here. The two rarely meet, but the research side is the better signal for long-term direction.",
    },
    why: {
      hu: "A Gemini-modellváltozások közvetlenül érintik a chat-réteget ebben a projektben.",
      en: "Gemini model changes directly affect this project's chat layer.",
    },
  },
  {
    id: "local-2026w39-mlx-apple-silicon",
    category: "local",
    score: 80,
    readMinutes: 6,
    publishedLabel: "09 / 19",
    publishedAt: "2026-09-19",
    source: "ml-explore",
    url: "https://github.com/ml-explore/mlx",
    tags: ["runtime", "inference", "fine-tuning"],
    title: {
      hu: "MLX: egységes memória kihasználása Apple Siliconon",
      en: "MLX: exploiting unified memory on Apple Silicon",
    },
    summary: {
      hu: "Az egységes memóriamodell miatt olyan modellméretek is elférnek, amik diszkrét GPU-n nem. Cserébe az ökoszisztéma jóval kisebb, és sok modellhez nincs kész konverzió.",
      en: "The unified memory model fits model sizes that a discrete GPU cannot. In exchange the ecosystem is much smaller and many models have no ready conversion.",
    },
    why: {
      hu: "Apple-gépen ez a keret dönti el, mekkora modell fut még kényelmesen.",
      en: "On an Apple machine this framework decides how large a model can still run comfortably.",
    },
  },
  {
    id: "research-2026w39-anthropic-research",
    category: "research",
    score: 79,
    readMinutes: 11,
    publishedLabel: "09 / 19",
    publishedAt: "2026-09-19",
    source: "Anthropic",
    url: "https://www.anthropic.com/research",
    tags: ["alignment", "safety", "reasoning"],
    title: {
      hu: "Anthropic kutatási publikációk",
      en: "Anthropic research publications",
    },
    summary: {
      hu: "Az interpretálhatósági és alignment-munkák itt jelennek meg teljes terjedelmükben. Sűrű anyagok, de a modellviselkedés magyarázatához ezek adják a legkonkrétabb fogódzót.",
      en: "Interpretability and alignment work appears here in full. Dense material, but it offers the most concrete handle on explaining model behaviour.",
    },
    why: {
      hu: "Az interpretálhatósági eredmények egyre inkább gyakorlati hibakeresési eszközzé válnak.",
      en: "Interpretability results are increasingly becoming practical debugging tools.",
    },
  },
  {
    id: "local-2026w39-lm-studio-desktop",
    category: "local",
    score: 77,
    readMinutes: 4,
    publishedLabel: "09 / 19",
    publishedAt: "2026-09-19",
    source: "LM Studio",
    url: "https://lmstudio.ai",
    tags: ["tooling", "runtime", "inference"],
    title: {
      hu: "LM Studio: asztali felület a helyi modellekhez",
      en: "LM Studio: a desktop front-end for local models",
    },
    summary: {
      hu: "Grafikus modellböngésző, kvantálás-választó és helyi szerver egyben. A legjobb belépési pont annak, aki nem akar parancssorból indulni, de a haladó beállítások egy része rejtve marad.",
      en: "A graphical model browser, quantisation picker and local server in one. The best entry point for anyone not starting from a terminal, though some advanced settings stay hidden.",
    },
    why: {
      hu: "Ezt a felületet érdemes megmutatni annak, akit most vezetsz be a helyi modellekbe.",
      en: "This is the interface to show someone you are introducing to local models.",
    },
  },
  {
    id: "companies-2026w39-mistral-news",
    category: "companies",
    score: 75,
    readMinutes: 5,
    publishedLabel: "09 / 18",
    publishedAt: "2026-09-18",
    source: "Mistral AI",
    url: "https://mistral.ai/news/",
    tags: ["open-weights", "funding", "policy"],
    title: {
      hu: "Mistral AI: nyílt súlyok és európai pozicionálás",
      en: "Mistral AI: open weights and European positioning",
    },
    summary: {
      hu: "A nyílt súlyú kiadások és a zárt API-termékek közötti egyensúlyozás jól követhető a bejelentésekből. Európai adatkezelési szempontból ez a legrelevánsabb szállító.",
      en: "The balance between open-weight releases and closed API products is legible from the announcements. From a European data-handling angle this is the most relevant vendor.",
    },
    why: {
      hu: "EU-s adatkezelési megkötések mellett gyakran ez marad az egyetlen reális választás.",
      en: "Under EU data-handling constraints this is often the only realistic option left.",
    },
  },
  {
    id: "research-2026w39-arxiv-cs-cl-feed",
    category: "research",
    score: 73,
    readMinutes: 3,
    publishedLabel: "09 / 18",
    publishedAt: "2026-09-18",
    source: "arXiv cs.CL",
    url: "https://arxiv.org/list/cs.CL/recent",
    tags: ["benchmarks", "training", "evals"],
    title: {
      hu: "arXiv cs.CL: a nyers, szűretlen folyam",
      en: "arXiv cs.CL: the raw, unfiltered stream",
    },
    summary: {
      hu: "Napi több száz beküldés, előszűrés nélkül. Önmagában kezelhetetlen, de pont ezért ez a helyes forrás egy automatizált pontozó-pipeline bemenetének.",
      en: "Several hundred submissions a day with no pre-filtering. Unmanageable on its own, which is exactly why it is the right input for an automated scoring pipeline.",
    },
    why: {
      hu: "Ez lesz az ingest pipeline egyik elsődleges forrása — érdemes most megnézni a nyers alakját.",
      en: "This will be a primary source for the ingest pipeline — worth seeing its raw shape now.",
    },
  },
  {
    id: "companies-2026w39-meta-ai-blog",
    category: "companies",
    score: 71,
    readMinutes: 6,
    publishedLabel: "09 / 18",
    publishedAt: "2026-09-18",
    source: "Meta AI",
    url: "https://ai.meta.com/blog/",
    tags: ["open-weights", "multimodal", "training"],
    title: {
      hu: "Meta AI: nyílt súlyú kiadások és kutatási irányok",
      en: "Meta AI: open-weight releases and research directions",
    },
    summary: {
      hu: "A Llama-vonal licencfeltételei legalább annyira fontosak, mint a képességek — ezek változása közvetlenül befolyásolja, mit lehet egyáltalán helyben futtatni és üzletileg használni.",
      en: "The Llama line's licence terms matter as much as its capabilities — changes there directly affect what can be run locally and used commercially at all.",
    },
    why: {
      hu: "A licencfeltétel gyakran nagyobb korlát, mint a modell képessége.",
      en: "The licence terms are often a harder constraint than the model's capability.",
    },
  },
  {
    id: "research-2026w39-deepmind-research",
    category: "research",
    score: 70,
    readMinutes: 12,
    publishedLabel: "09 / 17",
    publishedAt: "2026-09-17",
    source: "Google DeepMind",
    url: "https://deepmind.google/research/",
    tags: ["reasoning", "multimodal", "benchmarks"],
    title: {
      hu: "DeepMind kutatási portfólió",
      en: "DeepMind research portfolio",
    },
    summary: {
      hu: "A nyelvi modelleken túl az anyagtudomány, a biológia és a matematika irányába mutató munkák is itt találhatók. Ezek ritkán aktuálisak, de jól jelzik, hova tart a terület.",
      en: "Beyond language models, work pointing towards materials science, biology and mathematics lives here. Rarely urgent, but a good indicator of where the field is heading.",
    },
    why: {
      hu: "A nem-nyelvi alkalmazások mutatják meg, mennyire általánosítható a jelenlegi megközelítés.",
      en: "Non-language applications show how far the current approach generalises.",
    },
  },
  {
    id: "research-2026w39-lm-eval-harness",
    category: "research",
    score: 68,
    readMinutes: 7,
    publishedLabel: "09 / 17",
    publishedAt: "2026-09-17",
    source: "EleutherAI",
    url: "https://github.com/EleutherAI/lm-evaluation-harness",
    tags: ["evals", "benchmarks", "tooling"],
    title: {
      hu: "lm-evaluation-harness: reprodukálható modellértékelés",
      en: "lm-evaluation-harness: reproducible model evaluation",
    },
    summary: {
      hu: "A publikált benchmark-számok nagy része ezzel készül. Ha saját összehasonlítást akarsz, ez az eszköz teszi lehetővé, hogy az eredményed egyáltalán összevethető legyen másokéval.",
      en: "Most published benchmark numbers are produced with this. If you want your own comparison, this is what makes your result comparable to anyone else's at all.",
    },
    why: {
      hu: "Enélkül a saját mérésed nem hasonlítható össze semmivel.",
      en: "Without it your own measurements cannot be compared to anything.",
    },
  },
  {
    id: "companies-2026w39-hugging-face-blog",
    category: "companies",
    score: 66,
    readMinutes: 5,
    publishedLabel: "09 / 17",
    publishedAt: "2026-09-17",
    source: "Hugging Face",
    url: "https://huggingface.co/blog",
    tags: ["open-weights", "tooling", "fine-tuning"],
    title: {
      hu: "Hugging Face: ökoszisztéma-hírek és gyakorlati útmutatók",
      en: "Hugging Face: ecosystem news and practical guides",
    },
    summary: {
      hu: "A vállalati bejelentések és a közösségi útmutatók keverednek. Az utóbbiak gyakran hasznosabbak: konkrét finomhangolási és kvantálási receptek, működő kóddal.",
      en: "Corporate announcements and community guides mix here. The latter are often more useful: concrete fine-tuning and quantisation recipes with working code.",
    },
    why: {
      hu: "A közösségi útmutatók gyakran előbb jelennek meg, mint a hivatalos dokumentáció.",
      en: "Community guides often land before the official documentation does.",
    },
  },
  {
    id: "local-2026w39-llamafile-single-binary",
    category: "local",
    score: 64,
    readMinutes: 5,
    publishedLabel: "09 / 16",
    publishedAt: "2026-09-16",
    source: "Mozilla Ocho",
    url: "https://github.com/Mozilla-Ocho/llamafile",
    tags: ["runtime", "tooling", "inference"],
    title: {
      hu: "llamafile: modell és futtatókörnyezet egyetlen fájlban",
      en: "llamafile: model and runtime in a single file",
    },
    summary: {
      hu: "Egyetlen, több platformon futó bináris, amiben a súlyok is benne vannak. Terjesztésre és archiválásra kifejezetten elegáns megoldás, ha a fájlméret nem számít.",
      en: "A single cross-platform binary with the weights embedded. An elegant answer for distribution and archiving, as long as file size is not a concern.",
    },
    why: {
      hu: "Archiválási szempontból ez a legrobusztusabb forma: nincs függőség, ami elavulhat.",
      en: "For archiving this is the most robust form: no dependency that can rot.",
    },
  },
  {
    id: "companies-2026w39-cohere-blog",
    category: "companies",
    score: 62,
    readMinutes: 4,
    publishedLabel: "09 / 16",
    publishedAt: "2026-09-16",
    source: "Cohere",
    url: "https://cohere.com/blog",
    tags: ["rag", "serving", "policy"],
    title: {
      hu: "Cohere: vállalati fókuszú modellek és RAG",
      en: "Cohere: enterprise-focused models and RAG",
    },
    summary: {
      hu: "A visszakeresés-alapú generálásra és a beágyazási modellekre koncentráló termékvonal. Kevesebb figyelmet kap, mint a frontier-labok, de a RAG-oldali anyagaik gyakorlatiasak.",
      en: "A product line concentrated on retrieval-augmented generation and embedding models. It gets less attention than the frontier labs, but their RAG material is practical.",
    },
    why: {
      hu: "A beágyazási modell megválasztása a RAG-minőség egyik legalulértékeltebb tényezője.",
      en: "Embedding model choice is one of the most underrated factors in RAG quality.",
    },
  },
  {
    id: "companies-2026w39-allen-institute",
    category: "companies",
    score: 61,
    readMinutes: 6,
    publishedLabel: "09 / 16",
    publishedAt: "2026-09-16",
    source: "Allen Institute",
    url: "https://allenai.org/",
    tags: ["open-weights", "training", "evals"],
    title: {
      hu: "Allen Institute for AI: teljesen nyílt modellek",
      en: "Allen Institute for AI: fully open models",
    },
    summary: {
      hu: "Nemcsak a súlyokat, hanem a tanítóadatot és a tanítási receptet is publikálják. Ez a ritka kombináció teszi őket a reprodukálhatósági kérdések elsődleges hivatkozási pontjává.",
      en: "They publish not just weights but the training data and recipe too. That rare combination makes them the primary reference point for reproducibility questions.",
    },
    why: {
      hu: "Ha a tanítóadat összetétele a kérdés, gyakorlatilag ez az egyetlen nyílt forrás.",
      en: "When the question is training data composition, this is effectively the only open source.",
    },
  },
  {
    id: "github-2026w39-transformers-release",
    category: "github",
    score: 78,
    readMinutes: 6,
    publishedLabel: "09 / 22",
    publishedAt: "2026-09-22",
    source: "huggingface",
    url: "https://github.com/huggingface/transformers",
    tags: ["tooling", "training", "fine-tuning"],
    title: {
      hu: "transformers: a referencia-implementációk gyűjtőhelye",
      en: "transformers: where the reference implementations live",
    },
    summary: {
      hu: "Egy új architektúra általában akkor válik igazán használhatóvá, amikor ide bekerül. A kiadási jegyzetek jó korai jelzést adnak arról, mi számít majd elterjedtnek.",
      en: "A new architecture usually becomes genuinely usable once it lands here. The release notes are a good early signal for what will become widespread.",
    },
    why: {
      hu: "A könyvtárba való bekerülés jobb elterjedtség-mutató, mint a cikk hivatkozásszáma.",
      en: "Landing in this library predicts adoption better than a paper's citation count.",
    },
  },
  {
    id: "github-2026w39-pytorch-core",
    category: "github",
    score: 72,
    readMinutes: 8,
    publishedLabel: "09 / 20",
    publishedAt: "2026-09-20",
    source: "pytorch",
    url: "https://github.com/pytorch/pytorch",
    tags: ["training", "runtime", "inference"],
    title: {
      hu: "PyTorch: a réteg, amin minden más áll",
      en: "PyTorch: the layer everything else stands on",
    },
    summary: {
      hu: "A fordítási és kvantálási alrendszerek változásai a teljes ökoszisztémán végiggyűrűznek. A major kiadások törési listáit érdemes előre elolvasni, nem a hibák után.",
      en: "Changes in the compilation and quantisation subsystems ripple through the whole ecosystem. Read the breaking-change lists of major releases in advance, not after the failures.",
    },
    why: {
      hu: "Egy major PyTorch-frissítés több projektet tör el, mint bármelyik modellkiadás.",
      en: "A major PyTorch upgrade breaks more projects than any model release does.",
    },
  },
  {
    id: "github-2026w39-litellm-gateway",
    category: "github",
    score: 69,
    readMinutes: 5,
    publishedLabel: "09 / 19",
    publishedAt: "2026-09-19",
    source: "BerriAI",
    url: "https://github.com/BerriAI/litellm",
    tags: ["serving", "tooling", "agents"],
    title: {
      hu: "LiteLLM: egységes felület a szolgáltatók előtt",
      en: "LiteLLM: one interface in front of every provider",
    },
    summary: {
      hu: "Egységes OpenAI-kompatibilis réteg több tucat szolgáltatóhoz, költségkövetéssel és rate limittel. Pont az a fajta absztrakció, amitől a modellváltás konfigurációs kérdéssé válik.",
      en: "A unified OpenAI-compatible layer over dozens of providers, with cost tracking and rate limiting. Exactly the abstraction that turns switching models into a config change.",
    },
    why: {
      hu: "Ha a modellválasztó menüt futásidőben akarod állítani, valami ilyesmi kell alá.",
      en: "If the model picker should be runtime-configurable, something like this belongs underneath.",
    },
  },
  {
    id: "github-2026w39-open-webui",
    category: "github",
    score: 65,
    readMinutes: 4,
    publishedLabel: "09 / 18",
    publishedAt: "2026-09-18",
    source: "open-webui",
    url: "https://github.com/open-webui/open-webui",
    tags: ["tooling", "rag", "agents"],
    title: {
      hu: "Open WebUI: önállóan hosztolt chat-felület",
      en: "Open WebUI: a self-hosted chat front-end",
    },
    summary: {
      hu: "Teljes chat-felület helyi és távoli modellekhez, beépített dokumentum-visszakereséssel. Jó referencia arra, milyen funkciókat vár ma egy felhasználó egy chat-paneltől.",
      en: "A complete chat interface for local and remote models with built-in document retrieval. A useful reference for what users now expect from a chat panel.",
    },
    why: {
      hu: "Referenciának hasznos a saját chat-panel tervezésekor — mit hagyjunk ki, és miért.",
      en: "Useful as a reference when designing our own chat panel — what to leave out, and why.",
    },
  },
];

export const githubTop10: readonly GithubTopEntry[] = [
  ["ggml-org/llama.cpp", "GGUF inference runtime, CPU and GPU", "https://github.com/ggml-org/llama.cpp"],
  ["vllm-project/vllm", "High-throughput serving with PagedAttention", "https://github.com/vllm-project/vllm"],
  ["huggingface/transformers", "Reference model implementations", "https://github.com/huggingface/transformers"],
  ["ollama/ollama", "One-command local model management", "https://github.com/ollama/ollama"],
  ["open-webui/open-webui", "Self-hosted chat front-end with retrieval", "https://github.com/open-webui/open-webui"],
  ["BerriAI/litellm", "Unified gateway across model providers", "https://github.com/BerriAI/litellm"],
  ["unslothai/unsloth", "Memory-efficient fine-tuning", "https://github.com/unslothai/unsloth"],
  ["ml-explore/mlx", "Array framework for Apple Silicon", "https://github.com/ml-explore/mlx"],
  ["QwenLM/Qwen3", "Open-weight model family and tooling", "https://github.com/QwenLM/Qwen3"],
  ["exo-explore/exo", "Distributed inference across home devices", "https://github.com/exo-explore/exo"],
] as const;

export const archiveIssues: ArchiveIssue[] = [
  {
    id: "2026-w38",
    period: "2026 / 09",
    week: "W38",
    top: "Kvantálási receptek és a 4 bites inferencia minőségi határai.",
    itemCount: 22,
    readMinutes: 118,
  },
  {
    id: "2026-w37",
    period: "2026 / 09",
    week: "W37",
    top: "Ügynök-keretrendszerek konszolidációja és az eszközhívási szabványok.",
    itemCount: 19,
    readMinutes: 96,
  },
  {
    id: "2026-w36",
    period: "2026 / 09",
    week: "W36",
    top: "Hosszú kontextus: a visszakeresés és a nagy ablak közötti átváltás.",
    itemCount: 25,
    readMinutes: 134,
  },
  {
    id: "2026-w35",
    period: "2026 / 08",
    week: "W35",
    top: "Nyílt súlyú kiadások licencfeltételei és a kereskedelmi használat.",
    itemCount: 20,
    readMinutes: 104,
  },
  {
    id: "2026-w34",
    period: "2026 / 08",
    week: "W34",
    top: "Értékelési módszertan: mit mérnek valójában a vezető benchmarkok.",
    itemCount: 23,
    readMinutes: 127,
  },
  {
    id: "2026-w33",
    period: "2026 / 08",
    week: "W33",
    top: "Helyi multimodális modellek és a képfeldolgozás memóriaigénye.",
    itemCount: 18,
    readMinutes: 89,
  },
];

if (process.env.NODE_ENV !== "production") {
  const mustReadCount = digestItems.filter((item) => item.mustRead).length;
  if (mustReadCount !== 3) {
    console.warn(
      `data/digest: expected exactly 3 mustRead items, found ${mustReadCount}. ` +
        "The top-3 grid's deliberate nth-child stagger only reads correctly at three."
    );
  }

  const ids = new Set(digestItems.map((item) => item.id));
  if (ids.size !== digestItems.length) {
    console.warn("data/digest: duplicate item id detected — ids are primary keys.");
  }
}
