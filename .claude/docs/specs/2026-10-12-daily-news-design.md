# Napi hírek — specifikáció

Dátum: 2026-10-12. A tulajdonos kérése (2026-10-11), a 2026-10-12-i forrás-felülvizsgálat (`sources-review` branch) után. Utána a taiyaki chat AI (2d) és a keresés (2b) jön, külön speccel.

## Cél

Minden este egy rövid, ismétlésmentes napi lista, amiből a cikk megnyitása nélkül is képben van az olvasó, és csak akkor nyitja meg az eredetit, ha az összefoglaló alapján megéri:

- **10 hír pontszámmal**, mindegyikhez egy **2–3 perces összefoglaló** (300–450 szó);
- köztük mindig **3–5 rövid olvasmány** (legfeljebb 15 perc);
- **ismétlés nélkül**: ugyanaz a történet nem jön kétszer, se a napi, se a heti listában;
- **18:00-ra (magyar idő) kész**;
- a nézet a heti Radar UI-jának átalakított másolata.

A pontozás finomítása későbbre marad (a tulajdonos döntése).

## Döntések

### N1. Egy futás, este

A mostani 05:00 UTC-s napi futás estére költözik. Egyszerre tölti a heti számot, ahogy most (naponta legfeljebb 25 hír), és kiválasztja belőle a nap Top 10-ét. Egy gyűjtés, egy ismétlésszűrés, egy válogató hívás. A heti nézet teljes marad, a napi a sűrített.

### N2. Időzítés: 18:00-ra kész

A Vercel Hobby csomagon a cron naponta egyszer fut, **±59 perces pontossággal, UTC-ben** (Vercel docs, Cron Jobs → Usage & Pricing). A magyar idő nyáron UTC+2, télen UTC+1.

| Cron | Ütemezés | Nyáron (CEST) | Télen (CET) |
| --- | --- | --- | --- |
| `/api/cron/daily` | `0 14 * * *` | 16:00–16:59 | 15:00–15:59 |
| `/api/cron/mirror` | `0 15 * * *` | 17:00–17:59 | 16:00–16:59 |
| `/api/cron/mirror` | `0 16 * * *` | 18:00–18:59 | 17:00–17:59 |
| `/api/cron/mirror` | `0 17 * * *` | 19:00–19:59 | 18:00–18:59 |

A napi futás a saját 300 másodpercéből már a Top 10 egy részét feldolgozza (`retryPendingSources` a route-ban). A 15:00-s tükör-kör nyáron is 18:00 előtt lefut. A 16:00-s és a 17:00-s kör a kimaradt vagy elbukott források ismétlése. A futásszám nem változik (négy cron), csak az időpontok.

A Hacker News és a csatornák 2 napos visszatekintése marad. A HF Daily Papers a lezárt napokat olvassa (`finishedDays`), 14 UTC-kor is a tegnapit és a tegnapelőttit.

### N3. Történet szintű ismétlésszűrés, modellel

Ma csak URL alapján szűrünk (14 nap). Ugyanaz a hír három forrásból (a cég saját bejelentése, The Decoder, The Rundown) háromszor is bekerülhet.

- A `daily_curate` prompt megkapja az **utolsó 14 nap már közölt címeit** (`digest_items` angol címe, legfeljebb 400 sor, a legfrissebb elöl), „ALREADY COVERED” blokként.
- Az utasítás: ugyanarról a történetről csak egy tételt válasszon, az elsődleges forrással (a laborét, a szerzőét), és hagyja ki, amiről már volt szó, kivéve, ha lényeges új fejlemény van.
- Embedding nincs. Az a chat AI-val (2d) és a kereséssel (2b) jön.
- A hír-id képzése nem változik (ARCHITECTURE.md → Invariants: append-only).

### N4. A Top 10 kiválasztása kódban

`pickDailyTop(items, { size: 10, minShort: 3, maxShort: 5, shortMinutes: 15 })` tiszta függvény a nap beszúrt tételein:

1. pontszám szerint csökkenő sorrend, egyenlő pontnál a modell válaszának sorrendje;
2. az első 10;
3. ha 3-nál kevesebb benne a rövid (`readMinutes ≤ 15`), a legalacsonyabb pontú hosszúak helyére a legjobb kimaradt rövidek kerülnek, amíg 3 nem lesz, vagy el nem fogynak;
4. ha 5-nél több a rövid, a legalacsonyabb pontú rövidek helyére a legjobb kimaradt hosszúak kerülnek, amíg 5 nem lesz, vagy el nem fogynak;
5. a végső lista újra pontszám szerint rendezve, rang 1-től.

A „rövid” a modell becsült olvasási ideje (`readMinutes`), a kinyerés előtt. **Ismert korlát:** később a tükrözött szöveg szószámából pontosítható.

Csak a **nap aznap beszúrt** tételeiből választ (a `toDigestRows` kimenete, amit az `ignoreDuplicates` nem dobott el), így egy korábbi napon már közölt hír nem kerül újra a Top 10-be.

### N5. A brief: a 2–3 perces összefoglaló a Library-tükörből

- A nap Top 10-e bekerül a tükrözési sorba (`queueMirrors`), a mostaniak (≥ 85 pont, a hét Top 3-a) mellé. A meglévő gépezet letölti a teljes cikket, kitisztítja, tükrözi a képeket, és összefoglalja.
- Az összefoglaló-hívás (`summarize`, `ingest_article`) sémája egy új mezővel bővül:
  - `brief: { hu: string[], en: string[] } | null`, 3–5 bekezdés, összesen 300–450 szó nyelvenként;
  - tartalom: mi történt, a fontos részletek és számok, miért számít egy AI-mérnöknek, és a fenntartások;
  - saját szavakkal, mint a többi összefoglaló; a `noarchive` oldalaknál is (a szöveget nem tükrözzük, az összefoglaló a saját szavunk);
  - `null`, ha csak az oldal leírása érhető el (`meta.extractionFailed`).
- **Minden új Library-poszt** megkapja, a tagok beküldött linkjei is. Plusz modellhívás nincs, a kimenet kb. 1–1,5 ezer tokennel nő posztonként.
- Tárolás: új `posts.brief jsonb null` oszlop. Olvasás: `readBrief` (mint a `readOverrides`), ami hibás vagy hiányzó értékre `null`-t ad, így a régi posztok is működnek.
- A fordítás (`translatePost`) nem érinti: a brief eleve kétnyelvű.

### N6. Adat

Új tábla, a `github_top` mintájára:

```sql
create table public.daily_top (
  day date not null,
  rank smallint not null check (rank between 1 and 10),
  item_id text not null references public.digest_items(id) on delete cascade,
  primary key (day, rank)
);
alter table public.daily_top enable row level security;
create policy "members read daily_top" on public.daily_top for select to authenticated using (true);
```

- `day` a **budapesti dátum** (`Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" })`), így egy késő esti kézi futás sem csúszik át a következő napra.
- A futás `upsert`-tel írja (`onConflict: "day,rank"`), és törli a nap régi, a mai listánál hátrébb lévő rangjait, mint a `github_top`-nál.
- Csak a titkos kulcs ír bele.
- Migráció: `supabase/migrations/20261012000000_daily_top_and_brief.sql` (a `daily_top` tábla és a `posts.brief` oszlop). Csak hozzáad; a tulajdonos futtatja az SQL Editorban, **a deploy előtt**.

### N7. A `/daily` nézet

- **Útvonal:** `app/(app)/daily/page.tsx`, `force-dynamic`, saját `loading.tsx` (`RadarSkeleton`).
- **Adat** (`getDaily(db)` a `lib/content.ts`-ben):
  1. a legutóbbi nap `daily_top` sorai, a `digest_items`-szel beágyazva (1 lekérdezés);
  2. a 10 URL posztja a briefjével, összefoglalójával és fő pontjaival (a `readHerePosts` mintájára, `sources` → `posts`);
  3. `getRatings` és `getReaderSeed` a tételek hetére (a meglévők).
- **Hero:** „NAPI//”, a dátum, és egy sor: „10 hír · ebből 4 rövid”.
- **Tartalomjegyzék:** a 10 cím számozva, pontszámmal, horgonylinkkel (`#daily-3`).
- **Kártyák:** a meglévő `StoryCard` egy `brief` kiegészítéssel és a `CardToolbar` (olvasott, később, 👎👍❤, teendő; ugyanaz az `item_states`, mint a heti nézetben).
  - nagy sorszám, a brief bekezdései `max-w-[75ch]`;
  - a rövid olvasmány „RÖVID · 8 perc” jelet kap;
  - alul „Olvasd itt” (a tükrözött poszt) és „Forrás”.
- **Heti nézet:** a napi Top 10 tételei „NAP TOP · 3.” jelet kapnak (a `getRadar` a `daily_top`-ot is beágyazza).
- **Menü** (`lib/nav.ts`):
  - asztalon „Napi” a Radar alatt;
  - telefonon a sáv: Radar, Napi, taiyaki, Library, Több. A Keresés a „Több” alá kerül (a 2b-ig helykitöltő).
- **Kétnyelvű** a teljes felület: a brief `{ hu, en }`, a nyelvváltó helyben vált.

### N8. Köztes állapotok és hibák

| Helyzet | Mit lát az olvasó |
| --- | --- |
| A brief még készül (a forrás `pending`) | a rövid összefoglaló és „A részletes összefoglaló készül…” |
| A kinyerés elbukott, de van poszt | a poszt bekezdése és fő pontjai |
| Nincs poszt (a forrás `failed`) | a rövid összefoglaló |
| Ma még nincs lista (18 előtt, vagy elbukott a futás) | az utolsó kész nap listája a dátumával: „Tegnapi lista — a mai 18:00-ra készül” |
| Még soha nem volt lista | `EmptyState` |
| 10-nél kevesebb tétel | annyi kártya, amennyi van |

- A `daily_top` írásának hibája a `runDaily` hibája: a route elkapja, naplózza, `500 daily_failed`, és a függő források ismétlése így is lefut (mint ma).
- A brief hiánya soha nem hiba: a kártya visszalép az előző sorra.

### N9. Ami nem része ennek

- a TLDR AI bontója (külön kis csomag);
- a pontozás finomítása;
- a korábbi napok saját oldala (a heti nézet jelöli őket);
- az olvasási idő pontosítása a tükrözött szövegből;
- napi e-mail vagy értesítés.

## Tesztelés

- **`pickDailyTop`** (tiszta függvény): pontszám-sorrend; kevés rövidnél csere; ötnél több rövidnél csere; 10-nél kevesebb tétel; nincs elég rövid; egyenlő pontnál stabil sorrend; üres bemenet.
- **`runDaily`:**
  - a prompt tartalmazza az elmúlt 14 nap címeit, és nem többet 400-nál;
  - a `daily_top` sorai a budapesti dátummal, az upsert és a régi rangok törlése;
  - csak az aznap beszúrt tételek kerülnek a Top 10-be;
  - a két rögzített hír-id változatlan.
- **`queueMirrors`:** a nap Top 10-e bekerül, a 85 pont alatti is.
- **Összefoglaló:** a séma kéri a briefet; `extractionFailed` mellett `null`; `readBrief` hibás értékre `null`.
- **Nézet** (render-tesztek és előnézet): a kártyák, a tartalomjegyzék horgonyai, a „RÖVID” jel, a N8 állapotai. Előnézet: `/dev/preview?view=daily` és `daily-empty`, negatív id-jű fixture-ökkel.
- **Cronok:** a `vercel.json` időpontjai (teszt, ami a négy sort rögzíti).
- **Mutációs próbák** a `pickDailyTop`-ra és a dátumra.
- **Futásidejű próba** Playwright-tal 360 és 1280 px-en, a DESIGN.md szerint.

## Kiadás

1. Migráció az SQL Editorban (`20261012000000_daily_top_and_brief.sql`), a deploy előtt.
2. Merge → deploy. A cronok átidőzítése a deploy-jal élesedik.
3. Első este: a `/daily` 18:00-ra kész, a Top 10-ben 3–5 rövid, a kártyákon brief; a heti nézetben a „NAP TOP” jelek.
4. Ha egy brief hiányzik: a Library-ben a forrás állapota (függő, elbukott) megmutatja, miért.

Migráció kell, új függőség nem.
