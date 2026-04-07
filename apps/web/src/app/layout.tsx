import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import { assertCriticalEnv } from "@/lib/platform/env-contract";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ahwa.app"),
  applicationName: "AHWA",
  title: "Ahwa",
  description: "منصة تشغيل يومية للقهاوي الراقية: الصالة، الباريستا، الشيشة، والتحصيل.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon-192x192.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Ahwa",
    description: "منصة تشغيل يومية للقهاوي الراقية: الصالة، الباريستا، الشيشة، والتحصيل.",
    images: ["/brand/ahwa-logo.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#111827",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  assertCriticalEnv();
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
