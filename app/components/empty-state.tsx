import type { LucideIcon } from "lucide-react";
import type { PropsWithChildren } from "react";

/** An empty view says what to do next (2a spec D8): one dashed box, its icon, a sentence, an optional link. */
export function EmptyState({ icon: Icon, tone, children }: PropsWithChildren<{ icon?: LucideIcon; tone: "ink" | "cream" }>) {
  const frame = tone === "ink" ? "border-paper/35 text-paper/60" : "border-ink/35 text-ink/55";
  return (
    <div className={`flex flex-col items-center gap-3 border-2 border-dashed p-10 text-center font-mono text-sm ${frame}`}>
      {Icon && <Icon className="size-6 text-signal" aria-hidden="true" />}
      <div className="max-w-[75ch]">{children}</div>
    </div>
  );
}
