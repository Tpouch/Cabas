import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "cabas",
    short_name: "cabas",
    description: "Suivi des courses et comparaison des prix",
    lang: "fr-FR",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf7f0",
    // Same as the page's viewport themeColor, so the installed app's status bar blends in.
    theme_color: "#fbf7f0",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
