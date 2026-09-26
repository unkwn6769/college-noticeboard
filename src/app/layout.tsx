import type { Metadata, Viewport } from "next";

import "@/src/styles/tokens.css";
import "@/src/styles/base.css";
import "@/src/styles/components.css";
import "@/src/styles/public.css";
import "@/src/styles/admin.css";
import "@/src/styles/print.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "College Noticeboard | Official Announcements",
    template: "%s | College Noticeboard",
  },
  description:
    "Official college notices, examination updates and departmental resources.",
  applicationName: "College Noticeboard",
  openGraph: {
    type: "website",
    siteName: "College Noticeboard",
    title: "College Noticeboard",
    description:
      "Official college notices, examination updates and departmental resources.",
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#090c12" },
  ],
};

/**
 * Runs before the browser paints so a dark-theme operator never sees a white
 * flash. Deliberately tiny and dependency-free: it mirrors the rules in
 * `src/components/ThemeToggle.tsx` and is the only inline script in the app.
 */
const THEME_BOOTSTRAP = `(function(){try{var p=localStorage.getItem('noticeboard.theme');if(p!=='light'&&p!=='dark'&&p!=='system'){p='system';}var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';r.style.colorScheme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <a className="skip-link no-print" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
