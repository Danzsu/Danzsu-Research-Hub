// The taiyaki, variant A "Klasszikus" (.superpowers/brainstorm/4489-1790347439/content/taiyaki-icon.html,
// #ty-a): an original drawing in the house style, not taken from any album art. Signal-orange body, ink
// outline and scales, a hard ink shadow offset 3 3 with no blur. Decorative: the button names it.

const BODY =
  "M6 33 C6 21 18 14 32 15 C38 15.5 42 18 45 21 L56 13 C58 12 60 13 59 16 L55 32 L59 48 C60 51 58 52 56 51 L45 43 C42 46 38 48.5 32 49 C18 50 6 44 6 33 Z";
const FINS = "M20 17 Q27 6 39 12 L37 17 Z M22 47 Q27 56 35 52 L33 48 Z";
const MARKS =
  "M22 22 Q27 32 22 42 M29 25 q3 3 6 0 M36 25 q3 3 6 0 M31 31 q3 3 6 0 M38 31 q3 3 6 0 M29 37 q3 3 6 0 M36 37 q3 3 6 0 M47 25 L53 21 M48 32 L54 32 M47 39 L53 43 M7 36 Q10 38.5 13 36";

export function TaiyakiIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className}>
      <g transform="translate(3 3)" className="fill-ink">
        <path d={FINS} />
        <path d={BODY} />
      </g>
      <g className="fill-signal stroke-ink" strokeWidth={2.5} strokeLinejoin="round">
        <path d={FINS} />
        <path d={BODY} />
      </g>
      <path d={MARKS} className="fill-none stroke-ink" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={15} cy={28} r={3.4} className="fill-ink" />
      <circle cx={16.2} cy={26.9} r={1.1} className="fill-paper" />
    </svg>
  );
}
