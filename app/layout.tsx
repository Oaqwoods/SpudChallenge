import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://spudchallenge.online"),
  title: {
    default: "$1 → $5,000,000 | The 21-Day Trade Challenge",
    template: "%s | ONE → FIVE",
  },
  description:
    "We started with $1 and have 21 days to trade our way to $5 million. Follow every trade or offer something better.",
  openGraph: {
    siteName: "ONE → FIVE",
    title: "ONE → FIVE — $1 → $5,000,000 in 21 Days",
    description: "21 Days. Only Trades. Follow every trade or offer something better.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ONE → FIVE — $1 → $5,000,000 in 21 Days",
    description: "21 Days. Only Trades. Follow every trade or offer something better.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
