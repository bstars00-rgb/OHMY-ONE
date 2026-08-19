import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OHMY ONE",
  description: "No Menu. Just Ask. — AI-native enterprise operating system.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
