import "server-only";
import { cookies } from "next/headers";
import type { Language } from "@/data/digest-types";

/** The reader's language, persisted by `persistLanguage` in app/components/language-toggle.tsx. */
export async function getLanguage(): Promise<Language> {
  return (await cookies()).get("lang")?.value === "en" ? "en" : "hu";
}
