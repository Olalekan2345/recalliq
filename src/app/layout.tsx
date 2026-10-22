import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
// Display face for headings: rounded geometric forms that echo the logo's wordmark.
const display = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap", weight: ["300", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "RecallIQ — AI that remembers. Intelligence that evolves.", template: "%s · RecallIQ" },
  description:
    "An evidence-driven Sui investigation agent that learns from verified mistakes on Walrus Memory and pays for specialist analysis only when it is worth it.",
  applicationName: "RecallIQ",
};

export const viewport: Viewport = {
  // The app opens in the light theme whatever the OS setting, so the browser chrome matches it.
  themeColor: "#f8fbff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
