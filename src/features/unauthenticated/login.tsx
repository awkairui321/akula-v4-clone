import { useState, type FormEvent } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { landingPathForRole } from "@/lib/roles";
import { isMocking } from "@/mocks/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Onboarding and checkout are intentionally left out of this tour for now —
// all demo accounts below are already fully set up, so signing in
// with one lands straight on that party's platform interface. The
// newinvestor@akula.vc seed account (fresh onboarding) still works if signed
// in manually, it's just not featured here.
/** Demo accounts seeded by the mock backend — see src/mocks/db.ts. */
const DEMO_ACCOUNTS = [
  { email: "investor@akula.vc", label: "Investor" },
  { email: "luca@akula.vc", label: "LUCA (fund manager)" },
  { email: "investment@akula.vc", label: "LUCA investment team" },
  { email: "rm@akula.vc", label: "LUCA relationship manager" },
  { email: "ops@akula.vc", label: "Akula Ops" },
];

export default function LoginPage() {
  const location = useLocation();
  const successMessage = (location.state as { message?: string })?.message;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function doLogin(loginEmail: string, loginPassword: string, otp?: string) {
    setError("");
    setSubmitting(true);
    try {
      const result = await login(loginEmail, loginPassword, otp);
      if (!result.success) {
        setTwoFactorRequired(true);
        setSubmitting(false);
        return;
      }
      navigate(landingPathForRole(result.user), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    doLogin(email, password, twoFactorRequired ? otpCode : undefined);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">AKULA</CardTitle>
          <CardDescription>
            {twoFactorRequired ? "Enter your authenticator code" : "Sign in to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isMocking && !twoFactorRequired && (
            <div className="mb-4 space-y-2">
              <p className="text-center text-xs font-medium text-muted-foreground uppercase">
                Demo — no live backend in this environment
              </p>
              <div className="grid gap-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <Button
                    key={account.email}
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={submitting}
                    onClick={() => doLogin(account.email, "password123")}
                  >
                    {account.label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">or sign in manually</span>
                <Separator className="flex-1" />
              </div>
            </div>
          )}
          {successMessage && !twoFactorRequired && (
            <p className="mb-4 text-center text-sm text-green-600">{successMessage}</p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!twoFactorRequired ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      to="/forgot-password"
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="otp">Authentication code</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  required
                  autoComplete="one-time-code"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in..." : twoFactorRequired ? "Verify" : "Sign in"}
            </Button>
            {twoFactorRequired ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setTwoFactorRequired(false);
                  setOtpCode("");
                  setError("");
                }}
              >
                Back
              </Button>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <Link to="/signup" className="text-foreground underline hover:no-underline">
                  Sign up
                </Link>
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
