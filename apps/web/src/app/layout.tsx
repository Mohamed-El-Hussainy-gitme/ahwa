import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ahwa",
  description: "نظام تشغيل قهوة للموبايل: ويتر، مطبخ، شيشة، وحساب.",
  icons: {
    icon: "/brand/ahwa-logo.svg",
    shortcut: "/brand/ahwa-logo.svg",
    apple: "/brand/ahwa-logo.svg",
  },
  openGraph: {
    title: "Ahwa",
    description: "نظام تشغيل قهوة للموبايل: ويتر، مطبخ، شيشة، وحساب.",
    images: ["/brand/ahwa-logo.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
