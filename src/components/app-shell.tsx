"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Activity, BrainCircuit, CircleDollarSign, FlaskConical, History, LogOut, Menu, Settings, UserRound, Wrench, X } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/shared/layout-bits";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { WalletConnectButton } from "@/components/wallet/connect-button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/workspace", label: "Workspace", icon: Activity },
  { href: "/investigations", label: "Investigations", icon: History },
  { href: "/memory", label: "Memory Vault", icon: BrainCircuit },
  { href: "/tools", label: "Tool Intelligence", icon: Wrench },
  { href: "/payments", label: "Payments", icon: CircleDollarSign },
  { href: "/learning", label: "Learning Lab", icon: FlaskConical },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Dashboard">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ user, children }: { user: { name: string; email: string; isGuest: boolean }; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const signOut = async () => {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card/40 p-4 lg:flex">
          <Link
            href="/workspace"
            className="mb-6 rounded-md px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="RecallIQ workspace"
          >
            <Logo />
          </Link>
          <NavLinks />
          <div className="mt-auto rounded-lg border bg-card p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Sui Mainnet</p>
            <p className="mt-0.5">Chain data via Tatum gRPC · memory on Walrus</p>
          </div>
        </aside>

        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close navigation" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-4 border-r bg-background p-4 shadow-xl">
              <div className="flex items-center justify-between">
                <Logo />
                <Button variant="ghost" size="icon" aria-label="Close navigation" onClick={() => setOpen(false)}>
                  <X aria-hidden />
                </Button>
              </div>
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur md:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setOpen(true)}>
              <Menu aria-hidden />
            </Button>
            <div className="lg:hidden">
              <Logo />
            </div>
            <div className="ml-auto flex items-center gap-1">
              <div className="hidden sm:block">
                <WalletConnectButton />
              </div>
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex size-10 items-center justify-center rounded-full bg-muted text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Account menu"
                >
                  {user.isGuest ? <UserRound className="size-4" aria-hidden /> : (user.name?.[0] ?? user.email[0] ?? "?").toUpperCase()}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <span className="block font-medium text-foreground">{user.isGuest ? "Guest session" : user.name}</span>
                    {!user.isGuest && <span className="block truncate">{user.email}</span>}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {user.isGuest && (
                    <DropdownMenuItem onSelect={() => router.push("/sign-up")}>
                      <UserRound aria-hidden /> Create account
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => router.push("/settings")}>
                    <Settings aria-hidden /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={signOut}>
                    <LogOut aria-hidden /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          {user.isGuest && (
            <div className="border-b bg-warning-soft px-4 py-2 text-center text-xs md:px-6">
              Guest session: a few read-only investigations per day, no memory writes or payments.{" "}
              <Link href="/sign-up" className="font-medium underline underline-offset-2">
                Create a free account
              </Link>{" "}
              to keep your history.
            </div>
          )}
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
        </div>
      </div>
    </>
  );
}
