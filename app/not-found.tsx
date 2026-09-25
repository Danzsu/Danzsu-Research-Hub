import Link from "next/link";
import { StatusCard } from "@/app/components/page-header";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <StatusCard eyebrow="404" title="NO SIGNAL">
      <p className="mt-5 text-sm leading-6">
        Ez az oldal nem létezik.
        <br />
        <span className="text-ink/60">This page does not exist.</span>
      </p>
      <Button asChild variant="ink" className="mt-6 min-h-10 w-full">
        <Link href="/">← LIVE RADAR</Link>
      </Button>
    </StatusCard>
  );
}
