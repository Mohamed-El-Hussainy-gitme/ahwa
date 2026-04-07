import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ahwa",
  description: "منصة تشغيل يومية للقهاوي الراقية: الصالة، الباريستا، الشيشة، والتحصيل.",
  icons: {
    icon: "/brand/ahwa-logo.svg",
    shortcut: "/brand/ahwa-logo.svg",
    apple: "/brand/ahwa-logo.svg",
  },
  openGraph: {
    title: "Ahwa",
    description: "منصة تشغيل يومية للقهاوي الراقية: الصالة، الباريستا، الشيشة، والتحصيل.",
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
