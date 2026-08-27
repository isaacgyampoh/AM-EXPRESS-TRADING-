import type { MetadataRoute } from "next";
import { branding } from "@/lib/config/branding";

/**
 * The web app manifest — what makes this installable.
 *
 * `display: "standalone"` is what removes the browser chrome once installed,
 * which matters more than it sounds: a cashier working one-handed on a phone
 * gets the whole screen for the POS instead of losing 15% of it to an address
 * bar they cannot use anyway.
 *
 * `start_url` points at /pos rather than the home screen. Someone opening this
 * from their home screen is almost always about to serve a customer.
 *
 * Served without authentication on purpose — the manifest has to be readable
 * before sign-in or the browser will not offer to install the app at all.
 * Nothing in it is private.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: branding.name,
    short_name: branding.shortName,
    description: branding.description,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: branding.themeColor,
    categories: ["business", "productivity", "finance"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Maskable icons are drawn full-bleed with the mark inside the middle
      // 80%, so Android can crop them to whatever shape the launcher uses
      // without slicing the letters off.
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
