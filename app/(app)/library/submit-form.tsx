"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useLanguage } from "@/app/components/language-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function SubmitForm() {
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
      const response = await fetch("/api/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, note }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      const known = data.error === "invalid_url" || data.error === "already_submitted" ? data.error : "error";
      setStatus(response.ok ? "ok" : known);
      if (response.ok) {
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
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          type="url"
          required
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={t.urlPlaceholder}
          aria-label={t.url}
          className="min-h-10 flex-1 border-2 border-ink bg-cream focus-visible:border-signal"
        />
        <Button type="submit" variant="signal" className="min-h-10" disabled={busy}>
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
