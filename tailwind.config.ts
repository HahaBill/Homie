import type { Config } from "tailwindcss";

/**
 * Tailwind exists here only to carry shadcn/ui components. The app's own
 * surfaces are still hand-written CSS in app/globals.css, and that file
 * remains the source of truth for the design system.
 *
 * Two decisions keep the two from fighting:
 *
 * 1. preflight is OFF. Tailwind's base reset restyles bare elements —
 *    button, h1-h3, a, img, ul — and globals.css styles exactly those. With
 *    preflight on, adding Tailwind silently restyles every page in the app,
 *    which is the opposite of additive.
 *
 * 2. The palette is aliased to the existing custom properties rather than
 *    redeclared. shadcn components ask for `bg-background`, `text-primary`
 *    and friends; those resolve to --oat, --apricot and the rest, so a
 *    component drops in wearing Homie's colours and a token change in
 *    globals.css still propagates everywhere.
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        // Surfaces
        background: "var(--oat)",
        foreground: "var(--ink)",
        card: { DEFAULT: "var(--milk)", foreground: "var(--ink)" },
        popover: { DEFAULT: "var(--milk)", foreground: "var(--ink)" },
        muted: { DEFAULT: "var(--well)", foreground: "var(--muted)" },
        accent: { DEFAULT: "var(--peach)", foreground: "var(--ink)" },
        // The one accent. --clay is the AA-safe variant for text on --milk.
        primary: { DEFAULT: "var(--apricot)", foreground: "var(--oat)" },
        secondary: { DEFAULT: "var(--panel)", foreground: "var(--cocoa)" },
        destructive: { DEFAULT: "var(--clay)", foreground: "var(--oat)" },
        border: "var(--edge)",
        input: "var(--edge)",
        ring: "var(--apricot)",
      },
      borderRadius: {
        lg: "var(--r-card)",
        md: "18px",
        sm: "14px",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
