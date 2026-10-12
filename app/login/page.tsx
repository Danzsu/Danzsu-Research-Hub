import { ErrorLine } from "@/app/components/error-line";
import { PublicPage } from "@/app/components/public-page";
import { both, SignInCard, SignInForms } from "@/app/components/sign-in-forms";
import { getLanguage } from "@/lib/language";
import type { LoginError } from "@/lib/pipeline/util";
import { safeNext } from "@/lib/supabase/server";

// Before sign-in there is no language yet, so every line shows both, "magyar / English".
const copy = {
  sent: { hu: "Ha ez a cím meghívott, a belépő link úton van — nézd meg a leveleidet.", en: "If this address is invited, a sign-in link is on its way." },
  errors: {
    "1": { hu: "A link lejárt vagy érvénytelen.", en: "The link expired or is invalid." },
    google: { hu: "A Google-belépés nem sikerült, próbáld újra.", en: "Google sign-in failed, try again." },
    not_invited: { hu: "Ez a Google-fiók nincs meghívva.", en: "This Google account isn't invited." },
  } satisfies Record<LoginError, { hu: string; en: string }>,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; sent?: string; error?: string }>;
}) {
  const { next, sent, error } = await searchParams;
  const target = safeNext(next);
  // An unknown reason is still a failed sign-in: the link message, as before Google. Own keys only, so a
  // hand-made `?error=constructor` can't reach Object.prototype.
  const failure = error ? copy.errors[Object.hasOwn(copy.errors, error) ? (error as LoginError) : "1"] : null;

  return (
    <PublicPage language={await getLanguage()} signIn="none">
      {/* The landing page's frame (2a spec D6); StatusCard stays for the error and not-found pages. */}
      <main className="mx-auto max-w-[1600px] px-4 py-12 sm:px-10">
        <SignInCard>
          <p className="font-mono text-xs tracking-[0.2em] text-signal">INVITE-ONLY / CSAK MEGHÍVÓVAL</p>
          <h1 className="mt-2 font-display text-4xl leading-[0.9] tracking-[-0.04em] sm:text-5xl">
            SIGN IN<span className="text-signal">{"//"}</span>
          </h1>
          {sent ? (
            <p className="mt-7 border-l-4 border-signal pl-4 text-sm leading-6">
              {copy.sent.hu}
              <br />
              <span className="text-ink/60">{copy.sent.en}</span>
            </p>
          ) : (
            <>
              <ErrorLine className="mt-7">{failure && both(failure)}</ErrorLine>
              <SignInForms next={target} />
            </>
          )}
        </SignInCard>
      </main>
    </PublicPage>
  );
}
