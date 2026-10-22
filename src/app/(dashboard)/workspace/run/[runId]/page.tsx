import { notFound } from "next/navigation";
import { RunView } from "@/components/agent/run-view";
import { requireUser } from "@/lib/auth/session";
import { getRunDetail } from "@/server/services/investigations";
import { toJson } from "@/types/json";

export const metadata = { title: "Investigation" };
export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const user = await requireUser();
  const { runId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(runId)) notFound();
  const detail = await getRunDetail(user.id, runId);
  if (!detail) notFound();
  return <RunView initial={toJson(detail)} />;
}
