import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WHAT_INVESTOR_COMPLETES } from "@/lib/rm-onboarding";

/** The investor opens the invitation from their RM, sets their own password and reviews. */
export default function ActivatePage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const invitation = useQuery({
    queryKey: ["activation", token],
    queryFn: () =>
      api<{ email: string; first_name: string; rm_name: string }>(
        `/api/v1/public/activation?token=${encodeURIComponent(token)}`,
      ),
    enabled: Boolean(token),
    retry: false,
  });

  const activate = useMutation({
    mutationFn: () =>
      api("/api/v1/public/activate", {
        method: "POST",
        body: { token, password, password_confirmation: confirmation },
      }),
    onSuccess: async () => {
      await refreshUser();
      navigate("/onboarding", { replace: true });
    },
  });

  const valid = password.length >= 8 && password === confirmation;
  const error =
    password && confirmation && password !== confirmation
      ? "Passwords do not match"
      : activate.error instanceof Error
        ? activate.error.message
        : "";

  if (!token || invitation.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>This invitation is no longer valid</CardTitle>
            <CardDescription>
              Ask your LUCA relationship manager to send a new invitation, or sign in if you have
              already activated your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/login">
              <Button variant="outline">Go to sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {invitation.data ? `Welcome, ${invitation.data.first_name}` : "Activate your account"}
          </CardTitle>
          <CardDescription>
            {invitation.data
              ? `${invitation.data.rm_name} referred you to Akula and has started your account. Set a password to review it.`
              : "Loading your invitation..."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {invitation.data && (
            <>
              <div className="space-y-1.5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Still to do
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {WHAT_INVESTOR_COMPLETES.map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={invitation.data.email} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Choose a password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmation">Confirm password</Label>
                <Input
                  id="confirmation"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                className="w-full"
                disabled={!valid || activate.isPending}
                onClick={() => activate.mutate()}
              >
                {activate.isPending ? "Activating..." : "Activate account"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
