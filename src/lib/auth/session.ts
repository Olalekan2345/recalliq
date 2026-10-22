/**
 * Server-side session helpers. Every protected page and API route resolves the
 * user here — authorization never relies on client navigation guards.
 */
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isGuest: boolean;
}

export async function getSessionUser(reqHeaders?: Headers): Promise<SessionUser | null> {
  try {
    const session = await auth().api.getSession({ headers: reqHeaders ?? (await headers()) });
    if (!session?.user) return null;
    const u = session.user as typeof session.user & { isAnonymous?: boolean | null };
    return { id: u.id, email: u.email, name: u.name, isGuest: Boolean(u.isAnonymous) };
  } catch {
    return null;
  }
}

/** Pages: redirect to sign-in when there is no session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}
