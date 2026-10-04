import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", weight: ["600", "700"] });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", weight: ["500", "700"] });

// Every page reads live data from the database.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "cabas", template: "%s · cabas" },
  description: "Suivi des courses et comparaison des prix",
};

export const viewport: Viewport = {
  themeColor: "#fbf7f0",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster position="top-center" richColors theme="light" />
      </body>
    </html>
  );
}
