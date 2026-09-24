import type { Metadata, Viewport } from "next";
import { getLanguage } from "@/lib/language";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEON NEWS RADAR — Weekly AI Intelligence",
  description: "Invite-only bilingual AI research, company, local LLM, and GitHub intelligence digest.",
  // Load-bearing: mirrored articles must never be indexed (see README, "Content and copyright").
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

// Paints the mobile browser chrome ink, matching the page edges.
export const viewport: Viewport = { themeColor: "#141414" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={await getLanguage()}>
      <body>{children}</body>
    </html>
  );
}
