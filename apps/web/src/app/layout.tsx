import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import SessionLifecycleClient from "@/components/SessionLifecycleClient";

const resolvedAppUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined) ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
  "https://ahwa.vercel.app";

const appUrl = new URL(resolvedAppUrl);
const ogImage = new URL("/og/ahwa-og.png", appUrl).toString();

export const metadata: Metadata = {
  metadataBase: appUrl,
  applicationName: "AHWA",
  title: {
    default: "Ahwa",
    template: "%s | Ahwa",
  },
  description: "منصة تشغيل يومية للقهاوي الراقية: الصالة، الباريستا، الشيشة، والتحصيل.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon-512x512-maskable.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon-192x192.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Ahwa",
    description: "منصة تشغيل يومية للقهاوي الراقية: الصالة، الباريستا، الشيشة، والتحصيل.",
    url: appUrl,
    siteName: "Ahwa",
    type: "website",
    locale: "ar_AR",
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: "Ahwa",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ahwa",
    description: "منصة تشغيل يومية للقهاوي الراقية: الصالة، الباريستا، الشيشة، والتحصيل.",
    images: [ogImage],
  },
};

export const viewport: Viewport = {
  themeColor: "#2b1710",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">
        <ServiceWorkerRegistrar />
        <SessionLifecycleClient />
        {children}
      </body>
    </html>
  );
}
