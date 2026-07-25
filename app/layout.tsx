import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Fraunces, Nunito_Sans } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-display",
  display: "swap",
});

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-body",
  display: "swap",
  // Next has no built-in metric overrides for Nunito Sans, so its automatic
  // fallback adjustment is disabled and an explicit stack supplied instead.
  adjustFontFallback: false,
  fallback: [
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
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
  themeColor: "#FBF4EA",
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
      <body className={`${fraunces.variable} ${nunitoSans.variable}`}>
        <ClerkProvider>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}