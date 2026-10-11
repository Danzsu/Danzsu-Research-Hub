import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Before sign-in there is no language yet, so every line shows both, "magyar / English".
const copy = {
  google: { hu: "Belépés Google-lel", en: "Continue with Google" },
  or: { hu: "vagy", en: "or" },
  send: { hu: "Belépő link küldése", en: "Send link" },
};

export const both = ({ hu, en }: { hu: string; en: string }) => `${hu} / ${en}`;

/** Google's "G", unchanged as its brand rules ask: the one place its four colours appear (DESIGN.md → Colors). */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-4">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** The cream card the sign-in forms sit in, on /login and on the landing page: a 2px ink frame with the signal
 *  hard shadow, at most 28rem wide. */
export function SignInCard({ children }: { children: ReactNode }) {
  return <div className="max-w-md border-2 border-ink bg-cream p-7 text-ink shadow-[8px_8px_0_var(--signal)] sm:p-9">{children}</div>;
}

/** The two ways in, Google first and the email link second, both carrying the safe `next` (/login and /about). */
export function SignInForms({ next }: { next: string }) {
  return (
    <>
      <form action="/auth/google" method="post" className="mt-7">
        <input type="hidden" name="next" value={next} />
        {/* Wraps on a narrow phone: the two-language label is wider than the 360px card. */}
        <Button type="submit" variant="brutal" className="h-auto min-h-10 w-full whitespace-normal py-2">
          <GoogleMark /> {both(copy.google)}
        </Button>
      </form>
      <p className="my-5 flex items-center gap-3 font-mono text-[11px] text-ink/60 before:h-px before:flex-1 before:bg-ink/20 after:h-px after:flex-1 after:bg-ink/20">
        {both(copy.or)}
      </p>
      <form action="/auth/login" method="post" className="space-y-4">
        <input type="hidden" name="next" value={next} />
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
          {both(copy.send)}
        </Button>
      </form>
    </>
  );
}
