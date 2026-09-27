"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { isSendKey } from "@/lib/keymap";
import { createLinkChat, httpTransport, memoryTransport } from "@/lib/link-chat";
import type { MySource } from "@/lib/my-sources";
import { busyClass, ChatThread } from "./chat-thread";
import { useLanguage } from "./language-context";
import { TaiyakiIcon } from "./taiyaki-icon";
import { isUndoToast } from "./undo-toast";

const copy = {
  hu: {
    open: "Link bedobása",
    title: "TAIYAKI · LINK BEDOBÁSA",
    close: "Bezárás",
    input: "Link és megjegyzés",
    placeholder: "https://… és egy megjegyzés",
    send: "Küldés",
  },
  en: {
    open: "Drop a link",
    title: "TAIYAKI · DROP A LINK",
    close: "Close",
    input: "Link and note",
    placeholder: "https://… and a note",
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

/** The button that opened the panel or, once it is hidden (the mobile slot, after the window widened
 *  past md), the taiyaki that is showing now: the one the focus can go back to. */
function shownOpener(opener: HTMLElement | null): HTMLElement | null {
  if (!opener || opener.getClientRects().length > 0) return opener;
  return [...document.querySelectorAll<HTMLElement>(`button[aria-controls="${CHAT_PANEL_ID}"]`)].find((button) => button.getClientRects().length > 0) ?? opener;
}

/**
 * Desktop: Radix's FocusScope loops Tab inside the panel even when it isn't modal, which would keep a
 * keyboard reader from the page behind it. Instead the panel sits right after its opener in tab order:
 * Shift+Tab off its first stop goes back to the opener, and Tab off its last goes on to the first stop
 * after the opener outside the panel, or back to the opener when there is none. The key is cancelled
 * only once the focus has really moved; a target that takes no focus leaves it to Radix, which wraps
 * it inside the panel.
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
  // The reader is at the thread's end (within 40px, as of their last scroll): only then does it follow
  // what grows, so someone who scrolled up to read stays where they are.
  const nearEnd = useRef(true);
  // The thread's scroller, for the pin after the reader's own send.
  const threadRef = useRef<HTMLDivElement | null>(null);
  const t = copy[language];

  useEffect(() => {
    if (!open) return;
    chat.open();
    return () => chat.close();
  }, [open, chat]);

  // Every size change keeps the end in view for a reader who is there: a new reply, one that grows in
  // place (pending → done), the field growing, the keyboard or the window shrinking the panel. The scroll
  // is instant, because a glide's own scroll events would read as the reader leaving the end.
  const followThread = useCallback((thread: HTMLDivElement | null) => {
    if (!thread) return;
    threadRef.current = thread;
    // Each open mounts a fresh thread, and it opens at the latest message.
    nearEnd.current = true;
    const observer = new ResizeObserver(() => {
      if (nearEnd.current) thread.scrollTop = thread.scrollHeight;
    });
    observer.observe(thread);
    // The wrapper, not the list: ChatThread's list is keyed on its first load, so it is replaced then.
    if (thread.firstElementChild) observer.observe(thread.firstElementChild);
    return () => {
      observer.disconnect();
      threadRef.current = null;
    };
  }, []);

  async function send() {
    const sent = await chat.send(text);
    // The reader's own send ends at its answer, even for a reader who scrolled up. Pinned directly once it
    // has settled, in the next frame, after React has committed it, rather than armed for the observer: a
    // send that changes no size (a deduped signed_out, a full thread whose dropped entry was as tall) would
    // leave that armed, and the next unrelated resize would pull the reader down.
    requestAnimationFrame(() => {
      if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
    });
    if (!sent) return;
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
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // Radix also runs this when the window crosses md with the panel open (the Dialog remounts, modal
          // or not): the panel keeps the focus then, and only a real close hands it back.
          if (!open) shownOpener(opener.current)?.focus();
        }}
        onInteractOutside={(event) => {
          if (!isMobile || isUndoToast(event.target)) event.preventDefault();
        }}
        onKeyDownCapture={isMobile ? undefined : (event) => tabPastPanel(event, shownOpener(opener.current))}
        // The house 160ms, not the stock Sheet's 500ms in and 300ms out.
        className="max-h-[75dvh] gap-0 data-[state=closed]:duration-160 data-[state=open]:duration-160 border-t-2 border-ink bg-cream p-0 text-ink shadow-none md:inset-x-auto md:right-6 md:bottom-24 md:max-h-[70dvh] md:w-[360px] md:border-2 md:shadow-[6px_6px_0_var(--ink)]"
      >
        <SheetHeader className="flex-row items-center gap-2 bg-ink py-3 pr-14 pl-4">
          <TaiyakiIcon className="size-6 shrink-0" />
          <SheetTitle className="font-mono text-xs tracking-[0.14em] text-paper">{t.title}</SheetTitle>
        </SheetHeader>
        <div
          ref={followThread}
          onScroll={(event) => {
            const thread = event.currentTarget;
            nearEnd.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight <= 40;
          }}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="p-4">
            <ChatThread
              language={language}
              snapshot={snapshot}
              loginHref={`/login?next=${encodeURIComponent(pathname)}`}
              onRetry={(sourceId) => void chat.retry(sourceId)}
              onOpenPost={isMobile ? () => onOpenChange(false) : undefined}
            />
          </div>
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
            // nowrap keeps the placeholder on one line: under field-sizing a wrapped one would make the empty field
            // a line taller than a one-line value. The copy is short enough to show whole from 330px up.
            className="max-h-[30dvh] min-h-10 min-w-0 flex-1 resize-none overflow-y-auto border-2 border-ink bg-cream text-base placeholder:whitespace-nowrap focus-visible:border-signal"
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
            className={busyClass}
          >
            <SendHorizontal />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
