import "server-only";
import { cookies } from "next/headers";
import type { Language } from "@/data/digest-types";
import { readNavMode, type NavMode } from "@/lib/nav-mode";

/** The reader's language, written by persistLanguage in app/components/language-context.tsx. */
export async function getLanguage(): Promise<Language> {
  return (await cookies()).get("lang")?.value === "en" ? "en" : "hu";
}

/** The desktop nav's width, written by persistNavMode in app/components/app-shell.tsx. */
export async function getNavMode(): Promise<NavMode> {
  return readNavMode((await cookies()).get("nav")?.value);
}
