"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserRound } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/form-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/misc";

function useGuest() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true);
    setError(null);
    const res = await authClient.signIn.anonymous();
    if (res.error) {
      setError(res.error.message ?? "Guest access is unavailable right now");
      setBusy(false);
      return;
    }
    router.push("/workspace");
    router.refresh();
  };
  return { busy, error, start };
}

function GuestBlock() {
  const guest = useGuest();
  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" className="w-full" loading={guest.busy} onClick={guest.start}>
        <UserRound aria-hidden /> Continue as guest
      </Button>
      <FieldHint className="text-center">Guests get a few read-only investigations per day. No payments, no memory writes.</FieldHint>
      {guest.error && <FieldError className="text-center">{guest.error}</FieldError>}
    </div>
  );
}

export function SignInForm({ guestFirst = false }: { guestFirst?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await authClient.signIn.email({ email, password });
    if (res.error) {
      setError(res.error.status === 401 || res.error.status === 400 ? "Email or password is incorrect" : (res.error.message ?? "Sign in failed"));
      setBusy(false);
      return;
    }
    router.push("/workspace");
    router.refresh();
  };

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>Continue your investigations and memory.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {guestFirst && (
          <>
            <GuestBlock />
            <Separator />
          </>
        )}
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(error)}
            />
          </div>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" variant="brand" className="w-full" loading={busy} disabled={!email || !password}>
            Sign in
          </Button>
        </form>
        {!guestFirst && (
          <>
            <Separator />
            <GuestBlock />
          </>
        )}
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/sign-up" className="font-medium text-primary underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooShort = password.length > 0 && password.length < 10;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) return;
    setBusy(true);
    setError(null);
    const res = await authClient.signUp.email({ name: name.trim() || email.split("@")[0]!, email, password });
    if (res.error) {
      setError(res.error.message ?? "Could not create the account");
      setBusy(false);
      return;
    }
    router.push("/workspace");
    router.refresh();
  };

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>Your lessons persist across sessions on Walrus Memory.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={tooShort}
              aria-describedby="pw-hint"
            />
            {tooShort ? <FieldError id="pw-hint">Use at least 10 characters.</FieldError> : <FieldHint id="pw-hint">At least 10 characters.</FieldHint>}
          </div>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" variant="brand" className="w-full" loading={busy} disabled={!email || password.length < 10}>
            Create account
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
