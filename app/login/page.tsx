import { StatusCard } from "@/app/components/page-header";
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
    <StatusCard brand eyebrow="INVITE-ONLY / CSAK MEGHÍVÓVAL" title="SIGN IN">
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
              className="min-h-10 border-2 border-ink bg-paper focus-visible:border-signal"
            />
          </div>
          <Button type="submit" variant="ink" className="min-h-10 w-full">
            Belépő link küldése / Send link
          </Button>
          {error && (
            <p className="font-mono text-xs text-signal">A link lejárt vagy érvénytelen. / The link expired or is invalid.</p>
          )}
        </form>
      )}
    </StatusCard>
  );
}
