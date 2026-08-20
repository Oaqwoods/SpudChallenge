import type { Metadata } from "next";
import { Geist, Geist_Mono, Press_Start_2P } from "next/font/google";
import { PageViewTracker } from "@/components/analytics-tracker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Retro arcade display face (OFL-licensed) for headings, countdown, and
// scoreboard values. Placeholder for the owner's arcade-font reference.
const pixel = Press_Start_2P({
  variable: "--font-pixel",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://spudchallenge.online"),
  title: {
    default: "$1 → $5,000,000 | The 21-Day Trade Challenge",
    template: "%s | ONE → FIVE",
  },
  description:
    "We started with $1 and have 21 days to trade our way to $5 million. Follow every trade or offer something better.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    siteName: "ONE → FIVE",
    title: "ONE → FIVE — $1 → $5,000,000 in 21 Days",
    description: "21 Days. Only Trades. Follow every trade or offer something better.",
    url: "/",
    type: "website",
    images: [
      {
        url: "/og/challenge.png",
        width: 1200,
        height: 630,
        alt: "ONE → FIVE — $1 → $5,000,000 in 21 days. Only trades, no added cash, and the clock never resets.",
      },
    ],
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
      className={`${geistSans.variable} ${geistMono.variable} ${pixel.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PageViewTracker />
        {children}
      </body>
    </html>
  );
}
