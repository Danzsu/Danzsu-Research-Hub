import { Archive, BookOpen, Building2, GitFork, Heart, Keyboard, Languages, Link2, Radar, type LucideIcon } from "lucide-react";
import type { Localized } from "@/data/digest-types";
import { LocalizedText } from "@/app/components/language-context";
import { PageHero } from "@/app/components/page-header";
import { PublicPage } from "@/app/components/public-page";
import { getLanguage } from "@/lib/language";
import { SignInForms } from "@/app/components/sign-in-forms";

const copy = {
  lead: {
    hu: "Privát, meghívásos AI-kutatási hub: minden nap összeválogatja a legfontosabb híreket, és a beküldött linkekből olvasható posztot csinál. Magyarul és angolul.",
    en: "A private, invite-only AI research hub: it curates the most important news every day and turns the links you send into readable posts. In Hungarian and English.",
  },
  featuresTitle: { hu: "MIT TUD", en: "WHAT IT DOES" },
  signInTitle: { hu: "BELÉPÉS", en: "SIGN IN" },
  signInNote: {
    hu: "Csak meghívással lehet belépni. Nincs regisztráció: a meghívott címeddel jelentkezz be Google-lel vagy e-mailes linkkel.",
    en: "Entry is by invitation only. There is no sign-up: use your invited address, with Google or an email link.",
  },
};

const features: { icon: LucideIcon; title: Localized; text: Localized }[] = [
  {
    icon: Radar,
    title: { hu: "Heti Radar", en: "Weekly Radar" },
    text: {
      hu: "Naponta frissülő, pontozott válogatás kutatásból, cégektől, helyi modellekből és GitHubról. A hét három legfontosabb híre külön kiemelve, mellette a GitHub Top 10.",
      en: "A scored digest, refreshed daily, from research, companies, local models and GitHub. The week's three must-reads stand out, with the GitHub Top 10 beside them.",
    },
  },
  {
    icon: Building2,
    title: { hu: "AI cégek", en: "AI companies" },
    text: {
      hu: "Egy oldal a laborok és cégek híreinek: fent a legutóbbi nap öt legjobbja, alatta a hét többi híre.",
      en: "One page for lab and company news: the latest day's top five on top, the rest of the week below.",
    },
  },
  {
    icon: BookOpen,
    title: { hu: "Könyvtár", en: "Library" },
    text: {
      hu: "Küldj be egy cikket, YouTube-videót, arXiv-tanulmányt, PDF-et, X-posztot vagy GitHub-repót, és blokkokra bontott, olvasható poszt lesz belőle: képekkel, kétnyelvű összefoglalóval, kérésre magyar fordítással.",
      en: "Send an article, YouTube video, arXiv paper, PDF, X post or GitHub repo and get a readable, block-based post: with images, a bilingual summary and an on-demand Hungarian translation.",
    },
  },
  {
    icon: Link2,
    title: { hu: "Taiyaki chat", en: "Taiyaki chat" },
    text: {
      hu: "Egy kis chat minden oldalon: bedobod a linket, és látod, ahogy feldolgozódik. A hírkártyák „Olvasd itt” gombja ugyanezt használja.",
      en: "A small chat on every page: drop a link and watch it get processed. The news cards' “Read here” button uses the same thing.",
    },
  },
  {
    icon: Heart,
    title: { hu: "Értékelés és Gyűjtemény", en: "Ratings and Collection" },
    text: {
      hu: "👎 👍 ❤ a híreken, a posztokon és a repókon. A ❤-ekből hetektől függetlenül gyűlik a saját Gyűjteményed.",
      en: "👎 👍 ❤ on news, posts and repos. Your hearts add up to a Collection of your own, whatever the week.",
    },
  },
  {
    icon: Archive,
    title: { hu: "Archívum és GitHub repók", en: "Archive and GitHub repos" },
    text: {
      hu: "A lezárt hetek változatlanok maradnak. A GitHub repók oldala minden heti Top 10 repót egy listában mutat, értékelés és nyelv szerint szűrhetően.",
      en: "Closed weeks stay as they were. The GitHub repos page lists every weekly Top 10 repo in one place, filterable by rating and language.",
    },
  },
  {
    icon: Languages,
    title: { hu: "Magyar és angol", en: "Hungarian and English" },
    text: {
      hu: "A teljes felület és a hírek összefoglalói két nyelven vannak meg, egy kattintással váltasz.",
      en: "The whole interface and every news summary come in two languages; switch with one click.",
    },
  },
  {
    icon: Keyboard,
    title: { hu: "Gyors, telefonon is", en: "Fast, on a phone too" },
    text: {
      hu: "Billentyűparancsok (j/k, o, r, l, z, ⌘K), olvasott és későbbre jelölés visszavonással, teendők a hírekhez, és 360 px-től a széles monitorig használható elrendezés.",
      en: "Keyboard shortcuts (j/k, o, r, l, z, ⌘K), read and save-for-later marks with undo, to-dos tied to news, and a layout that works from 360px to a wide monitor.",
    },
  },
  {
    icon: GitFork,
    title: { hu: "Megbízható források", en: "Trusted sources" },
    text: {
      hu: "Csak szerkesztett, ellenőrizhető forrásokból dolgozik: labor- és cégblogok, kutatási hírcsatornák, Hacker News és GitHub. A beküldött cikkeket a saját oldalon, a forrás megjelölésével tükrözi.",
      en: "It reads edited, verifiable sources only: lab and company blogs, research feeds, Hacker News and GitHub. Submitted articles are mirrored on the site, with the source credited.",
    },
  },
];

export default async function AboutPage() {
  return (
    <PublicPage language={await getLanguage()}>
      <PageHero eyebrow="INVITE-ONLY / CSAK MEGHÍVÓVAL" title="NEON NEWS RADAR" lead={<LocalizedText value={copy.lead} />} />
      <main>
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-10">
          <h2 className="font-display text-3xl tracking-[-0.04em] sm:text-4xl">
            <LocalizedText value={copy.featuresTitle} />
            <span className="text-signal">{"//"}</span>
          </h2>
          <ul className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }, index) => (
              <li key={index} className="border-2 border-paper/30 bg-[#1c1c1c] p-6">
                <Icon className="size-7 text-signal" aria-hidden="true" />
                <h3 className="mt-5 font-display text-2xl leading-none">
                  <LocalizedText value={title} />
                </h3>
                <p className="mt-3 text-sm leading-6 text-paper/70">
                  <LocalizedText value={text} />
                </p>
              </li>
            ))}
          </ul>
        </section>
        <section id="login" className="mx-auto max-w-6xl px-4 pb-16 sm:px-10">
          <div className="max-w-md border-2 border-ink bg-cream p-7 text-ink shadow-[8px_8px_0_var(--signal)] sm:p-9">
            <h2 className="font-display text-4xl leading-[0.9] tracking-[-0.04em]">
              <LocalizedText value={copy.signInTitle} />
              <span className="text-signal">{"//"}</span>
            </h2>
            <p className="mt-4 text-sm leading-6 text-ink/70">
              <LocalizedText value={copy.signInNote} />
            </p>
            <SignInForms next="/" />
          </div>
        </section>
      </main>
    </PublicPage>
  );
}
