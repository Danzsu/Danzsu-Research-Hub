// Stands in for `@/lib/language` in component tests (see tsx-hooks.ts): the real one reads the request's cookies.

/** The visitor's language: Hungarian, the app's default. */
export const getLanguage = async () => "hu" as const;
