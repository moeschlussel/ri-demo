import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";

import "@/app/globals.css";

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-sans"
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"]
});

export const metadata: Metadata = {
  title: "RI AI CFO Dashboard",
  description: "Scope-aware financial intelligence dashboard for Robotic Imaging."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} bg-[var(--background)] text-[var(--foreground)]`}>
        {children}
      </body>
    </html>
  );
}

