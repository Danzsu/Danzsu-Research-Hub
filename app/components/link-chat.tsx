"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { isSendKey } from "@/lib/keymap";
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

/** The offline preview (app/dev/preview): the thread's fixtures and the fail=1 and slow=1 switches; nothing is sent. */
export type ChatPreview = { sources: MySource[]; failWrites: boolean; delayMs?: number };

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

/** Where Tab can land, as the browser sees it, less Radix's invisible focus guards at either end of <body>. */
function tabStops(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]:not([data-radix-focus-guard])")].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility === "visible" &&
      !element.closest("[inert]"),
  );
}

/**
 * Desktop: Radix's FocusScope loops Tab inside the panel even when it isn't modal, which would keep a
 * keyboard reader from the page behind it. Instead the panel sits right after its opener in tab order:
 * Shift+Tab off its first stop goes back to the opener, and Tab off its last goes on to the first stop
 * after the opener outside the panel, or back to the opener when there is none. The key is cancelled
 * only once the focus has really moved: an opener hidden since (the mobile slot, after the window
 * widened past md) takes no focus, and the key is then left to Radix, which wraps it inside the panel.
 */
function tabPastPanel(event: KeyboardEvent<HTMLDivElement>, opener: HTMLElement | null) {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey || !opener) return;
  const panel = event.currentTarget;
  const stops = tabStops(panel);
  if (event.target !== (event.shiftKey ? stops[0] : stops.at(-1))) return;
  const next = event.shiftKey
    ? opener
    : (tabStops(document).find((element) => !panel.contains(element) && opener.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) ?? opener);
  next.focus();
  if (document.activeElement === next) event.preventDefault();
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
    createLinkChat(
      preview ? memoryTransport(preview.sources, preview.failWrites, preview.delayMs) : httpTransport,
      () => document.visibilityState === "visible",
    ),
  );
  const snapshot = useSyncExternalStore(chat.subscribe, chat.getSnapshot, chat.getSnapshot);
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // The thread follows a change only for a reader at its end (within 40px, as of their last scroll) or
  // one whose own send or retry is on its way: someone who scrolled up to read stays where they are.
  const nearEnd = useRef(true);
  const ownActions = useRef(0);
  // Until the first list lands, a change jumps like the open does; after it, a new message glides.
  const glides = useRef(false);
  const t = copy[language];
  // The newest id, not the count: the thread is capped at MINE_LIMIT, so a new send can leave the count as it was.
  const newest = snapshot.sources?.[0]?.id;
  const loaded = snapshot.sources !== null;

  useEffect(() => {
    if (!open) return;
    chat.open();
    return () => chat.close();
  }, [open, chat]);

  useEffect(() => {
    const thread = scroller.current;
    if (thread && (nearEnd.current || ownActions.current > 0)) {
      // "auto" follows `scroll-smooth`, which globals.css turns into a jump under prefers-reduced-motion.
      thread.scrollTo({ top: thread.scrollHeight, behavior: glides.current ? "auto" : "instant" });
    }
    glides.current = loaded;
  }, [newest, snapshot.notices.length, snapshot.unreachable, loaded]);

  async function byReader<T>(action: () => Promise<T>): Promise<T> {
    ownActions.current++;
    try {
      return await action();
    } finally {
      ownActions.current--;
    }
  }

  async function send() {
    if (!(await byReader(() => chat.send(text)))) return;
    setText("");
    // Send pressed from the keyboard has the focus; the next link goes in the field.
    input.current?.focus();
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
          // The portalled thread only mounts now, after the effect above ran: open at the latest message.
          nearEnd.current = true;
          scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "instant" });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
        onInteractOutside={(event) => {
          if (!isMobile || isUndoToast(event.target)) event.preventDefault();
        }}
        onKeyDownCapture={isMobile ? undefined : (event) => tabPastPanel(event, opener.current)}
        // The house 160ms, not the stock Sheet's 500ms in and 300ms out.
        className="max-h-[75dvh] gap-0 data-[state=closed]:duration-160 data-[state=open]:duration-160 border-t-2 border-ink bg-cream p-0 text-ink shadow-none md:inset-x-auto md:right-6 md:bottom-24 md:max-h-[70dvh] md:w-[360px] md:border-2 md:shadow-[6px_6px_0_var(--ink)]"
      >
        <SheetHeader className="flex-row items-center gap-2 bg-ink py-3 pr-14 pl-4">
          <TaiyakiIcon className="size-6 shrink-0" />
          <SheetTitle className="font-mono text-xs tracking-[0.14em] text-paper">{t.title}</SheetTitle>
        </SheetHeader>
        <div
          ref={scroller}
          onScroll={(event) => {
            const thread = event.currentTarget;
            nearEnd.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight <= 40;
          }}
          className="min-h-0 flex-1 overflow-y-auto scroll-smooth p-4"
        >
          <ChatThread
            language={language}
            snapshot={snapshot}
            loginHref={`/login?next=${encodeURIComponent(pathname)}`}
            onRetry={(sourceId) => void byReader(() => chat.retry(sourceId))}
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
              if (isSendKey(event.nativeEvent)) {
                event.preventDefault();
                void send();
              }
            }}
            enterKeyHint="send"
            // Read-only, not disabled, while sending: a disabled field would drop the focus.
            readOnly={snapshot.sending}
            aria-disabled={snapshot.sending}
            rows={1}
            aria-label={t.input}
            placeholder={t.placeholder}
            className="max-h-[30dvh] min-h-10 min-w-0 flex-1 resize-none overflow-y-auto border-2 border-ink bg-cream text-base focus-visible:border-signal"
          />
          {/* aria-disabled, not disabled, while sending: a disabled button would drop the focus. send() ignores a second press.
              A tap or click leaves the focus in the field, so a phone keyboard doesn't drop and come back. */}
          <Button
            type="submit"
            variant="signal"
            size="icon-lg"
            aria-disabled={snapshot.sending}
            aria-label={t.send}
            onMouseDown={(event) => event.preventDefault()}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            <SendHorizontal />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
