"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/shared/layout-bits";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { ScrollLink } from "./scene";

const LINKS = [
  { to: "inside", label: "How it works" },
  { to: "how", label: "Pipeline" },
  { to: "memory", label: "Memory" },
  { to: "worthit", label: "WorthIt" },
  { to: "faq", label: "FAQ" },
];

/** Floats over the hero; becomes frosted glass once the page scrolls. */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled ? "border-b border-scene-line bg-background/80 shadow-[0_8px_30px_-20px_rgb(16_28_68/0.25)] backdrop-blur-xl" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="rounded-md text-scene-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="RecallIQ home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          {LINKS.map((l) => (
            <ScrollLink
              key={l.to}
              to={l.to}
              className="hidden whitespace-nowrap rounded-md px-3 py-2 text-sm text-scene-muted transition-colors hover:text-scene-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:inline-block"
            >
              {l.label}
            </ScrollLink>
          ))}
          <ThemeToggle className="text-scene-muted hover:bg-scene-raise-strong hover:text-scene-fg" />
          <Link
            href="/sign-in"
            className="hidden h-9 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium text-scene-fg transition-colors hover:bg-scene-raise-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="bg-brand-gradient ml-1 inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold text-white shadow-[0_8px_22px_-10px_rgb(49_86_227/0.8)] transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
          >
            Launch RecallIQ <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </nav>
      </div>
    </header>
  );
}
