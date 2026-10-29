import "@fontsource-variable/onest";
import "@fontsource-variable/literata";
import "./globals.css";

import type { Metadata, Viewport } from "next";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Samaritan", template: "%s – Samaritan" },
  description: "Church management for people, groups, giving and care.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#2b2142",
};

// Applies the saved theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('sam-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning className="h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
