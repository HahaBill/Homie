import { redirect } from "next/navigation";

/** The Clerk portal's after-logo-click target — just the landing page. */
export default function HomePage() {
  redirect("/");
}
