import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={{ name: user.name, email: user.email, isGuest: user.isGuest }}>{children}</AppShell>;
}
