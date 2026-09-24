import { Radar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Every page reads Supabase per request; on a slow phone this shows at once instead of a blank screen.
export default function Loading() {
  return (
    <main className="min-h-dvh bg-ink px-4 py-6 text-paper sm:px-10" aria-busy="true">
      <p role="status" className="flex items-center gap-2 font-mono text-xs text-paper/55">
        <Radar className="size-4 animate-pulse text-signal" /> LOADING / BETÖLTÉS…
      </p>
      <Skeleton className="mt-8 h-40 rounded-none bg-paper/10" />
      <div className="mt-6 space-y-4">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-28 rounded-none bg-paper/10" />
        ))}
      </div>
    </main>
  );
}
