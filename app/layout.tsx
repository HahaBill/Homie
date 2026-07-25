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
  metadataBase: new URL("https://homie.app"),
  title: "Homie — A gentle check-in, when you need it",
  description:
    "Homie is a wellbeing companion that shows up quietly — phone, watch, glasses — and asks one honest question. Warm, unhurried, never clinical.",
  applicationName: "Homie",
  authors: [{ name: "Homie" }],
  keywords: [
    "wellbeing",
    "mental health companion",
    "check-in",
    "Homie",
    "gentle",
  ],
  icons: {
    icon: "/homie-logo.png",
    apple: "/homie-logo.png",
  },
  openGraph: {
    title: "Homie — A gentle check-in, when you need it",
    description:
      "A wellbeing companion that shows up quietly and asks one honest question. Warm cream is the canvas; terracotta is the only thing that ever asks to be tapped.",
    siteName: "Homie",
    type: "website",
    images: [{ url: "/homie-logo.png", width: 512, height: 512, alt: "Homie" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Homie — A gentle check-in, when you need it",
    description:
      "A wellbeing companion that shows up quietly and asks one honest question.",
    images: ["/homie-logo.png"],
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
    <html lang="en">
      <body
        className={`${fredoka.variable} ${nunito.variable} ${jetbrainsMono.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
