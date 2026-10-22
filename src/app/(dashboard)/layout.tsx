import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/session";
import { scheduleDrain } from "@/server/jobs/drain";

export const dynamic = "force-dynamic";
// Serverless hosting: a full page load also runs any queued work after the response (server/jobs/drain.ts).
export const maxDuration = 300;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  scheduleDrain();
  return <AppShell user={{ name: user.name, email: user.email, isGuest: user.isGuest }}>{children}</AppShell>;
}
