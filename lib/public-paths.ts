// Paths proxy.ts lets through without a session. The API and /media routes answer 401 themselves:
// redirecting a fetch or an <img> request to /login helps no one.
const PUBLIC_PREFIXES = ["/login", "/auth/", "/api/", "/media/"];

export const isPublicPath = (pathname: string): boolean => PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
