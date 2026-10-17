import type { MetadataRoute } from "next";

// White matches the opaque background baked into the maskable icon (THIRD_PARTY_NOTICES.md).
const ICON_BACKGROUND = "#ffffff";

/**
 * The web app manifest (`/manifest.webmanifest`): name and home-screen icons for Android/Chrome.
 * `display: "browser"` keeps the app a normal website rather than an installable standalone PWA.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Caveman Planning Good",
    short_name: "CPG",
    start_url: "/",
    display: "browser",
    background_color: ICON_BACKGROUND,
    theme_color: ICON_BACKGROUND,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
