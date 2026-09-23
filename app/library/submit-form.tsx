"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const messages: Record<string, string> = {
  ok: "Beküldve — pár perc múlva megjelenik. / Submitted — it will appear in a few minutes.",
  invalid_url: "Ez nem érvényes http(s) link. / Not a valid http(s) link.",
  already_submitted: "Ezt a linket már beküldték. / This link was already submitted.",
  error: "Nem sikerült beküldeni, próbáld újra. / Submission failed, try again.",
};

export function SubmitForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      setStatus(response.ok ? "ok" : (data.error ?? "error"));
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
    <form onSubmit={submit} className="border-2 border-ink bg-paper p-5 shadow-[6px_6px_0_#141414]">
      <p className="font-mono text-xs tracking-[0.14em] text-signal">BEKÜLDÉS / SUBMIT</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          required
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://youtube.com/watch?v=… vagy cikk link"
          aria-label="URL"
          className="min-w-0 flex-1 rounded-none border-2 border-ink bg-cream px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-signal"
        />
        <Button type="submit" disabled={busy} className="rounded-none border-2 border-ink bg-signal font-mono text-xs text-ink hover:bg-ink hover:text-paper">
          <Plus /> {busy ? "…" : "Beküldés"}
        </Button>
      </div>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        placeholder="Megjegyzés (opcionális): mire figyeljen az összefoglaló?"
        aria-label="Note"
        className="mt-2 w-full rounded-none border border-ink/40 bg-cream px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-signal"
      />
      {status && <p className="mt-3 font-mono text-xs text-ink/70" role="status">{messages[status] ?? messages.error}</p>}
    </form>
  );
}
