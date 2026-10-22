"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/overlays";

export function Providers({ children }: { children: React.ReactNode }) {
  // Light by default for everyone; dark (or following the OS) is a choice the user makes in the theme menu.
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <TooltipProvider>{children}</TooltipProvider>
    </ThemeProvider>
  );
}
