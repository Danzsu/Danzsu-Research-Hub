import { ErrorLine } from "@/app/components/error-line";
import { StatusCard } from "@/app/components/page-header";
import { both, SignInForms } from "@/app/components/sign-in-forms";
import { safeNext } from "@/lib/supabase/server";

// Before sign-in there is no language yet, so every line shows both, "magyar / English".
const copy = {
  sent: { hu: "Ha ez a cím meghívott, a belépő link úton van — nézd meg a leveleidet.", en: "If this address is invited, a sign-in link is on its way." },
  errors: {
    "1": { hu: "A link lejárt vagy érvénytelen.", en: "The link expired or is invalid." },
    google: { hu: "A Google-belépés nem sikerült, próbáld újra.", en: "Google sign-in failed, try again." },
    not_invited: { hu: "Ez a Google-fiók nincs meghívva.", en: "This Google account isn't invited." },
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; sent?: string; error?: string }>;
}) {
  const { next, sent, error } = await searchParams;
  const target = safeNext(next);
  // An unknown reason is still a failed sign-in: the link message, as before Google.
  const failure = error ? (copy.errors[error as keyof typeof copy.errors] ?? copy.errors["1"]) : null;

  return (
    <StatusCard brand eyebrow="INVITE-ONLY / CSAK MEGHÍVÓVAL" title="SIGN IN">
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
    </StatusCard>
  );
}
