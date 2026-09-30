# „Olvasd itt” és automatikus tükör — terv

**Állapot:** jóváhagyva (2026-09-30), három részben, a beszélgetésben
**Kapcsolódó:** TODO.md → „Olvasás a saját oldalunkon a Radarból is”; ARCHITECTURE.md → Invariants; CLAUDE.md → How content gets in

## Cél

A Radar-kártyák ma az eredeti oldalra visznek. A tulajdonos a saját oldalunkon akarja olvasni a cikkeket, úgy, ahogy a Library-posztokat: tükrözött ábrákkal, a saját összefoglalónkkal. A legjobb hírek maguktól kerüljenek be a Library-be. Szó szerint ezt kérte: „Olvasd itt kártya de automatikus tükör a legjobbakról.”

**Siker:**
- Egy kártyán az „Olvasd itt” egy kattintással a mi posztunkat nyitja, ha a cikk már bent van.
- Ha még nincs bent, a taiyaki chatben követhető a feldolgozása.
- A napi futás után a hét legjobbjai 2–3 órán belül olvashatók.

## 1. Az „OLVASD ITT” a kártyán

- **A gomb helye:** minden hírkártya láblécében (a Top 3-ban, a hírfolyamban és az AI cégek oldalon, mert ezek egy komponenst használnak) a „Megnyitás ↗” után egy „OLVASD ITT” / „READ HERE” gomb áll.
- **Ha a cikkből már van poszt**, a gomb egy `<Link>` a `/library/<id>`-re, benne a függő ponttal (`PendingDot`).
- **Ha még nincs poszt**, a gomb megnyitja a taiyaki chatet, és beküldi a hír URL-jét, mintha az olvasó illesztette volna be. A többi a chat meglévő útja: „FELDOLGOZÁS…” → „KÉSZ · MEGNYITÁS →”, hibánál ÚJRA, a már bent lévő linknél a 409-es „MEGNYITÁS →”.
- **Olvasottnak jelölés:** mindkét eset olvasottnak jelöli a Radar-hírt, mint a „Megnyitás” (`onOpen`, visszavonható).
- **Ahol nincs gomb:** ha a hír URL-jét a beküldés elutasítaná (`parseSubmittedUrl` → null).
- **Az item → poszt térkép** egy gyorsítótár nélküli lekérdezés (`sources.url` → `posts.id`). A `/` oldalon az olvasói állapottal párhuzamosan fut, a `/archive/[week]` oldalon utána. A két oldal ugyanazon a normalizáláson megy át (`parseSubmittedUrl`). Hiba esetén `{}`: a kártya a chatet kínálja, és annak 409-e a posztra mutat.
- **Fókusz:** bezáráskor a fókusz a kártya gombjára tér vissza.
- **Az előnézet** negatív azonosítójú fixture-posztra mutat, a chat pedig a memóriás küldőt használja. Valódi adat nem kerül bele.
- **Nincs benne:** külön billentyűparancs (az `o` marad az eredetire) és haladásjelzés a kártyán.

## 2. A tükör sorba állítása

- **Mikor:** a napi cron a `runDaily` után (a Top 3 már friss) egy külön lépést futtat, a `queueMirrors`-t.
- **Mit választ:** a hét minden legalább 85 pontos hírét (`MIRROR_MIN_SCORE = 85`) és a hét Top 3-át (`must_read`).
- **Mit ír:**
  - `pending` forrás a rendszer-fiók nevén: `submitted_by = RADAR_MIRROR_USER_ID`;
  - az URL a `parseSubmittedUrl` szerint normalizálva, a típus a `detectSource`-ból;
  - `upsert(..., { onConflict: "url", ignoreDuplicates: true })`, így a már bent lévő URL-hez (egy tag beküldése vagy egy korábbi nap tükre) nem nyúl.
- **A rendszer-fiók:** a tulajdonos veszi fel a Supabase-ben (*Users → Add user*, Auto Confirm), és soha nem lép be vele. Az azonosítója szerveroldali környezeti változó. Ha a változó nincs beállítva, a lépés egy figyelmeztetéssel kimarad.
- **Hiba esetén:** a sorba állítás hibája csak napló, a napi kiadás attól még megvan. A cron válasza `mirrored` mezőt kap, benne az újonnan sorba állított források számával.
- **Láthatóság:**
  - a tükrözött posztok mindenkinek látszanak a Library-ben;
  - a link-chat szálakban nem, mert azok a saját beküldéseket mutatják;
  - szerkeszteni és újrakinyerni őket senki nem tudja, amíg nincs admin szerepkör (TODO.md).
- **Nincs benne:** napi darabkorlát. Ami nem fér be egy napba, az a következő cronokon a legrégebbi az első sorrendben jön.

## 3. Feldolgozás és lefoglalás

- **Az új route:** `GET /api/cron/mirror` (Bearer `CRON_SECRET`, `maxDuration = 300`) a meglévő `retryPendingSources`-t futtatja a saját határidejével. Időzítése a `vercel.json`-ban: `0 7 * * *`, `0 8 * * *`, `0 9 * * *` (Hobby: naponta egyszer, ±59 perc). A napi cron 05:00 és 05:59 között indul, és legfeljebb 300 mp-ig fut, így egyik tükör-cron sem fedi át, és egymást sem. A napi cron maradék ideje továbbra is dolgozik. (A jóváhagyott 06/07/08 órás időzítés a tervezéskor csúszott egy órát, az átfedés miatt.)
- **Közös jogosultság-ellenőrzés:** a két cron ugyanazt a segédet használja (`isCronRequest`).
- **A lefoglalás** (a tervezéskor pontosítva, 2026-09-30): a `processSource` a munka előtt lefoglalja a forrást, két lépésben.
  1. **Lease:** ha a forrás `claimed_at`-je 10 percnél frissebb (`CLAIM_LEASE_MS`, a 300 mp-es `maxDuration` kétszerese), egy másik futás dolgozik rajta, és ez a futás `false`-szal kilép.
  2. **Összehasonlító frissítés:** a futás egy írásban növeli az `attempts`-et és beállítja a `claimed_at`-et, csak ha az `attempts` még a kiolvasott érték. Ha 0 sor egyezik, egy egyszerre induló másik futás megelőzte, és ez `false`-szal kilép.

  A kész futás (siker vagy hiba) a záró írásban nullázza a `claimed_at`-et. Egy elhalt futás lease-e 10 perc után lejár, és a következő futás átveheti. A `retryPendingSources` csak a lefoglaltakat számolja.
  - **Miért kell a lease:** a Vercel egy cront ritkán kétszer is elindít („Cron delivery can also occasionally invoke the same scheduled run more than once”). Egy futás pedig, amely egy másik lefoglalása *után* olvas, a megnövelt `attempts`-et látja, és a puszta összehasonlító frissítés átengedné. A lease ezt is megfogja, és a `retrySource` `ponytail:` versenyét is: egy „Újra” egy épp futó cron alatt nem indít második futást.
  - **Migráció:** csak hozzáad, egy oszlopot: `sources.claimed_at timestamptz`. A tulajdonos futtatja az SQL Editorban, **a push előtt**, mert a kód olvassa az oszlopot.
- **409 egy sorban álló forrásnál:** ha a `POST /api/sources` egy olyan URL-t kap, amelynek a forrása `pending`, és még nincs posztja, a 409 `{ error: "already_submitted", queued: true }` lesz, és `after()`-ben elindul a feldolgozás. Ha közben egy másik futás dolgozik rajta, a lease miatt ez a futás nem csinál semmit. A chat szövege ilyenkor: „Már sorban van, pár perc és kész.” / „It's already in the queue; give it a few minutes.”

## A tulajdonos teendői a kód után

1. A migráció (`supabase/migrations/20260930000000_source_claims.sql`) futtatása az SQL Editorban.
2. Rendszer-fiók: Supabase → *Authentication → Users → Add user*, egy saját címmel, Auto Confirm. A felhasználó UUID-ja kell.
3. Vercel → *Environment Variables*: `RADAR_MIRROR_USER_ID=<UUID>` (Production), utána redeploy.
4. Push. A három új cront a `vercel.json` hozza.

## Kockázatok

- **Szerzői jog:** a tükör az eddigi kézi beküldéseknél több cikket másol. A védelem ugyanaz: `noindex`, a meghívásos kapu és a `noarchive` tisztelete (README.md → Content and copyright). Ezt a README-ben is jelezni kell.
- **Modellköltség:** egy tükrözött cikk egy `ingest_article` (és cikkeknél egy `ingest_cleanup`) hívás. Napi 10–20 cikk a Gemini ingyenes vagy olcsó keretébe fér.
