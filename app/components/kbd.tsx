import type { ReactNode } from "react";

/** A key badge: the shortcuts help, the Keresés row's ⌘K and the account menu's ?. */
export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <kbd className={`border border-current/40 px-1.5 py-0.5 font-mono text-[11px] ${className}`}>{children}</kbd>;
}
