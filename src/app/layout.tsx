import type { Metadata, Viewport } from "next";
import { branding } from "@/lib/config/branding";
import { ServiceWorkerRegistrar } from "@/presentation/components/pwa/service-worker";
import { ToastProvider } from "@/presentation/components/ui/toast";
import "./globals.css";

/**
 * Metadata, and the strings that have to exist before anyone signs in.
 *
 * The tab title and the installed app's name come from `branding` rather than
 * from the settings table: settings are protected by Row Level Security and
 * unreadable without a session, and a browser deciding whether to offer
 * installation has not got one. See src/lib/config/branding.ts.
 */
export const metadata: Metadata = {
  title: {
    default: branding.name,
    template: `%s · ${branding.name}`,
  },
  description: branding.description,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: branding.shortName,
  },
  formatDetection: {
    // Stops iOS turning SKUs and receipt numbers into phone links.
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom is deliberately left enabled. Locking it makes the app feel more
  // native and makes it unusable for anyone who needs to magnify text.
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#047857" },
    { media: "(prefers-color-scheme: dark)", color: "#022c22" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
