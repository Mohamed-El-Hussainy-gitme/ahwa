import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ahwa",
  description: "نظام قهوة شعبي (موبايل أولاً)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
