import type { Metadata } from "next";
import { Geist, Geist_Mono, Roboto, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const ibmPlexSansHeading = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-heading" });

const roboto = Roboto({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Draftly — Tweet Automation",
  description: "Generate on-brand tweets from prompts or RSS feeds using your saved writing style.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        roboto.variable,
        ibmPlexSansHeading.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex h-12 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <span className="font-heading text-base font-semibold tracking-tight">
              Draftly
            </span>
            <span className="text-[11px] text-muted-foreground">
              tweet automation
            </span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
