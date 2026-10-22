import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/auth-forms";
import { getSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ guest?: string }> }) {
  if (await getSessionUser()) redirect("/workspace");
  const { guest } = await searchParams;
  return <SignInForm guestFirst={guest === "1"} />;
}
