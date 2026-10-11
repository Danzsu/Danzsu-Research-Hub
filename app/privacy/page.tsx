import type { Localized } from "@/data/digest-types";
import { LocalizedText } from "@/app/components/language-context";
import { PageHero } from "@/app/components/page-header";
import { PublicPage } from "@/app/components/public-page";
import { getLanguage } from "@/lib/language";

const copy = {
  lead: {
    hu: "Röviden és őszintén: mit tárol ez a privát, meghívásos oldal, és mit nem.",
    en: "Short and honest: what this private, invite-only site stores, and what it does not.",
  },
};

const sections: { title: Localized; text: Localized }[] = [
  {
    title: { hu: "Kik használhatják", en: "Who can use it" },
    text: {
      hu: "Az oldal zárt: csak meghívott tagok léphetnek be, regisztráció nincs. A tartalma magáncélú kutatási gyűjtemény, a keresők nem indexelik.",
      en: "The site is closed: only invited members can sign in, and there is no sign-up. Its content is a private research collection that search engines do not index.",
    },
  },
  {
    title: { hu: "Mit tárolunk rólad", en: "What we store about you" },
    text: {
      hu: "A belépéshez a meghívott e-mail-címedet, Google-belépésnél a Google-fiókod nevét és ellenőrzött e-mail-címét (más Google-adatot nem kérünk: csak az openid, az e-mail és a profil hatókört). Emellett az általad végzett műveleteket: olvasott és későbbre jelölt hírek, teendők, 👎 👍 ❤ értékelések, a beküldött linkek és az általad szerkesztett posztcímek.",
      en: "To sign you in: your invited email address and, with Google sign-in, your Google account's name and verified email (we request no other Google data: only the openid, email and profile scopes). Alongside that, what you do on the site: read and saved-for-later marks, to-dos, 👎 👍 ❤ ratings, the links you submit and the post titles you edit.",
    },
  },
  {
    title: { hu: "Mit nem teszünk", en: "What we do not do" },
    text: {
      hu: "Nincs hirdetés, nincs követés, és az adataidat nem adjuk el és nem osztjuk meg harmadik féllel marketing célra. A munkamenethez szükséges sütiket használjuk, és a nyelv- és a menüválasztásod megjegyzéséhez két egyszerű sütit.",
      en: "No ads, no tracking, and we do not sell your data or share it with third parties for marketing. We use the cookies needed to keep you signed in, plus two simple ones that remember your language and menu choice.",
    },
  },
  {
    title: { hu: "Hol és ki kezeli", en: "Where and by whom" },
    text: {
      hu: "Az adatok egy Supabase-adatbázisban (az EU-ban, Írországban) vannak, az oldalt a Vercel szolgálja ki. A beküldött linkek tartalmát mesterséges intelligenciás szolgáltatások (Google Gemini, Groq) dolgozzák fel összefoglalás és fordítás céljából; a személyes adataidat nem küldjük nekik.",
      en: "The data lives in a Supabase database (in the EU, Ireland) and the site is served by Vercel. The content of submitted links is processed by AI services (Google Gemini, Groq) for summaries and translation; your personal data is not sent to them.",
    },
  },
  {
    title: { hu: "Törlés és kapcsolat", en: "Deletion and contact" },
    text: {
      hu: "Ha törölni szeretnéd a fiókodat és az adataidat, vagy kérdésed van, kérd az oldal üzemeltetőjét, aki meghívott.",
      en: "To have your account and data deleted, or for any question, ask the site's operator who invited you.",
    },
  },
];

export default async function PrivacyPage() {
  return (
    <PublicPage language={await getLanguage()}>
      <PageHero eyebrow="PRIVACY / ADATKEZELÉS" title="PRIVACY" lead={<LocalizedText value={copy.lead} />} />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-10">
        {sections.map(({ title, text }, index) => (
          <section key={index} className="border-t border-paper/20 py-6 first:border-t-0">
            <h2 className="font-display text-2xl leading-none">
              <LocalizedText value={title} />
            </h2>
            <p className="mt-3 text-sm leading-6 text-paper/75">
              <LocalizedText value={text} />
            </p>
          </section>
        ))}
      </main>
    </PublicPage>
  );
}
