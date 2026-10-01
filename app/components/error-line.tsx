import type { ReactNode } from "react";

/** A failed write, said so: ink on a signal strip (5.6:1, like the failed toast), for the light surfaces
 *  every caller sits on (R2 spec 2). The `role="alert"` region is always mounted, like every live region
 *  here (it must be in the tree before its text changes); the strip shows only while there is an error. */
export function ErrorLine({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div role="alert">
      {children ? <p className={`border-2 border-ink bg-signal px-3 py-2 font-mono text-xs text-ink ${className}`}>{children}</p> : null}
    </div>
  );
}
