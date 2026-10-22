"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, BrainCircuit, CircleDollarSign, FlaskConical, History, LogOut, Menu, Settings, UserRound, Wrench, X } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/shared/layout-bits";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { WalletConnectButton } from "@/components/wallet/connect-button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";

const NAV = [
  {
    group: "Agent",
    items: [
      { href: "/workspace", label: "Workspace", icon: Activity },
      { href: "/investigations", label: "Investigations", icon: History },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { href: "/memory", label: "Memory Vault", icon: BrainCircuit },
      { href: "/tools", label: "Tool Intelligence", icon: Wrench },
      { href: "/learning", label: "Learning Lab", icon: FlaskConical },
    ],
  },
  {
    group: "Account",
    items: [
      { href: "/payments", label: "Payments", icon: CircleDollarSign },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5" aria-label="Dashboard">
      {NAV.map(({ group, items }) => (
        <div key={group}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">{group}</p>
          <ul className="flex flex-col gap-0.5">
            {items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-gradient-to-b from-brand-cyan to-primary" aria-hidden />}
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function NetworkCard() {
  return (
    <div className="ring-brand relative overflow-hidden rounded-xl bg-card p-3 text-xs text-muted-foreground">
      <div className="bg-brand-glow absolute -right-8 -top-8 size-24 rounded-full blur-xl" aria-hidden />
      <p className="relative flex items-center gap-2 font-medium text-foreground">
        <span className="pulse-dot size-1.5 rounded-full bg-success" aria-hidden />
        Sui Mainnet
      </p>
      <p className="relative mt-1 leading-5">Chain data via Tatum gRPC · memory on Walrus</p>
    </div>
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const initial = (user.name?.[0] ?? user.email[0] ?? "?").toUpperCase();

  return (
    <div className="relative flex min-h-dvh">
      {/* Soft brand light behind the app, fixed so it never moves while scrolling data. */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 left-1/3 h-80 w-[60vw] rounded-full bg-[radial-gradient(closest-side,rgb(24_204_249/0.09),transparent)] blur-2xl" />
        <div className="absolute -right-40 top-20 h-96 w-[40vw] rounded-full bg-[radial-gradient(closest-side,rgb(153_118_249/0.08),transparent)] blur-2xl" />
      </div>

      <aside className="glass sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r p-4 lg:flex">
        <Link
          href="/workspace"
          className="mb-7 rounded-md px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="RecallIQ workspace"
        >
          <Logo />
        </Link>
        <NavLinks />
        <div className="mt-auto">
          <NetworkCard />
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            className="animate-in-fade absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <div className="animate-in-fade absolute inset-y-0 left-0 flex w-72 flex-col gap-6 border-r bg-background p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <Logo />
              <Button variant="ghost" size="icon" aria-label="Close navigation" onClick={() => setOpen(false)}>
                <X aria-hidden />
              </Button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <div className="mt-auto space-y-3">
              <div className="sm:hidden">
                <WalletConnectButton />
              </div>
              <NetworkCard />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-40 flex h-16 items-center gap-2 border-b px-4 md:px-6">
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
                className="bg-brand-gradient ml-1 inline-flex size-10 items-center justify-center rounded-full p-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label="Account menu"
              >
                <span className="flex size-full items-center justify-center rounded-full bg-card text-sm font-semibold">
                  {user.isGuest ? <UserRound className="size-4" aria-hidden /> : initial}
                </span>
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
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-10">{children}</main>
      </div>
    </div>
  );
}
