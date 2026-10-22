import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/auth-forms";
import { getSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const user = await getSessionUser();
  if (user && !user.isGuest) redirect("/workspace");
  return <SignUpForm />;
}
