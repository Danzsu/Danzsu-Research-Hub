import type { ReactNode } from "react";
import { AppShell } from "@/app/components/app-shell";
import { getLanguage, getNavMode } from "@/lib/language";
import { getViewer } from "@/lib/supabase/server";

// Pages still check the session themselves, with their own ?next=: a layout cannot read the path.
export default async function SignedInLayout({ children }: { children: ReactNode }) {
  const [language, navMode, viewer] = await Promise.all([getLanguage(), getNavMode(), getViewer()]);
  return (
    <AppShell language={language} email={viewer?.email ?? ""} initialNavMode={navMode}>
      {children}
    </AppShell>
  );
}
