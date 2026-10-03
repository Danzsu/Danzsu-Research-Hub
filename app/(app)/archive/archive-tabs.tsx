import { FilterChips } from "@/app/components/filter-chips";
import { LocalizedText } from "@/app/components/language-context";

const copy = {
  label: { hu: "Archívum nézetei", en: "Archive views" },
  weeks: { hu: "Hetek", en: "Weeks" },
  github: { hu: "GitHub", en: "GitHub" },
};

/** "Hetek / GitHub" under the archive's hero (G1 spec 4). */
export function ArchiveTabs({ current }: { current: "weeks" | "github" }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-10">
      <FilterChips
        label={copy.label}
        chips={[
          { href: "/archive", label: <LocalizedText value={copy.weeks} />, current: current === "weeks" },
          { href: "/archive/github", label: <LocalizedText value={copy.github} />, current: current === "github" },
        ]}
      />
    </div>
  );
}
