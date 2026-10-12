# Apróságok 3 — chat és akadálymentesség

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A taiyaki chatből és az R2-ből parkolt apróságok: az elfogadott üzenet ne tűnjön el, ha a frissítés elbukik; a Tab ne körözzön a gomb és a panel között; az olvasópanel ugyanígy engedje tovább a Tabot; a „jelentkezz be újra” link megtartsa a query stringet; iPhone-on a biztonsági sávok éljenek; és egy sikeres ÚJRA a többi bejegyzés kijelentkezés-üzenetét is vigye el.

**Architecture:** A chat logikája a keretrendszer-független `lib/link-chat.ts`-ben marad; a Tab-kezelés (`tabStops`, `tabPastPanel`) a `link-chat.tsx`-ből egy közös `app/components/tab-past-panel.ts`-be költözik, és az olvasópanel is használja.

**Tech Stack:** Next.js 16, React 19, Radix Dialog, `node --test`, Playwright.

**Spec:** a taiyaki chat specje és a TODO.md → Responzívabb UI/UX → „A taiyaki link-chatből ide parkolt tételek”, valamint az R2 „chat ritka versenye” pontja. Felmérés: 2026-10-12, `d7432f7`.

**Mód:** rövid terv, natív végrehajtás, egy záró review. Branch: `polish-chat-a11y`, a `main`-ről.

## Global Constraints

- Minden UI-szöveg `{ hu, en }`-ben; az öt ellenőrzés; Conventional Commits, explicit pathspec, push nincs.
- A `lib/` importjai relatív `.ts` utak.
- A Tab-kezelés, a fókusz és a safe area Playwrighttal, illetve valódi iPhone-on ellenőrizhető (TESTING.md).

## Review Focus

1. Egy küldés 202-t kap, de a lista-frissítés elbukik: a buborék marad, és a következő jó lekérdezés viszi el.
2. Asztalon a sarok-taiyakiból nyitott chat utolsó elemén Tab: a fókusz az oldal első elemére megy, nem vissza a panelbe.
3. Az olvasópanelben a Tab az utolsó elem után kilép a panelből a nyitó gomb utáni elemre.
4. A `/library/42?text=hu` oldalon lejárt munkamenet után a chat linkje `next=/library/42?text=hu`-t visz.
5. iPhone-on (`viewport-fit=cover`) az alsó sáv, a lapok és a toast a home-indikátor fölött ül; fekvő módban a tartalom nem csúszik a kivágás alá.

---

### Task 1: Az elfogadott üzenet a frissítés hibája után is látszik

**Files:** Modify `lib/link-chat.ts` (`send`, kb. 295–322. sor; `load`, kb. 254–263. sor), `app/components/chat-thread.tsx` (257. sor, a 209. sor `Pick`-je); Test: `lib/link-chat.test.ts`, `app/components/chat-thread.test.ts`.

- [ ] A teszt (a `lib/link-chat.test.ts` „after a finished thread's load blips once, the new submission still lands” tesztje mellé, ugyanazzal a mintával): a küldés 202, az utána következő lista-lekérdezés elbukik; a `send` után az `outgoing` nem `null`; `wait(t, POLL_MS)` és egy jó lista után `null`.
- [ ] Futtatás: bukik (a `finally` ma mindig törli a buborékot).
- [ ] A kód:
  ```ts
  // send:
  let accepted = false;
  // … a 202-ellenőrzés után:
  accepted = true;
  // … finally:
  set({ sending: false, ...(accepted ? {} : { outgoing: null }) });
  // load, a jó lista ágán (a mai `...(sent ? { outgoing: null } : {})` helyett):
  ...(sent || !snapshot.sending ? { outgoing: null } : {}),
  ```
  A megtartott buborék ne „SENDING…”-et írjon: `chat-thread.tsx` 257: `label={snapshot.sending ? t.sending : t.processing}`, a 209. sor `Pick`-jébe a `"sending"`; a `chat-thread.test.ts` fixture-je (19. sor) `sending: false`, és a 154. sor tesztje `sending: true`-t ad át.
- [ ] Futtatás: zöld. Ismert korlát: egy második küldés felülírja a megtartott buborékot. Commit: `fix: keep an accepted message in the chat until a reload shows it`

### Task 2: A Tab-kezelés közös modulba kerül, és nem köröz

**Files:** Create `app/components/tab-past-panel.ts`; Modify `app/components/link-chat.tsx` (67–77. és 86–107. sor), `app/components/digest-dashboard.tsx` (250–281. sor).

- [ ] A `tabStops` és a `tabPastPanel` átköltözik; az aláírás `tabPastPanel(event, getOpener: () => HTMLElement | null)` (a getter miatt a layoutot csak Tabnál olvassa). A `shownOpener` a chatben marad: `onKeyDownCapture={isMobile ? undefined : (event) => tabPastPanel(event, () => shownOpener(opener.current))}`.
- [ ] A körözés javítása (előre Tab, ha a nyitó után nincs fókuszálható elem):
  ```ts
  const outside = tabStops(document).filter((element) => !panel.contains(element));
  const next = event.shiftKey
    ? opener
    : (outside.find((element) => opener.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) ?? outside[0] ?? opener);
  ```
  (a docblock frissül: „…or, with nothing after it, to the page's first stop, as the browser would after its own UI”).
- [ ] Az olvasópanel: `const panelTrigger = useRef<HTMLButtonElement>(null)`, `ref={panelTrigger}` a pill gombon, és a `SheetContent`-en `onKeyDownCapture={(event) => tabPastPanel(event, () => panelTrigger.current)}` (a panel sosem modális).
- [ ] Ellenőrzés: a `shell.test.ts` LinkChat-tesztjei zöldek; `npm run dup` nem jelez klónt; Playwright 1280 px-en a Review Focus 2. és 3. pontja.
- [ ] Commit: `fix: let tab leave the chat and the reader panel instead of looping`

### Task 3: A bejelentkezés-link megtartja a query stringet

**Files:** Modify `app/components/link-chat.tsx` (263. sor), `lib/test/next-stub.ts`.

- [ ] A teszt-csonk: `navigationStub`-ba `search: ""`, és `export const useSearchParams = () => new URLSearchParams(navigationStub.search);` (különben a `shell.test.ts` LinkChat-renderje nem töltődik be).
- [ ] A kód:
  ```tsx
  const search = useSearchParams().toString();
  // …
  loginHref={`/login?next=${encodeURIComponent(search ? `${pathname}?${search}` : pathname)}`}
  ```
  (a `safeNext` már megtartja a keresést, a proxy is `pathname + search`-öt küld).
- [ ] Ellenőrzés: `npm run build` (a `(app)` oldalak dinamikusak, a `useSearchParams` nem kér Suspense-t — ha mégis, ruling); a `chat-thread.test.ts` „every local reply says what happened…” zöld.
- [ ] Commit: `fix: keep the page's query string in the chat's sign-in link`

### Task 4: iPhone safe area

**Files:** Modify `app/layout.tsx` (14. sor), `app/components/digest-dashboard.tsx` (274. sor), `app/globals.css`.

- [ ] `export const viewport: Viewport = { themeColor: "#141414", viewportFit: "cover" };` — ettől élnek a meglévő `env(safe-area-inset-bottom)` értékek (`app-shell.tsx` 141, 212, 232; `link-chat.tsx` 274; `sign-in-sheet.tsx` 65; `undo-toast.tsx` 73).
- [ ] Az olvasópanel mobil lapja: `pb-[calc(1.25rem_+_env(safe-area-inset-bottom))]` a `p-5` mellé (telefonon).
- [ ] Fekvő mód: a `globals.css`-ben `body { padding-inline: env(safe-area-inset-left) env(safe-area-inset-right); }`, és az alsó sáv kapja ugyanezt (`px-[env(safe-area-inset-left)]` helyett a két oldal külön).
- [ ] Ellenőrzés: az előnézet 360 és 1280 px-en változatlan (a böngészőben az inset 0); **a tulajdonos valódi iPhone-on** nézi meg a kezdőképernyőről indított appot (a manifest `standalone`).
- [ ] Commit: `fix: honour the iphone safe areas`

### Task 5: Apróságok a chat mezőjén és az ÚJRA-üzeneteken

**Files:** Modify `app/components/link-chat.tsx` (295. sor), `lib/link-chat.ts` (312. és 333–337. sor), `.claude/docs/DESIGN.md` (378. sor); Test: `lib/link-chat.test.ts`.

- [ ] A chat mezője: `shadow-none` a `className`-be (a stock `Textarea` `shadow-xs`-e helyett); a DESIGN.md „Known exceptions” sora frissül.
- [ ] A teszt (a „a successful retry clears the refusals a previous failed retry left behind” mellé): `retry: inTurn(answer(401), offline, answer(401), answer(202))`, sorban `retry(1)`, `retry(2)`, `retry(3)`, `retry(4)` → `notices` `[]`, `retryNotices` `{ 2: { kind: "network" } }`. Bukik.
- [ ] A kód: egy segéd mindkét sikerághoz (a küldés 312., az ÚJRA 333–337. sora):
  ```ts
  /** A success proves the session works again: every entry's own "sign in again" goes; other refusals stay. */
  const withoutSignedOut = (notices: Record<number, ChatNotice>) =>
    Object.fromEntries(Object.entries(notices).filter(([, notice]) => notice.kind !== "signed_out"));
  // …
  set({ notices: [], retryNotices: withoutSignedOut(snapshot.retryNotices) });
  ```
- [ ] Futtatás: zöld (a „retry: starting it again clears that source's refusal, and only that one” is). Commit: `fix: clear every entry's sign-in notice after a successful send or retry`

### Task 6: Dokumentáció és az öt ellenőrzés

- [ ] CLAUDE.md → Link chat: a megtartott buborék, a közös `tabPastPanel` (az olvasópanel is), a `next` a keresést is viszi; DESIGN.md: a safe area és a fekvő mód.
- [ ] TODO.md: a parkolt tételek kipipálva; elavultként, okkal: „`md` és `2xl` között a panel eltakarja a chatet” (2a óta egyszerre csak egy réteg), „a sarokgomb kerete ink oldalon” (2a óta signal árnyék); kihagyva, okkal: „az sr-only előtag szóköze” (a csomópontok külön vannak), „a retry 403/404 szövege” (ma nem fordulhat elő).
- [ ] Az öt ellenőrzés; Playwright a Review Focus 1–4. pontjára; záró review (opus), egy javítási kör.
