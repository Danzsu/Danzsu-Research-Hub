# Megbízható források

Innen húz be tartalmat a Radar napi futása. Ez a lista két dolgot rögzít:

- a **Bent van** rész azt, amit a pipeline ma olvas;
- a **Jelöltek** rész azt, amit még fel akarunk venni.

A kód a [`lib/pipeline/feeds.ts`](lib/pipeline/feeds.ts)-ből dolgozik. A [`lib/truthful-sites.test.ts`](lib/truthful-sites.test.ts) mindkét irányban összeveti a kettőt: ha itt vagy ott hiányzik egy csatorna, egy Hacker News-lekérdezés vagy egy GitHub-téma, a teszt elbukik.

## Mitől megbízható egy forrás

- **Elsődleges forrás.** A kutatócsoport, a cég vagy a szerző maga közli: saját blog, saját preprint, saját repó. A másodlagos hírportál és a közösségi szavazás csak jelzés, a modell az eredeti forrást keresi mögötte.
- **Vállalt szerző.** Név van rajta, és a javításokat jelölik.
- **Géppel olvasható, szabályosan.** Van RSS, Atom vagy API, és a feltételek nem tiltják a letöltést.
- **Olvasható szöveg.** Nincs `noarchive`, és a lényeg nincs fizetőfal mögött.
- **Kevés promóció.** A tisztán hirdetési posztokat a pontozás kiszűri, de ha egy forrásnak ez a többsége, nem vesszük fel.

Típusok a táblázatokban:

- **elsődleges**: maga a forrás közli;
- **másodlagos**: mások eredményeiről tudósító hírportál;
- **közösségi**: szavazással rangsorolt lista.

A céges blog elsődleges forrás, de érdekelt fél: a saját termékéről ír.

## Bent van

### Hírcsatornák (RSS, Atom)

A csatornák 2026-09-23-án élőben ellenőrizve. A `limit` a nagy forgalmú csatornát vágja; ahol nincs megadva, 25 tétel (`DEFAULT_FEED_LIMIT`). A kategória (`hint`) az, amiből a modell kiindul.

| Név | Csatorna | Kategória | Limit | Típus |
| --- | --- | --- | --- | --- |
| arXiv cs.CL | `https://rss.arxiv.org/rss/cs.CL` | research | 40 | elsődleges (preprint, nem lektorált) |
| arXiv cs.AI | `https://rss.arxiv.org/rss/cs.AI` | research | 40 | elsődleges (preprint, nem lektorált) |
| Hugging Face | `https://huggingface.co/blog/feed.xml` | local | 25 | elsődleges |
| Ollama | `https://ollama.com/blog/rss.xml` | local | 25 | elsődleges |
| r/LocalLLaMA | `https://www.reddit.com/r/LocalLLaMA/top/.rss?t=day` | local | 15 | közösségi |
| Simon Willison | `https://simonwillison.net/atom/everything/` | local | 15 | elsődleges (független szakértő) |
| OpenAI | `https://openai.com/news/rss.xml` | companies | 25 | elsődleges (céges) |
| Google DeepMind | `https://deepmind.google/blog/rss.xml` | companies | 25 | elsődleges (céges) |
| Google AI | `https://blog.google/technology/ai/rss/` | companies | 25 | elsődleges (céges) |
| NVIDIA | `https://blogs.nvidia.com/blog/category/generative-ai/feed/` | companies | 25 | elsődleges (céges) |
| AWS ML | `https://aws.amazon.com/blogs/machine-learning/feed/` | companies | 10 | elsődleges (céges) |
| The Decoder | `https://the-decoder.com/feed/` | companies | 20 | másodlagos |
| Interconnects | `https://www.interconnects.ai/feed` | research | 25 | elsődleges (független szakértő) |

### Hacker News

Közösségi forrás. Az Algolia keresője az elmúlt 2 nap 80 pont feletti történeteit adja ezekre a lekérdezésekre:

- `LLM`
- `AI model`
- `open weights`
- `AI agents`

### GitHub

Elsődleges forrás, de a csillagszám népszerűséget mér, nem minőséget. Az elmúlt 7 napban létrehozott repók, csillagszám szerint, ezekben a témákban:

- `llm`
- `ai-agents`
- `generative-ai`
- `local-llm`
- `rag`
- `mcp`

## Jelöltek

Felvétel előtt élőben ellenőrizni kell mindegyiket (lásd lent: Új forrás felvétele).

| Név | Csatorna | Állapot | Megjegyzés |
| --- | --- | --- | --- |
| ByteByteGo | https://blog.bytebytego.com/feed | 2026-09-26-án ellenőrizve: 200, 20 tétel | Rendszertervezés és AI-infrastruktúra. A tételek felében ott a teljes szöveg (`content:encoded`), a poszt-oldalak szerverről letölthetők, `noarchive` nincs rajtuk. A „No thanks” feliratkozó ablak csak böngészőben jelenik meg, ezért a Könyvtárba beküldött link is működik. A fizetős posztokból csak részlet érhető el (Substack), és vannak tisztán promóciós posztok (pl. „LAST CALL FOR ENROLLMENT”). Javaslat: `limit: 5`. |
| Google Research | research.google, a blog és a `research.google/pubs` publikációs oldal | ellenőrizendő | A pontos RSS- vagy API-végpontot a megvalósítás elején kell megkeresni. A felhasználó kérte. |
| Anthropic | news és engineering posztok | ellenőrizendő | Hivatalos RSS-ről nem tudunk. Ha nincs, oldal-letöltéssel kerülhet be. |
| Hugging Face Daily Papers | a közösség napi felszavazott cikkei | ellenőrizendő | Közösségi rangsor elsődleges cikkekről. |
| Semantic Scholar | API | ellenőrizendő | A Google Scholar helyett. |
| OpenAlex | API | ellenőrizendő | A Google Scholar helyett. |
| IBM Research | blog | ellenőrizendő | |
| Microsoft Research | blog | ellenőrizendő | |
| IBM Technology | cikkek és videók | ellenőrizendő | A videók a YouTube-kinyerőn mennek át. |

**Súlyozás:** a Google DeepMind már bent van, de a kiemelt források közé kell emelni.

## Kizárva

| Név | Miért |
| --- | --- |
| Google Scholar | Nincs API-ja, és a feltételei tiltják a letöltést. Helyette: Semantic Scholar, OpenAlex. |

## Új forrás felvétele

1. **Feltételek.** Nézd meg, hogy megfelel-e a fenti feltételeknek.
2. **Élő ellenőrzés.** Ellenőrizd a csatornát élőben:
   - a válasz 200, és vannak tételei;
   - teljes szöveg vagy csak kivonat;
   - van-e `noarchive` vagy fizetőfal;
   - mennyi a promóció.
   Írd a dátumot az Állapot oszlopba.
3. **Kód.** Vedd fel a [`lib/pipeline/feeds.ts`](lib/pipeline/feeds.ts)-be: `{ name, url, hint, limit? }`. A nagy forgalmú csatorna kapjon `limit`-et. Ha a csatorna szerkezete szokatlan, kerüljön egy eset a [`collect.test.ts`](lib/pipeline/collect.test.ts)-be is.
4. **Lista.** Tedd át a sorát a Jelöltek közül a Bent van táblába, a `feeds.ts` értékeivel.
5. **Teszt.** Futtasd: `npm test`. A `lib/truthful-sites.test.ts` elbukik, ha a két lista eltér.
