import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { clientCode } from "@/lib/client-code";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ConsentList } from "@/features/investor/consent-section";
import { UserIcon, CheckCircleIcon, ShieldIcon } from "lucide-react";

type VerificationDocument = {
  id: number;
  document_type: string;
  status: string;
  notes: string | null;
  created_at: string;
};

type InvestorProfile = {
  id: number;
  first_name: string;
  preferred_first_name: string | null;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  country: string;
  phone: string;
  interested_industries: string[] | null;
  typical_ticket_size: string | null;
  onboarding_step: number;
  completed: boolean;
};

function displayName(profile: InvestorProfile): string {
  return [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ");
}

/* ─── Change Password ─── */
function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      await api("/api/v1/account/password", {
        method: "PATCH",
        body: {
          current_password: currentPassword,
          password: newPassword,
          password_confirmation: confirmPassword,
        },
      });
      setMessage("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-medium">Change password</h3>
        <p className="text-sm text-muted-foreground">
          Use a strong password that you don’t use elsewhere.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-green-600">{message}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Updating..." : "Update password"}
        </Button>
      </form>
    </section>
  );
}

/* ─── Two-Factor Authentication ─── */
function TwoFactorSection() {
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState<"idle" | "setup" | "verify">("idle");
  const [secret, setSecret] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisable, setShowDisable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const enabled = user?.two_factor_enabled;

  async function handleSetup() {
    setError("");
    setSubmitting(true);
    try {
      const res = await api<{ otp_secret: string; provisioning_uri: string }>(
        "/api/v1/two_factor/setup",
        { method: "POST" },
      );
      setSecret(res.otp_secret);
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api("/api/v1/two_factor/verify", {
        method: "POST",
        body: { otp_code: otpCode },
      });
      await refreshUser();
      setStep("idle");
      setOtpCode("");
      setSecret("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisable(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api("/api/v1/two_factor", {
        method: "DELETE",
        body: { password: disablePassword },
      });
      await refreshUser();
      setShowDisable(false);
      setDisablePassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable 2FA");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-medium">Two-factor authentication</h3>
        <p className="text-sm text-muted-foreground">
          {enabled
            ? "Two-factor authentication is enabled."
            : "Add an extra layer of security to your account."}
        </p>
      </div>
      <div>
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        {enabled && !showDisable && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <ShieldIcon className="size-4" />
              Enabled
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowDisable(true);
                setError("");
              }}
            >
              Disable
            </Button>
          </div>
        )}

        {enabled && showDisable && (
          <form onSubmit={handleDisable} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter your password to disable two-factor authentication.
            </p>
            <div className="space-y-2">
              <Label htmlFor="disable-password">Password</Label>
              <Input
                id="disable-password"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={submitting}>
                {submitting ? "Disabling..." : "Disable 2FA"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowDisable(false);
                  setError("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {!enabled && step === "idle" && (
          <Button onClick={handleSetup} disabled={submitting}>
            {submitting ? "Setting up..." : "Set up 2FA"}
          </Button>
        )}

        {!enabled && step === "verify" && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Add this account to your authenticator app using the setup key below. The setup
                secret stays in this demo and is not sent to a QR-code service.
              </p>
              <div className="rounded-lg bg-muted p-3">
                <p className="mb-1 text-xs text-muted-foreground">Secret key</p>
                <p className="font-mono text-sm break-all select-all">{secret}</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="verify-otp">Verification code</Label>
              <Input
                id="verify-otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                required
                autoComplete="one-time-code"
              />
              <p className="text-xs text-muted-foreground">
                Enter the code from your authenticator app to confirm setup.
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Verifying..." : "Enable 2FA"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStep("idle");
                  setError("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

/* ─── Main Page ─── */
export default function AccountPage() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["investorProfile"],
    queryFn: () => api<{ investor_profile: InvestorProfile | null }>("/api/v1/investor_profile"),
  });
  const { data: documentsData } = useQuery({
    queryKey: ["verificationDocuments"],
    queryFn: () => api<{ documents: VerificationDocument[] }>("/api/v1/onboarding/documents"),
  });

  const profile = data?.investor_profile;
  const documents = documentsData?.documents ?? [];

  return (
    <div className="w-full space-y-8">
      <div>
        <div className="text-3xl font-bold tracking-tight">Account</div>
        <p className="text-muted-foreground">
          Manage your profile, consent and privacy, and security.
        </p>
      </div>

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading...</p>}

      {!isLoading && profile && (
        <div className="space-y-10">
          <section id="profile" className="scroll-mt-8 space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Profile</h2>
              <p className="text-sm text-muted-foreground">
                Your identity and application details.
              </p>
            </div>
            <Card>
              <CardContent className="space-y-6 pt-6">
                <div className="flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <UserIcon className="size-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{displayName(profile)}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                  </div>
                  <div className="ml-auto">
                    {user?.verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary">
                        <CheckCircleIcon className="size-3" />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        Pending
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Application
                  </div>
                  <dl className="mt-2 divide-y border-y text-sm">
                    <div className="flex items-center justify-between py-3">
                      <dt className="text-muted-foreground">Reference</dt>
                      <dd className="font-mono font-medium">
                        AK-{new Date().getFullYear()}-{String(profile.id).padStart(4, "0")}
                      </dd>
                    </div>
                    {user && (
                      <div className="flex items-center justify-between py-3">
                        <dt className="text-muted-foreground">Client tag</dt>
                        <dd className="font-mono font-medium">{clientCode(user.id)}</dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between py-3">
                      <dt className="text-muted-foreground">Verification status</dt>
                      <dd className="font-medium">{user?.verified ? "Verified" : "Pending"}</dd>
                    </div>
                    <div className="flex items-center justify-between py-3">
                      <dt className="text-muted-foreground">Account type</dt>
                      <dd className="font-medium">Individual</dd>
                    </div>
                    <div className="flex items-center justify-between py-3">
                      <dt className="text-muted-foreground">Country</dt>
                      <dd className="font-medium">{profile.country}</dd>
                    </div>
                    <div className="flex items-center justify-between py-3">
                      <dt className="text-muted-foreground">Nationality</dt>
                      <dd className="font-medium">{profile.nationality}</dd>
                    </div>
                  </dl>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="consent-privacy" className="scroll-mt-8 space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Consent &amp; privacy</h2>
              <p className="text-sm text-muted-foreground">
                Review your account permissions and communication preferences.
              </p>
            </div>
            <Card>
              <CardContent className="pt-2">
                <ConsentList mode="management" />
              </CardContent>
            </Card>
          </section>

          <section id="verification-documents" className="scroll-mt-8 space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Verification documents</h2>
              <p className="text-sm text-muted-foreground">
                Documents submitted as part of your identity verification.
              </p>
            </div>
            <Card>
              <CardContent className="divide-y pt-2">
                {documents.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No documents on file.</p>
                ) : (
                  documents.map((document) => (
                    <div key={document.id} className="flex items-center justify-between gap-4 py-4">
                      <div>
                        <p className="text-sm font-medium">
                          {document.document_type.replace(/_/g, " ")}
                        </p>
                        {document.notes && (
                          <p className="text-sm text-muted-foreground">{document.notes}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm capitalize">{document.status.replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(document.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </section>

          <section id="security" className="scroll-mt-8 space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Security</h2>
              <p className="text-sm text-muted-foreground">
                Manage your password and sign-in protection.
              </p>
            </div>
            <Card>
              <CardContent className="pt-6">
                <ChangePasswordSection />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <TwoFactorSection />
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
