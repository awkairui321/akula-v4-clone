import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ConsentList } from "@/features/investor/consent-section";
import { UserIcon, CheckCircleIcon, ShieldIcon, KeyIcon, SmartphoneIcon } from "lucide-react";

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyIcon className="size-4" />
          Change password
        </CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}

/* ─── Two-Factor Authentication ─── */
function TwoFactorSection() {
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState<"idle" | "setup" | "verify">("idle");
  const [secret, setSecret] = useState("");
  const [provisioningUri, setProvisioningUri] = useState("");
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
      setProvisioningUri(res.provisioning_uri);
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
      setProvisioningUri("");
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SmartphoneIcon className="size-4" />
          Two-factor authentication
        </CardTitle>
        <CardDescription>
          {enabled
            ? "Two-factor authentication is enabled."
            : "Add an extra layer of security to your account."}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                Scan this QR code with your authenticator app, or enter the secret key manually.
              </p>
              <div className="flex justify-center py-4">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(provisioningUri)}`}
                  alt="2FA QR Code"
                  className="rounded-lg border"
                  width={200}
                  height={200}
                />
              </div>
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
      </CardContent>
    </Card>
  );
}

/* ─── Main Page ─── */
export default function AccountPage() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["investorProfile"],
    queryFn: () => api<{ investor_profile: InvestorProfile | null }>("/api/v1/investor_profile"),
  });

  const profile = data?.investor_profile;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Account</h1>

      {isLoading && <p className="py-12 text-center text-muted-foreground">Loading...</p>}

      {!isLoading && profile && (
        <div className="space-y-4">
          {/* Profile card */}
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <UserIcon className="size-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-lg font-semibold">{displayName(profile)}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <div className="mt-1 flex items-center gap-2">
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
                  <span className="text-xs text-muted-foreground">Individual</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Application details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Application
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-muted-foreground">Reference</dt>
                  <dd className="font-mono text-sm font-medium">
                    AK-{new Date().getFullYear()}-{String(profile.id).padStart(4, "0")}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-muted-foreground">Verification status</dt>
                  <dd className="text-sm font-medium">{user?.verified ? "Verified" : "Pending"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-muted-foreground">Account type</dt>
                  <dd className="text-sm font-medium">Individual</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-muted-foreground">Country</dt>
                  <dd className="text-sm font-medium">{profile.country}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-muted-foreground">Nationality</dt>
                  <dd className="text-sm font-medium">{profile.nationality}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Consent & privacy */}
          <Separator className="my-2" />
          <h2 className="text-lg font-semibold">Consent & privacy</h2>
          <p className="-mt-2 text-sm text-muted-foreground">
            Review what you've granted us permission to do. Withdrawing a required consent may limit
            what we can share with you or your adviser.
          </p>
          <ConsentList mode="management" />

          {/* Security section */}
          <Separator className="my-2" />
          <h2 className="text-lg font-semibold">Security</h2>

          <ChangePasswordSection />
          <TwoFactorSection />
        </div>
      )}
    </div>
  );
}
