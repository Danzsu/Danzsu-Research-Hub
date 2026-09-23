import { Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNext } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; sent?: string; error?: string }>;
}) {
  const { next, sent, error } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-ink px-5 text-paper">
      <section className="w-full max-w-md border-2 border-ink bg-cream p-7 text-ink shadow-[8px_8px_0_var(--signal)] sm:p-9">
        <div className="flex items-center gap-2 font-display text-2xl">
          <Radar className="text-signal" /> NEON RADAR
        </div>
        <p className="mt-6 font-mono text-xs tracking-[0.2em] text-signal">INVITE-ONLY / CSAK MEGHÍVÓVAL</p>
        <h1 className="mt-2 font-display text-5xl leading-[0.85] tracking-[-0.05em]">
          SIGN IN<span className="text-signal">{"//"}</span>
        </h1>

        {sent ? (
          <p className="mt-7 border-l-4 border-signal pl-4 text-sm leading-6">
            Ha ez a cím meghívott, a belépő link úton van — nézd meg a leveleidet.
            <br />
            <span className="text-ink/60">If this address is invited, a sign-in link is on its way.</span>
          </p>
        ) : (
          <form action="/auth/login" method="post" className="mt-7 space-y-4">
            <input type="hidden" name="next" value={safeNext(next)} />
            <div className="space-y-2">
              <Label htmlFor="email" className="font-mono text-xs">EMAIL</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="rounded-none border-2 border-ink bg-paper focus-visible:border-signal"
              />
            </div>
            <Button type="submit" className="w-full rounded-none bg-ink font-mono text-xs text-paper hover:bg-signal hover:text-ink">
              Belépő link küldése / Send link
            </Button>
            {error && (
              <p className="font-mono text-xs text-signal">A link lejárt vagy érvénytelen. / The link expired or is invalid.</p>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
