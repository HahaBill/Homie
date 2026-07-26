"use client";

import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut, NotebookText, Settings, MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The one header, shared by every page.
 *
 * Before this, each surface hand-rolled its own <nav> and no two agreed:
 * the landing page linked "your thread" at the marketing anchor rather than
 * the real thread, /profile offered a single link back, and /onboarding had
 * no navigation at all — which mattered more than it sounds, because
 * /onboarding is the only place consent_at is ever set and the morning cron
 * refuses to message a row without it (see app/api/cron/morning/route.ts).
 * Nothing linked there, so anyone who skipped it during sign-up was silently
 * excluded from the product forever. It is now "settings" in this menu.
 *
 * The avatar sits in its own slot at the end of the row, outside the links,
 * so it holds the header's right edge and never rides the nav's wrap onto a
 * second line.
 *
 * Built on shadcn/ui (Avatar, DropdownMenu, Button) against the aliases in
 * tailwind.config.ts, so the components inherit Homie's tokens rather than
 * shadcn's default palette.
 */
export default function SiteHeader() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  const initial =
    user?.firstName?.[0] ??
    user?.primaryEmailAddress?.emailAddress?.[0]?.toUpperCase() ??
    "H";

  return (
    <header className="site-header">
      <div className="inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-mark" src="/homie-logo.jpg" alt="" />
        <Link href="/" className="wordmark" aria-label="Homie, home">
          Homie
        </Link>

        <nav className="site-nav" aria-label="Primary">
          <Link href="/#app">how it works</Link>
          {isSignedIn ? (
            <Link href="/dashboard">your thread</Link>
          ) : (
            <Link href="/sign-in">sign in</Link>
          )}
          {/* Signed in, the primary action is the thread, not another trip
              through sign-in — which is where this button used to point
              regardless of session. */}
          <Link
            className="btn btn-primary btn-sm"
            href={isSignedIn ? "/dashboard" : "/sign-in"}
          >
            {isSignedIn ? "open my thread" : "start with a text"}
          </Link>
        </nav>

        {isLoaded && isSignedIn ? (
          <div className="header-user">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-11 w-11 rounded-full p-0 hover:bg-accent"
                  aria-label="Your account"
                >
                  <Avatar className="h-11 w-11 border border-border">
                    <AvatarImage src={user?.imageUrl} alt="" />
                    <AvatarFallback className="bg-secondary font-sans text-base font-bold text-foreground">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-60 font-sans">
                <DropdownMenuLabel className="font-normal">
                  <span className="block text-sm text-muted-foreground">
                    signed in as
                  </span>
                  <span className="block truncate text-base text-foreground">
                    {user?.primaryEmailAddress?.emailAddress ?? "your account"}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuItem asChild>
                  <Link href="/dashboard" className="cursor-pointer">
                    <MessageCircle className="mr-2 h-4 w-4" />
                    the thread
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="cursor-pointer">
                    <NotebookText className="mr-2 h-4 w-4" />
                    your record
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  {/* The only route to consent, and to withdrawing it. */}
                  <Link href="/onboarding" className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    settings and consent
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => signOut({ redirectUrl: "/" })}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>
    </header>
  );
}
