// Paths proxy.ts lets through without a session. The API and /media routes answer 401 themselves:
// redirecting a fetch or an <img> request to /login helps no one.
const PUBLIC_PREFIXES = ["/login", "/auth/", "/api/", "/media/"];

// The two public pages Google asks for when the sign-in app goes to production: a home page and a privacy policy.
const PUBLIC_PAGES = ["/about", "/privacy"];

export const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || PUBLIC_PAGES.includes(pathname);

/** The offline preview (app/dev/preview) skips sign-in in development only; in production the page itself is a 404. */
export const isDevPreviewPath = (pathname: string, nodeEnv: string | undefined): boolean =>
  nodeEnv === "development" && pathname.startsWith("/dev/");
