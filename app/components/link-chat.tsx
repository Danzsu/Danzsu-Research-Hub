"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type RefObject } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { createLinkChat, httpTransport, memoryTransport } from "@/lib/link-chat";
import type { MySource } from "@/lib/my-sources";
import { ChatThread } from "./chat-thread";
import { useLanguage } from "./language-context";
import { TaiyakiIcon } from "./taiyaki-icon";
import { isUndoToast } from "./undo-toast";

const copy = {
  hu: {
    open: "Link bedobása",
    title: "TAIYAKI · LINK BEDOBÁSA",
    close: "Bezárás",
    input: "Link és megjegyzés",
    placeholder: "https://… és ha kell, egy megjegyzés",
    send: "Küldés",
  },
  en: {
    open: "Drop a link",
    title: "TAIYAKI · DROP A LINK",
    close: "Close",
    input: "Link and note",
    placeholder: "https://… and a note, if you like",
    send: "Send",
  },
};

/** The panel's id, for both buttons' aria-controls. */
export const CHAT_PANEL_ID = "taiyaki-panel";

/** The offline preview (app/dev/preview): the thread's fixtures and the fail=1 switch; nothing is sent. */
export type ChatPreview = { sources: MySource[]; failWrites: boolean };

/** The taiyaki that opens the panel: the desktop corner button and the mobile bar's centre slot. The caller
 *  places it and sets its resting shadow; `lift` (globals.css) brings it forward on hover and keyboard focus. */
export function TaiyakiButton({ open, onClick, className }: { open: boolean; onClick: (event: MouseEvent<HTMLButtonElement>) => void; className: string }) {
  const { language } = useLanguage();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copy[language].open}
      aria-expanded={open}
      aria-controls={CHAT_PANEL_ID}
      className={`focus-ring lift place-items-center border-2 border-ink bg-paper ${className}`}
    >
      <TaiyakiIcon className="size-10" />
    </button>
  );
}

/**
 * The link chat. Desktop: a non-modal panel above the corner button; only Esc and its close button
 * close it, so a link can be copied from the page behind. Mobile: a bottom Sheet. Focus goes to the
 * field on open and back to `opener` on close.
 */
export function LinkChat({ open, onOpenChange, opener, preview }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened the panel. */
  opener: RefObject<HTMLButtonElement | null>;
  preview?: ChatPreview;
}) {
  const { language } = useLanguage();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [chat] = useState(() =>
    createLinkChat(preview ? memoryTransport(preview.sources, preview.failWrites) : httpTransport, () => document.visibilityState === "visible"),
  );
  const snapshot = useSyncExternalStore(chat.subscribe, chat.getSnapshot, chat.getSnapshot);
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const t = copy[language];
  const lines = (snapshot.sources?.length ?? 0) + snapshot.notices.length + Number(snapshot.unreachable);

  useEffect(() => {
    if (!open) return;
    chat.open();
    return () => chat.close();
  }, [open, chat]);

  useEffect(() => {
    // `scroll-smooth` glides to the new message; globals.css makes it a jump under prefers-reduced-motion.
    const thread = scroller.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [lines, open]);

  async function send() {
    if (await chat.send(text)) setText("");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={isMobile}>
      <SheetContent
        id={CHAT_PANEL_ID}
        side="bottom"
        closeLabel={t.close}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
        onInteractOutside={(event) => {
          if (!isMobile || isUndoToast(event.target)) event.preventDefault();
        }}
        className="max-h-[75dvh] gap-0 border-t-2 border-ink bg-cream p-0 text-ink shadow-none md:inset-x-auto md:right-6 md:bottom-24 md:max-h-[70dvh] md:w-[360px] md:border-2 md:shadow-[6px_6px_0_var(--ink)]"
      >
        <SheetHeader className="flex-row items-center gap-2 bg-ink py-3 pr-14 pl-4">
          <TaiyakiIcon className="size-6 shrink-0" />
          <SheetTitle className="font-mono text-xs tracking-[0.14em] text-paper">{t.title}</SheetTitle>
        </SheetHeader>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto scroll-smooth p-4">
          <ChatThread
            language={language}
            snapshot={snapshot}
            loginHref={`/login?next=${encodeURIComponent(pathname)}`}
            onRetry={(sourceId) => void chat.retry(sourceId)}
            onOpenPost={isMobile ? () => onOpenChange(false) : undefined}
          />
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="flex items-end gap-2 border-t-2 border-ink bg-paper p-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] md:pb-3"
        >
          <Textarea
            ref={input}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter is a new line; an IME's Enter only confirms the word.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            // Read-only, not disabled, while sending: a disabled field would drop the focus.
            readOnly={snapshot.sending}
            aria-disabled={snapshot.sending}
            rows={1}
            aria-label={t.input}
            placeholder={t.placeholder}
            className="max-h-[30dvh] min-h-10 min-w-0 flex-1 resize-none overflow-y-auto border-2 border-ink bg-cream text-base focus-visible:border-signal focus-visible:ring-0"
          />
          <Button type="submit" variant="signal" size="icon-lg" disabled={snapshot.sending} aria-label={t.send}>
            <SendHorizontal />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
