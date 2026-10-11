// Not a client module on purpose: server components (the Library list, the GitHub tab) use these strings,
// and a value imported from a "use client" module reaches them as a client reference instead.

/** A toggle's pressed state, in ink (DESIGN.md → Components → Button): the card toggles use it too. */
export const pressedClass = "aria-pressed:bg-ink aria-pressed:text-paper";
/** A card or row that holds a 👎 rating dims and turns its frame dashed, unlike a read one (B spec 2.4). */
export const dislikedClass = "has-[[data-rating=down]]:opacity-60 has-[[data-rating=down]]:border-dashed";
