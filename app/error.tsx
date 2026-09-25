"use client";

import { StatusCard } from "@/app/components/page-header";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <StatusCard eyebrow="ERROR / HIBA" title="SIGNAL LOST">
      <p className="mt-5 text-sm leading-6">
        Valami elromlott betöltés közben.
        <br />
        <span className="text-ink/60">Something broke while loading.</span>
      </p>
      <Button type="button" variant="ink" className="mt-6 min-h-10 w-full" onClick={reset}>
        Újra / Retry
      </Button>
    </StatusCard>
  );
}
