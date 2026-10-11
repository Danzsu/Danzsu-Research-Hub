import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The GitHub list lived under the archive before it got its own page; the query (filters) carries over.
  redirects: async () => [{ source: "/archive/github", destination: "/github", permanent: true }],
};

export default nextConfig;
