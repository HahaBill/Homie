import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-body",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://meet-homie.vercel.app"),
  title: "Homie — checks in, so you don't have to keep track",
  description:
    "Homie texts you every morning, notices the pattern between the weather, your sleep and how you feel, and turns ninety days of it into one page you hand your consultant.",
  applicationName: "Homie",
  keywords: [
    "lupus",
    "rheumatoid arthritis",
    "chronic illness",
    "symptom tracking",
    "barometric pressure",
    "rheumatology",
  ],
  icons: {
    icon: "/homie-logo.jpg",
    apple: "/homie-logo.jpg",
  },
  openGraph: {
    title: "Homie — checks in, so you don't have to keep track",
    description:
      "A text message every morning. Ninety days of it becomes one page you hand your consultant.",
    siteName: "Homie",
    type: "website",
    images: [{ url: "/homie-logo.jpg", width: 448, height: 448, alt: "Homie" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Homie — checks in, so you don't have to keep track",
    description:
      "A text message every morning. Ninety days of it becomes one page you hand your consultant.",
    images: ["/homie-logo.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#FFF4EC",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <body
        className={`${fredoka.variable} ${nunito.variable} ${jetbrainsMono.variable}`}
      >
        <ClerkProvider>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}