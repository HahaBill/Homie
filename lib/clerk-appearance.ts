import type { Appearance, LocalizationResource } from "@clerk/types";

/**
 * Homie's voice over Clerk's default copy.
 *
 * Clerk ships "Sign in to Homie / Welcome back! Please sign in to continue",
 * which is nobody's voice. The strings below are the hand-rolled card's own
 * wording, kept verbatim: lowercase-comfortable, no exclamation marks, and
 * never implying the thread requires an account (PRD §3 — texting works
 * whether or not anyone ever signs in).
 */
export const homieLocalization: LocalizationResource = {
  signIn: {
    start: {
      title: "Get to your page",
      subtitle:
        "Homie emails you a code. There is no password to remember and nothing to install.",
      actionText: "First time here?",
      actionLink: "Get your page",
    },
    emailCode: {
      title: "Check your inbox",
      subtitle: "No rush.",
      formTitle: "The code from the email",
      resendButton: "Send it again",
    },
  },
  signUp: {
    start: {
      title: "Get your page",
      subtitle:
        "Homie emails you a code. There is no password to remember and nothing to install.",
      actionText: "Been here before?",
      actionLink: "Sign in",
    },
    emailCode: {
      title: "Check your inbox",
      subtitle: "No rush.",
      formTitle: "The code from the email",
      resendButton: "Send it again",
    },
  },
  formFieldLabel__emailAddress: "Your email",
  formFieldInputPlaceholder__emailAddress: "you@example.com",
  formButtonPrimary: "Open my page",
} as LocalizationResource;

/**
 * Homie's design tokens, expressed as a Clerk appearance.
 *
 * Clerk's own components replace the hand-rolled card. The card was not
 * merely styling: it reimplemented Clerk's state machine, and got the hard
 * parts wrong — a correct code that returned `missing_requirements` was
 * reported to the user as "That code did not match", with no way forward.
 * Clerk's component handles those states, plus resend, rate limiting,
 * expiry and paste-a-code, so the only thing left for us is the look.
 *
 * Two rules about where tokens may go:
 *   variables — literal hex. Clerk derives hover/active/alpha shades from
 *     these, and its colour maths cannot parse `var(--apricot)`.
 *   elements  — plain CSS, so `var(--token)` is fine and preferred; those
 *     stay in step with globals.css automatically.
 *
 * Values mirror :root in app/globals.css. Change them there first.
 */
export const homieAppearance: Appearance = {
  variables: {
    colorPrimary: "#d47a5a", // --apricot
    colorText: "#2b2b2b", // --ink
    colorTextSecondary: "#6b5c50", // --muted
    colorBackground: "#fff9f3", // --milk
    colorInputBackground: "#fff4ec", // --oat
    colorInputText: "#2b2b2b", // --ink
    colorDanger: "#b85f3f", // --clay: warnings stay in the palette
    colorSuccess: "#7e6a8f", // --symptom
    // Buttons are full pills (--r-full); this is the input/card radius.
    borderRadius: "14px",
    fontFamily: "var(--font-body)",
    fontFamilyButtons: "var(--font-body)",
    fontSize: "18px",
  },

  layout: {
    // No socials configured — the emailed code is the whole ceremony.
    socialButtonsVariant: "blockButton",
    showOptionalFields: false,
    helpPageUrl: "/",
    logoPlacement: "none",
  },

  elements: {
    // The card is drawn by .auth-card's container; Clerk's own chrome is
    // flattened so the two do not nest into a double-bordered box.
    rootBox: { width: "100%" },
    cardBox: {
      width: "100%",
      boxShadow: "none",
      border: "1px solid var(--edge)",
      borderRadius: "var(--r-card)",
    },
    card: {
      backgroundColor: "var(--milk)",
      boxShadow: "none",
      border: "none",
      padding: "32px",
    },

    headerTitle: {
      fontFamily: "var(--font-display)",
      fontSize: "32px",
      fontWeight: "700",
      color: "var(--ink)",
    },
    headerSubtitle: {
      fontSize: "18px",
      lineHeight: "1.6",
      color: "var(--muted)",
    },

    formFieldLabel: {
      fontSize: "18px",
      fontWeight: "700",
      color: "var(--ink)",
    },
    formFieldInput: {
      minHeight: "var(--tap)",
      padding: "0 16px",
      fontSize: "18px",
      color: "var(--ink)",
      backgroundColor: "var(--oat)",
      border: "1px solid var(--edge)",
      borderRadius: "14px",
    },

    // Matches .btn / .btn-primary in globals.css.
    formButtonPrimary: {
      minHeight: "var(--tap)",
      padding: "18px 34px",
      fontSize: "19px",
      fontWeight: "800",
      textTransform: "none",
      color: "var(--oat)",
      backgroundColor: "var(--apricot)",
      borderRadius: "var(--r-full)",
      boxShadow: "none",
      "&:hover": { backgroundColor: "var(--clay)" },
      "&:focus-visible": {
        outline: "2px solid var(--apricot)",
        outlineOffset: "3px",
      },
    },

    // Everything secondary reads as .btn-quiet: quiet, not disabled.
    formButtonReset: {
      color: "var(--cocoa)",
      fontWeight: "700",
      "&:hover": { color: "var(--ink)" },
    },
    footerActionLink: {
      color: "var(--clay)", // --clay clears AA on --milk; --apricot does not
      fontWeight: "700",
      "&:hover": { color: "var(--apricot)" },
    },
    identityPreviewEditButton: { color: "var(--clay)" },
    formResendCodeLink: { color: "var(--clay)", fontWeight: "700" },

    // One-time-code boxes, sized to the pill inputs.
    otpCodeFieldInput: {
      minHeight: "var(--tap)",
      fontSize: "20px",
      color: "var(--ink)",
      backgroundColor: "var(--oat)",
      border: "1px solid var(--edge)",
      borderRadius: "14px",
    },

    formFieldErrorText: { color: "var(--clay)", fontSize: "17px" },
    alertText: { color: "var(--ink)", fontSize: "17px" },

    // Clerk's badge is not part of the Homie surface.
    footer: { background: "none" },
    logoBox: { display: "none" },
  },
};
