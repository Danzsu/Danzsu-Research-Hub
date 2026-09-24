import type { MetadataRoute } from "next";

// Lets readers add the site to a phone's home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NEON NEWS RADAR",
    short_name: "NEON RADAR",
    description: "Invite-only bilingual AI intelligence digest.",
    start_url: "/",
    display: "standalone",
    background_color: "#141414",
    theme_color: "#141414",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
