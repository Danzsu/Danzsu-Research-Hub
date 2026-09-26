"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useLanguage } from "@/app/components/language-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { httpTransport, memoryTransport, type ChatTransport } from "@/lib/link-chat";

const copy = {
  hu: {
    url: "Link",
    note: "Megjegyzés",
    urlPlaceholder: "https://youtube.com/watch?v=… vagy cikk link",
    notePlaceholder: "Megjegyzés (opcionális): mire figyeljen az összefoglaló?",
    submit: "Beküldés",
    ok: "Beküldve — pár perc múlva megjelenik.",
    invalid_url: "Ez nem érvényes http(s) link.",
    already_submitted: "Ezt a linket már beküldték.",
    error: "Nem sikerült beküldeni, próbáld újra.",
  },
  en: {
    url: "Link",
    note: "Note",
    urlPlaceholder: "https://youtube.com/watch?v=… or an article link",
    notePlaceholder: "Note (optional): what should the summary focus on?",
    submit: "Submit",
    ok: "Submitted — it will appear in a few minutes.",
    invalid_url: "Not a valid http(s) link.",
    already_submitted: "This link was already submitted.",
    error: "Submission failed, try again.",
  },
} as const;

type Status = "ok" | "invalid_url" | "already_submitted" | "error";
type SubmitResult = { ok: boolean; error?: string };

/** The one submit path, shared by the real route and the offline preview (`memoryTransport([], …)`,
 *  fresh each call — nothing here tracks a thread yet): an empty note reaches either transport as
 *  `null`, same as the route's own `String(body.note ?? "").trim() … || null` would turn it into. */
async function submitVia(transport: ChatTransport, url: string, note: string): Promise<SubmitResult> {
  const { status, body } = await transport.submit(url, note || null);
  return { ok: status === 202, error: typeof body.error === "string" ? body.error : undefined };
}

export function SubmitForm({ preview }: { preview?: { failWrites: boolean } }) {
  const { language } = useLanguage();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const t = copy[language];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await submitVia(preview ? memoryTransport([], preview.failWrites) : httpTransport, url, note);
      const known = result.error === "invalid_url" || result.error === "already_submitted" ? result.error : "error";
      setStatus(result.ok ? "ok" : known);
      if (result.ok) {
        setUrl("");
        setNote("");
        router.refresh();
      }
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="submit" onSubmit={submit} className="border-2 border-ink bg-paper p-5 shadow-[6px_6px_0_var(--ink)]">
      <p className="font-mono text-xs tracking-[0.14em] text-signal">BEKÜLDÉS / SUBMIT</p>
      {/* @lg (not sm:), keyed to the hero's @container: in the narrow full-sidebar column this must
          wrap on the column's own width, not the viewport (page-header.tsx). */}
      <div className="mt-3 flex flex-col gap-2 @lg:flex-row">
        <Input
          type="url"
          required
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={t.urlPlaceholder}
          aria-label={t.url}
          className="min-h-10 flex-1 border-2 border-ink bg-cream focus-visible:border-signal"
        />
        <Button type="submit" variant="signal" className="min-h-10 shrink @lg:shrink-0" disabled={busy}>
          <Plus /> {busy ? "…" : t.submit}
        </Button>
      </div>
      <Input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        placeholder={t.notePlaceholder}
        aria-label={t.note}
        className="mt-2 min-h-10 border-ink/40 bg-cream focus-visible:border-signal"
      />
      {status && <p className="mt-3 font-mono text-xs text-ink/70" role="status">{t[status]}</p>}
    </form>
  );
}
