import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "College Noticeboard", description: "College notices and documents" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
