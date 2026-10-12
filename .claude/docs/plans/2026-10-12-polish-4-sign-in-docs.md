# Apróságok 4 — belépés és dokumentáció

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Google-belépés záró reviewjának elhalasztott pontjai: egy kézzel gyártott hibakód ne mutasson „undefined / undefined”-et, a belépő oldal szövegei copy-objektumban legyenek, és a SECURITY.md meg a README ne ígérjen többet a `+radar` aliasról, mint ami igaz.

**Architecture:** A hibakódok egy közös `LoginError` típust kapnak a `lib/pipeline/util.ts`-ben, amit a callback és a belépő oldal is használ. A belépő szövegek a `sign-in-forms.tsx` copy-objektumába kerülnek (ez nem kliens-modul, ezért szerveroldali oldal is importálhatja), és a lap (`sign-in-sheet.tsx`) is innen veszi őket.

**Tech Stack:** Next.js 16, `node --test`.

**Spec:** a Google-belépés specje és a TODO.md → Halasztott apróságok → Google-belépés. Felmérés: 2026-10-12, `d7432f7`.

**Mód:** rövid terv, natív végrehajtás, egy záró review. Branch: `polish-sign-in`, a `main`-ről.

## Global Constraints

- Az auth-folyamat viselkedése nem változik (csak a hibaszöveg-keresés és a szövegek helye); a SECURITY.md minden állítása igaz marad.
- Az öt ellenőrzés; Conventional Commits, explicit pathspec, push nincs.

## Review Focus

1. `?error=constructor`, `toString`, `__proto__` → a „link lejárt” szöveg, nem „undefined”.
2. A `/login`, az `/about` és a felcsúszó lap ugyanazt a címet és eyebrow-t mutatja, mindkét nyelven.
3. A SECURITY.md alias-mondata csak a Gmail/Workspace esetre ígér védelmet.

---

### Task 1: A hibakód nem olvashat az `Object.prototype`-ból

**Files:** Modify `lib/pipeline/util.ts` (309. sor, `loginWithError`), `app/login/page.tsx` (25. sor); Test: `app/login/page.test.ts`.

- [ ] A teszt: a „the login page says why a sign-in failed…” teszt `cases` listájába `["constructor", expired], ["toString", expired], ["__proto__", expired]`. Bukik („undefined / undefined”).
- [ ] A kód:
  ```ts
  // lib/pipeline/util.ts
  /** Why a sign-in round trip was refused (`/login?error=`): the callback writes it, the login page explains it. */
  export type LoginError = "1" | "google" | "not_invited";
  // loginWithError(origin: string, reason: LoginError, next: string | null)
  ```
  ```tsx
  // app/login/page.tsx
  import type { LoginError } from "@/lib/pipeline/util";
  // errors: { … } satisfies Record<LoginError, { hu: string; en: string }>,
  const failure = error ? copy.errors[Object.hasOwn(copy.errors, error) ? (error as LoginError) : "1"] : null;
  ```
- [ ] Futtatás: zöld. Próba: a `Object.hasOwn` feltétel törlése → bukik. Commit: `fix: show the expired-link message for any unknown sign-in error code`

### Task 2: A belépő szövegek copy-objektumban

**Files:** Modify `app/components/sign-in-forms.tsx` (a `copy` exportja és bővítése, 50. sor), `app/login/page.tsx` (32., 34. sor), `app/about/page.tsx` (96. sor), `app/components/sign-in-sheet.tsx` (12., 18. sor); Test: `app/login/page.test.ts`, `app/about/page.test.ts`.

- [ ] A teszt: a `/login` `h1`-e `"BELÉPÉS//"` (a nyelvi csonk `hu`); a `/about` eyebrow-ja változatlanul `INVITE-ONLY / CSAK MEGHÍVÓVAL`. Bukik (ma `SIGN IN//`).
- [ ] A kód: a `sign-in-forms.tsx` `copy`-ja `signInCopy` néven exportálva, és bővül:
  ```ts
  title: { hu: "BELÉPÉS", en: "SIGN IN" },
  email: { hu: "E-MAIL", en: "EMAIL" },
  // The house eyebrows read EN / HU (both() prints HU / EN), so this one stays a plain string.
  inviteOnly: "INVITE-ONLY / CSAK MEGHÍVÓVAL",
  ```
  A címke `{both(signInCopy.email)}`; a `/login` `{signInCopy.inviteOnly}`-t és `<LocalizedText value={signInCopy.title} />`-t használ (a `PublicPage` adja a `LanguageProvider`-t); az `/about` `eyebrow={signInCopy.inviteOnly}`; a lap a saját `title` sorait elhagyja, és `signInCopy.title[language]`-t ír.
- [ ] Futtatás: zöld; `npm run dup` nem jelez klónt. Commit: `fix: keep the sign-in title, eyebrow and email label in one copy object`

### Task 3: Az alias-mondatok igazak legyenek

**Files:** Modify `SECURITY.md` (38. sor), `README.md` (128. sor).

- [ ] SECURITY.md: „The mirror's system account is a `+radar` alias of a Gmail or Google Workspace address, which can never be a Google account's own address, so Google sign-in can't reach it. An alias of any other address can be registered as a Google account by whoever holds that mailbox, now or later, so there it gives no such guarantee.”
- [ ] README.md: „Use an address you control: a `+radar` alias of your Gmail or Google Workspace address keeps Google sign-in from reaching it (SECURITY.md → Google sign-in); an alias of any other address works for the mirror but not as that guard. Give it a long random password, and never sign in with it.”
- [ ] Commit: `docs: say the +radar alias only keeps google out for a gmail or workspace address`

### Task 4: A magic link és a Google-belépés (a tulajdonos lépése)

Egy elkezdett Google-belépés érvényteleníti a függőben lévő, régi típusú (`?code=`) magic linket. A token-hash sablonok (CLAUDE.md → Auth) ezt megszüntetik, de a Supabase a sablonokat **csak saját SMTP-vel** engedi szerkeszteni (TODO.md → A. Beállítás → 1. Supabase). Kód nem kell hozzá.

- [ ] TODO.md: a pont a „Saját SMTP” teendő mellé kerül, kereszthivatkozással; a Halasztott apróságok közül kipipálva, ezzel az okkal.

### Task 5: Az öt ellenőrzés és a záró review

- [ ] TODO.md: a Google-belépés apróságai kipipálva.
- [ ] Az öt ellenőrzés; záró review (opus), egy javítási kör.
