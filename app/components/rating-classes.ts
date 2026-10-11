// Not a client module on purpose: server components (the Library list, the GitHub tab) use these strings,
// and a value imported from a "use client" module reaches them as a client reference instead.

/** A toggle's pressed state, in ink (DESIGN.md → Components → Button): the card toggles use it too. */
export const pressedClass = "aria-pressed:bg-ink aria-pressed:text-paper";
/** A card or row that holds a 👎 rating turns its frame dashed and stays as readable as the rest: read dims, 👎
 *  dashes, saved shows a bar (2a spec D4). */
export const dislikedClass = "has-[[data-rating=down]]:border-dashed";
