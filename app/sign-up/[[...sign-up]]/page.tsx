import { redirect } from "next/navigation";

/**
 * There is no separate sign-up (PRD §3 — no onboarding flow). The sign-in
 * card quietly creates an account for a number it has not seen before.
 */
export default function SignUpPage() {
  redirect("/sign-in");
}
