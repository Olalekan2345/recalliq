"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/shared/layout-bits";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { ScrollLink } from "./scene";

const LINKS = [
  { to: "how", label: "How it learns" },
  { to: "memory", label: "Memory" },
  { to: "worthit", label: "WorthIt" },
  { to: "faq", label: "FAQ" },
];

/** Floats over the midnight hero; becomes frosted glass once the page scrolls. */
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
        scrolled ? "border-b border-white/10 bg-[#050920]/90 backdrop-blur-xl" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link
          href="/"
          className="rounded-md text-on-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe3ff]"
          aria-label="RecallIQ home"
        >
          <Logo tone="light" />
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          {LINKS.map((l) => (
            <ScrollLink
              key={l.to}
              to={l.to}
              className="hidden rounded-md px-3 py-2 text-sm text-on-dark-muted transition-colors hover:text-on-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe3ff] md:inline-block"
            >
              {l.label}
            </ScrollLink>
          ))}
          <ThemeToggle className="text-on-dark-muted hover:bg-white/10 hover:text-on-dark focus-visible:ring-[#7fe3ff]" />
          <Link
            href="/sign-in"
            className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-on-dark transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe3ff] sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="bg-brand-gradient ml-1 inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgb(50_84_228/0.8)] transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe3ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050920] motion-reduce:transition-none"
          >
            Launch RecallIQ <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </nav>
      </div>
    </header>
  );
}
