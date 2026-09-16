import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "College Noticeboard",
  description: "Self-hosted college noticeboard",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
