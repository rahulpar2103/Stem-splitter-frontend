import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stem Splitter — Separate audio into individual stems",
  description:
    "Upload an audio file or paste a YouTube link to split audio into vocals, drums, bass, guitar, piano, and other stems using Demucs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-white font-sans antialiased text-gray-900">
        {children}
      </body>
    </html>
  );
}
