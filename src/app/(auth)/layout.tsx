import Link from "next/link";
import { Logo } from "@/components/shared/layout-bits";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <header className="relative mx-auto flex h-16 w-full max-w-6xl items-center px-4 md:px-6">
        <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="RecallIQ home">
          <Logo />
        </Link>
      </header>
      <main className="relative flex flex-1 items-start justify-center px-4 pb-16 pt-8 md:pt-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
