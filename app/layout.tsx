import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEON RADAR — Weekly AI Intelligence",
  description: "Invite-only bilingual AI research, company, local LLM, and GitHub intelligence digest.",
  // Load-bearing: mirrored articles must never be indexed (see README, "Content and copyright").
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hu">
      <body>{children}</body>
    </html>
  );
}
