"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Language } from "@/data/digest-types";
import { toThread, type ChatEntry, type ChatNotice, type ChatSnapshot } from "@/lib/link-chat";
import { SOURCE_KIND_LABELS } from "@/lib/source-kinds";
import { TaiyakiIcon } from "./taiyaki-icon";

const copy = {
  hu: {
    greeting: "Dobj be egy linket! Ha akarod, írd mellé, mire figyeljek.",
    // sr-only speaker prefixes (I2): a screen reader announces who is "talking" in each bubble.
    me: "Te:",
    taiyaki: "Taiyaki:",
    received: "Megkaptam,",
    processing: "FELDOLGOZÁS…",
    loading: "BETÖLTÉS…",
    done: "KÉSZ · MEGNYITÁS →",
    failed: "Nem sikerült feldolgozni.",
    retry: "ÚJRA",
    retrying: "ÚJRA…",
    open: "MEGNYITÁS →",
    no_link: "Egyelőre csak linket tudok fogadni.",
    more_links: "Egyszerre egy linket tudok fogadni, az elsőt küldtem be.",
    invalid_url: "Ezt nem tudom megnyitni: csak nyilvános http(s) linket fogadok.",
    already_submitted: "Ezt már beküldte valaki.",
    signed_out: "Lejárt a belépésed.",
    signIn: "BELÉPÉS →",
    network: "Nem ment át, próbáld újra.",
    unreachable: "Most nem érem el a beküldéseidet.",
  },
  en: {
    greeting: "Drop in a link! If you like, add what I should look out for.",
    me: "You:",
    taiyaki: "Taiyaki:",
    received: "Got it:",
    processing: "PROCESSING…",
    loading: "LOADING…",
    done: "DONE · OPEN →",
    failed: "I couldn't process it.",
    retry: "RETRY",
    retrying: "RETRY…",
    open: "OPEN →",
    no_link: "For now I can only take links.",
    more_links: "I take one link at a time, so I sent in the first one.",
    invalid_url: "I can't open that: I only take public http(s) links.",
    already_submitted: "Someone already sent this in.",
    signed_out: "Your sign-in has expired.",
    signIn: "SIGN IN →",
    network: "That didn't go through, try again.",
    unreachable: "I can't reach your submissions right now.",
  },
};

const bubble = "max-w-[85%] border-2 border-ink px-3 py-2 text-sm leading-6 [overflow-wrap:anywhere]";
// Small signal text on paper is under 3:1 (DESIGN.md → Colors), so the thread's small labels and
// links are ink, and the signal goes into their underline.
const signalUnderline = "text-ink underline decoration-signal decoration-2 underline-offset-4";
const microLabel = "font-mono text-[11px] tracking-[0.14em]";
const action = `focus-ring inline-flex min-h-10 items-center ${microLabel} ${signalUnderline} hover:decoration-ink`;

function Taiyaki({ language, children }: { language: Language; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <TaiyakiIcon className="mt-1 size-7 shrink-0" />
      <div className={`${bubble} bg-paper shadow-[3px_3px_0_var(--ink)]`}>
        <span className="sr-only">{copy[language].taiyaki}</span>
        {children}
      </div>
    </div>
  );
}

function Mine({ entry, language }: { entry: ChatEntry; language: Language }) {
  return (
    <div className={`${bubble} ml-auto w-fit bg-ink text-paper shadow-[3px_3px_0_var(--signal)]`}>
      <span className="sr-only">{copy[language].me}</span>
      {entry.href ? (
        <a href={entry.href} target="_blank" rel="noreferrer" className="focus-ring underline">
          {entry.url}
          <ExternalLink aria-hidden="true" className="ml-1 inline size-4 align-text-bottom" />
        </a>
      ) : (
        entry.url
      )}
      {entry.note && <p className="mt-1 text-paper/70">{entry.note}</p>}
    </div>
  );
}

type ThreadActions = {
  language: Language;
  /** `/login?next=<this page>`, for the "signed out" reply. */
  loginHref: string;
  onRetry: (sourceId: number) => void;
  /** Runs when a post link is followed: the mobile sheet closes itself with it. */
  onOpenPost?: () => void;
};

function Reply({ entry, retrying, language, onRetry, onOpenPost }: ThreadActions & { entry: ChatEntry; retrying: boolean }) {
  const t = copy[language];
  const { reply } = entry;
  if (reply.state === "pending") {
    return (
      <>
        <p>
          {t.received} <em>{SOURCE_KIND_LABELS[reply.kind][language]}</em>.
        </p>
        <p className={`mt-1 flex items-center gap-2 ${microLabel}`}>
          <span className="live-pulse shrink-0" />
          <span className="text-ink/70">{t.processing}</span>
        </p>
      </>
    );
  }
  if (reply.state === "done") {
    return (
      <>
        <p className="font-bold">{reply.title[language]}</p>
        <Link href={`/library/${reply.postId}`} onClick={onOpenPost} className={action}>
          {t.done}
        </Link>
      </>
    );
  }
  return (
    <>
      <p>{t.failed}</p>
      {reply.error && <p className="mt-1 font-mono text-[11px] leading-4 text-ink/70">{reply.error}</p>}
      <Button
        variant="signal"
        className="mt-2 min-h-10 aria-disabled:pointer-events-none aria-disabled:opacity-50"
        aria-disabled={retrying}
        onClick={() => onRetry(entry.id)}
      >
        {retrying ? t.retrying : t.retry}
      </Button>
    </>
  );
}

function NoticeText({ notice, language, loginHref, onOpenPost }: ThreadActions & { notice: ChatNotice }) {
  const t = copy[language];
  if (notice.kind === "already_submitted") {
    return (
      <>
        <p>{t.already_submitted}</p>
        {notice.postId !== null && (
          <Link href={`/library/${notice.postId}`} onClick={onOpenPost} className={action}>
            {t.open}
          </Link>
        )}
      </>
    );
  }
  if (notice.kind === "signed_out") {
    return (
      <>
        <p>{t.signed_out}</p>
        <a href={loginHref} className={action}>
          {t.signIn}
        </a>
      </>
    );
  }
  return <p>{t[notice.kind]}</p>;
}

/** The thread: the greeting, the reader's own submissions (oldest first) with the taiyaki's replies, then the local replies. */
export function ChatThread({ snapshot, ...actions }: ThreadActions & { snapshot: Pick<ChatSnapshot, "sources" | "notices" | "unreachable" | "retrying"> }) {
  const { language } = actions;
  const t = copy[language];
  // Nothing has answered yet, and no local reply or the unreachable line already covers it: one
  // "loading" taiyaki, not the whole region flickering line by line as the first answer lands.
  const stillLoading = snapshot.sources === null && !snapshot.unreachable && snapshot.notices.length === 0;
  return (
    // Keyed on the loaded state (I2): the first real list mounts as a fresh live region instead of
    // being announced entry by entry against the empty one it replaces.
    <ol key={snapshot.sources === null ? "loading" : "loaded"} aria-live="polite" className="space-y-4">
      <li>
        <Taiyaki language={language}>
          <p>{t.greeting}</p>
        </Taiyaki>
      </li>
      {stillLoading && (
        <li>
          <Taiyaki language={language}>
            <p className={`flex items-center gap-2 ${microLabel}`}>
              <span className="live-pulse shrink-0" />
              <span className="text-ink/70">{t.loading}</span>
            </p>
          </Taiyaki>
        </li>
      )}
      {toThread(snapshot.sources ?? []).map((entry) => (
        <li key={entry.id} className="space-y-2">
          <Mine entry={entry} language={language} />
          <Taiyaki language={language}>
            <Reply entry={entry} retrying={snapshot.retrying.includes(entry.id)} {...actions} />
          </Taiyaki>
        </li>
      ))}
      {snapshot.notices.map((notice, index) => (
        // Append-only while the panel is open, so the position is a stable key.
        <li key={index}>
          <Taiyaki language={language}>
            <NoticeText notice={notice} {...actions} />
          </Taiyaki>
        </li>
      ))}
      {snapshot.unreachable && (
        <li>
          <Taiyaki language={language}>
            <p>{t.unreachable}</p>
          </Taiyaki>
        </li>
      )}
    </ol>
  );
}
