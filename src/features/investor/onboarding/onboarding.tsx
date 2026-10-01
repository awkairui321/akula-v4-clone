import { useState, useEffect, useRef } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Client as PersonaClient } from "persona";
import { formatISO, subYears } from "date-fns";
import { isValidPhoneNumber, parsePhoneNumber, type Country } from "react-phone-number-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { isMocking } from "@/mocks/browser";
import { landingPathForRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import {
  LockIcon,
  LoaderIcon,
  Loader2,
  CheckCircle2Icon,
  CircleIcon,
  ClockIcon,
  UserIcon,
  FileSignatureIcon,
  ShieldCheckIcon,
  FastForwardIcon,
  LogOutIcon,
  UsersIcon,
  ScaleIcon,
  ClipboardCheckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StepTracker, type StepState } from "@/components/ui/step-tracker";
import { ConsentList, useConsents, allRequiredGranted } from "@/features/investor/consent-section";
import type { InvestmentChannel } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

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
  channel: InvestmentChannel | null;
  referral_code: string | null;
  accreditation_basis: string[] | null;
  eligibility_confirmed_at: string | null;
};

type SectionStatus = "locked" | "not_started" | "in_progress" | "waiting" | "complete";
type SectionKey = "channel" | "eligibility" | "personal_info" | "kyc" | "nda" | "consent";

const INDUSTRIES = [
  { value: "ai_machine_learning", label: "AI & Machine Learning" },
  { value: "space_satellites", label: "Space & Satellites" },
  { value: "defence_aerospace", label: "Defence & Aerospace" },
  { value: "fintech_payments", label: "Fintech & Payments" },
  { value: "enterprise_saas", label: "Enterprise SaaS" },
  { value: "semiconductors", label: "Semiconductors" },
  { value: "biotech_health", label: "Biotech & Health" },
  { value: "climate_energy", label: "Climate & Energy" },
  { value: "consumer_marketplaces", label: "Consumer & Marketplaces" },
  { value: "robotics_automation", label: "Robotics & Automation" },
  { value: "cybersecurity", label: "Cybersecurity" },
  { value: "crypto_infrastructure", label: "Crypto Infrastructure" },
];

const TICKET_SIZES = [
  { value: "25k-50k", label: "$25k – $50k" },
  { value: "50k-150k", label: "$50k – $150k" },
  { value: "150k-500k", label: "$150k – $500k" },
  { value: "500k+", label: "$500k+" },
];

const COUNTRIES: { country: string; nationality: string; iso?: Country }[] = [
  { country: "Singapore", nationality: "Singaporean", iso: "SG" },
  { country: "United States", nationality: "American", iso: "US" },
  { country: "United Kingdom", nationality: "British", iso: "GB" },
  { country: "Australia", nationality: "Australian", iso: "AU" },
  { country: "Canada", nationality: "Canadian", iso: "CA" },
  { country: "Hong Kong", nationality: "Hong Konger", iso: "HK" },
  { country: "Japan", nationality: "Japanese", iso: "JP" },
  { country: "Germany", nationality: "German", iso: "DE" },
  { country: "France", nationality: "French", iso: "FR" },
  { country: "India", nationality: "Indian", iso: "IN" },
  { country: "Indonesia", nationality: "Indonesian", iso: "ID" },
  { country: "Malaysia", nationality: "Malaysian", iso: "MY" },
  { country: "Thailand", nationality: "Thai", iso: "TH" },
  { country: "Vietnam", nationality: "Vietnamese", iso: "VN" },
  { country: "Other", nationality: "Other" },
];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function useProfileMutation(
  onSuccess: (p: InvestorProfile) => void,
  method: "POST" | "PATCH" = "PATCH",
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => {
      const reached =
        queryClient.getQueryData<{ investor_profile: InvestorProfile | null }>(["investorProfile"])
          ?.investor_profile?.onboarding_step ?? 0;
      const onboarding_step = Math.max(reached, Number(data.onboarding_step ?? 0));
      return api<{ investor_profile: InvestorProfile }>("/api/v1/investor_profile", {
        method,
        body: { investor_profile: { ...data, onboarding_step } },
      });
    },
    onSuccess: (res) => {
      queryClient.setQueryData(["investorProfile"], res);
      onSuccess(res.investor_profile);
    },
  });
}

function MutationError({ error }: { error: Error | null }) {
  if (!error) return null;
  return <p className="text-sm text-destructive">{error.message}</p>;
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

const SECTIONS: {
  key: SectionKey;
  label: string;
  icon: typeof UserIcon;
  description: Record<SectionStatus, string>;
}[] = [
  {
    key: "channel",
    label: "How You're Investing",
    icon: UsersIcon,
    description: {
      locked: "Complete the previous section first",
      not_started: "Tell us how you found Akula",
      in_progress: "In progress...",
      waiting: "",
      complete: "Completed",
    },
  },
  {
    key: "eligibility",
    label: "Eligibility",
    icon: ScaleIcon,
    description: {
      locked: "Complete the previous section first",
      not_started: "Confirm your accredited investor status",
      in_progress: "In progress...",
      waiting: "",
      complete: "Confirmed",
    },
  },
  {
    key: "personal_info",
    label: "Personal Information",
    icon: UserIcon,
    description: {
      locked: "Complete the previous section first",
      not_started: "Tell us about yourself",
      in_progress: "In progress...",
      waiting: "",
      complete: "Completed",
    },
  },
  {
    key: "kyc",
    label: "Verify Identity",
    icon: ShieldCheckIcon,
    description: {
      locked: "Complete the previous section first",
      not_started: "Provide documents for verification",
      in_progress: "Submitting...",
      waiting: "Awaiting verification...",
      complete: "Verified",
    },
  },
  {
    key: "nda",
    label: "Sign NDA",
    icon: FileSignatureIcon,
    description: {
      locked: "Available once your identity is verified",
      not_started: "Review and sign agreement",
      in_progress: "Signing...",
      waiting: "Awaiting confirmation...",
      complete: "Signed",
    },
  },
  {
    key: "consent",
    label: "Consent",
    icon: ClipboardCheckIcon,
    description: {
      locked: "Complete the previous section first",
      not_started: "Review and grant required consents",
      in_progress: "In progress...",
      waiting: "",
      complete: "Granted",
    },
  },
];

function StatusIcon({ status }: { status: SectionStatus }) {
  switch (status) {
    case "locked":
      return <LockIcon className="size-5 text-muted-foreground/40" />;
    case "complete":
      return <CheckCircle2Icon className="size-5 text-green-600" />;
    case "waiting":
      return <ClockIcon className="size-5 text-amber-500" />;
    case "in_progress":
      return <LoaderIcon className="size-5 animate-spin text-primary" />;
    default:
      return <CircleIcon className="size-5 text-muted-foreground/40" />;
  }
}

function StatusBadge({ status }: { status: SectionStatus }) {
  const styles: Record<SectionStatus, string> = {
    complete: "bg-green-500/10 text-green-700 border-green-500/20",
    waiting: "bg-amber-500/10 text-amber-700 border-amber-500/20",
    in_progress: "bg-primary/10 text-primary border-primary/20",
    not_started: "bg-muted text-muted-foreground border-border",
    locked: "bg-muted text-muted-foreground/60 border-border",
  };
  const labels: Record<SectionStatus, string> = {
    locked: "Locked",
    complete: "Done",
    waiting: "Waiting",
    in_progress: "In progress",
    not_started: "To do",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function Sidebar({
  statuses,
  activeSection,
  onSelect,
}: {
  statuses: Record<SectionKey, SectionStatus>;
  activeSection: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  return (
    <nav className="w-80 shrink-0 space-y-1">
      {SECTIONS.map((section) => {
        const status = statuses[section.key];
        const active = section.key === activeSection;
        const isLocked = status === "locked";
        const Icon = section.icon;
        return (
          <button
            key={section.key}
            type="button"
            disabled={isLocked}
            title={isLocked ? section.description.locked : undefined}
            onClick={() => onSelect(section.key)}
            className={cn(
              "flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors",
              isLocked && "cursor-not-allowed opacity-50",
              !isLocked && (active ? "bg-accent" : "hover:bg-accent/50"),
            )}
          >
            <div className="mt-0.5">
              <StatusIcon status={status} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon className="size-3.5 text-muted-foreground" />
                  {section.label}
                </span>
                <StatusBadge status={status} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{section.description[status]}</p>
            </div>
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Channel selection (direct vs. EAM-referred)
// ---------------------------------------------------------------------------

const CHANNEL_OPTIONS: { value: InvestmentChannel; title: string; body: string }[] = [
  {
    value: "direct",
    title: "Investing directly",
    body: "You're setting up your account on your own, without an adviser.",
  },
  {
    value: "eam_referred",
    title: "Referred by an adviser",
    body: "You were introduced by an external asset manager (EAM) or private bank RM.",
  },
];

function ChannelSection({
  profile,
  onComplete,
}: {
  profile: InvestorProfile | null;
  onComplete: (p: InvestorProfile) => void;
}) {
  const [channel, setChannel] = useState<InvestmentChannel | null>(profile?.channel ?? null);
  const [referralCode, setReferralCode] = useState(profile?.referral_code ?? "");
  const mutation = useProfileMutation(onComplete, profile ? "PATCH" : "POST");

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">How are you investing with Akula?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This determines your fee schedule and which consents apply to your account.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {CHANNEL_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setChannel(option.value)}
            className={cn(
              "rounded-lg border p-4 text-left transition-colors",
              channel === option.value ? "border-primary bg-primary/5" : "hover:bg-muted/50",
            )}
          >
            <p className="text-sm font-medium">{option.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{option.body}</p>
          </button>
        ))}
      </div>

      {channel === "eam_referred" && (
        <div className="mt-4 space-y-2">
          <Label htmlFor="referral-code">
            Referral code <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="referral-code"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
            placeholder="Provided by your adviser"
          />
        </div>
      )}

      <MutationError error={mutation.error as Error | null} />

      <Button
        className="mt-6 w-full"
        disabled={!channel || mutation.isPending}
        onClick={() =>
          mutation.mutate({
            channel,
            referral_code: channel === "eam_referred" ? referralCode.trim() || null : null,
          })
        }
      >
        {mutation.isPending ? "Saving..." : "Continue"}
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Eligibility gate
// ---------------------------------------------------------------------------

const ACCREDITATION_BASES = [
  {
    value: "income",
    label: "My income in the preceding 12 months was not less than SGD 300,000",
  },
  {
    value: "net_personal_assets",
    label: "My net personal assets exceed SGD 2,000,000 (or equivalent)",
  },
  {
    value: "net_financial_assets",
    label: "My net financial assets exceed SGD 1,000,000 (or equivalent)",
  },
];

function EligibilitySection({
  profile,
  onComplete,
}: {
  profile: InvestorProfile | null;
  onComplete: (p: InvestorProfile) => void;
}) {
  const [bases, setBases] = useState<string[]>(profile?.accreditation_basis ?? []);
  const [acknowledged, setAcknowledged] = useState(Boolean(profile?.eligibility_confirmed_at));
  const mutation = useProfileMutation(onComplete, profile ? "PATCH" : "POST");

  function toggleBasis(value: string) {
    setBases((prev) => (prev.includes(value) ? prev.filter((b) => b !== value) : [...prev, value]));
  }

  const valid = bases.length > 0 && acknowledged;

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Confirm your eligibility</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Akula deals are only offered to accredited investors under the Securities and Futures Act.
          Select every basis on which you qualify.
        </p>
      </div>

      <div className="space-y-2">
        {ACCREDITATION_BASES.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50"
          >
            <input
              type="checkbox"
              checked={bases.includes(option.value)}
              onChange={() => toggleBasis(option.value)}
              className="mt-0.5 size-4 rounded border-border"
            />
            <span className="text-sm">{option.label}</span>
          </label>
        ))}
      </div>

      <div className="mt-6 max-h-48 overflow-y-auto rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">First Schedule warning</p>
        <p>
          The offer or invitation is made in reliance of an exemption under Section 275 of the
          Securities and Futures Act 2001 which exempts an issuer from the requirement to lodge a
          prospectus with the Monetary Authority of Singapore prior to making an offer of
          securities. You should therefore consider carefully whether the investment is suitable for
          you, and you have the necessary knowledge and experience to understand the risks involved.
          Investments of this kind are illiquid, may result in the total loss of your capital, and
          are not covered by any investor compensation or deposit protection scheme. This offer is
          available only to persons who qualify as accredited investors, and by proceeding you
          confirm that you meet at least one of the bases selected above.
        </p>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 size-4 rounded border-border"
        />
        <span className="text-sm">
          I have read and understood the First Schedule warning above, and I confirm the
          accreditation basis I have selected is accurate.
        </span>
      </label>

      <MutationError error={mutation.error as Error | null} />

      <Button
        className="mt-6 w-full"
        disabled={!valid || mutation.isPending}
        onClick={() =>
          mutation.mutate({
            accreditation_basis: bases,
            eligibility_confirmed_at: new Date().toISOString(),
          })
        }
      >
        {mutation.isPending ? "Saving..." : "Continue"}
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Consent items
// ---------------------------------------------------------------------------

function ConsentSection({ onComplete }: { onComplete: () => void }) {
  const { data } = useConsents();
  const consents = data?.consents ?? [];
  const complete = consents.length > 0 && allRequiredGranted(consents);

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Consent</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant each required consent to finish setting up your account. You can withdraw most of
          these later from Account settings.
        </p>
      </div>

      <ConsentList mode="onboarding" onAllRequiredGranted={onComplete} />

      <Button className="mt-6 w-full" disabled={!complete} onClick={onComplete}>
        Continue to your dashboard
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Personal Information sub-steps
// ---------------------------------------------------------------------------

const MINIMUM_AGE = 18;

function NameStep({
  profile,
  onNext,
}: {
  profile: InvestorProfile | null;
  onNext: (p: InvestorProfile) => void;
}) {
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [preferredFirstName, setPreferredFirstName] = useState(profile?.preferred_first_name ?? "");
  const [middleName, setMiddleName] = useState(profile?.middle_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [nationality, setNationality] = useState(profile?.nationality ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(profile?.date_of_birth ?? "");
  // Date inputs are always YYYY-MM-DD, so a plain string comparison against the cutoff works.
  const maxDateOfBirth = formatISO(subYears(new Date(), MINIMUM_AGE), { representation: "date" });
  const dobTooYoung = dateOfBirth > maxDateOfBirth;

  const mutation = useProfileMutation(onNext, profile ? "PATCH" : "POST");
  const valid = firstName.trim() && lastName.trim() && nationality && dateOfBirth && !dobTooYoung;

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Your legal name</h2>
        <p className="text-sm text-muted-foreground">As it appears on your government-issued ID</p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({
            first_name: firstName,
            preferred_first_name: preferredFirstName || null,
            middle_name: middleName || null,
            last_name: lastName,
            nationality,
            date_of_birth: dateOfBirth,
            onboarding_step: 1,
          });
        }}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">Legal first name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferredFirstName">
              Preferred first name <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="preferredFirstName"
              value={preferredFirstName}
              onChange={(e) => setPreferredFirstName(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="middleName">
              Middle name or initial <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="middleName"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Legal last name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="nationality">Nationality</Label>
            <Select value={nationality} onValueChange={(val) => val && setNationality(val)}>
              <SelectTrigger id="nationality" className="w-full">
                <SelectValue placeholder="Select nationality" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.nationality} value={c.nationality}>
                    {c.nationality}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">Date of birth</Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={dateOfBirth}
              max={maxDateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              required
            />
            {dobTooYoung && (
              <p className="text-xs text-destructive">
                You must be at least {MINIMUM_AGE} years old.
              </p>
            )}
          </div>
        </div>
        <MutationError error={mutation.error} />
        <Button type="submit" className="w-full" disabled={!valid || mutation.isPending}>
          {mutation.isPending ? "Saving..." : "Continue"}
        </Button>
      </form>
    </>
  );
}

function ContactStep({
  profile,
  onNext,
  onBack,
}: {
  profile: InvestorProfile;
  onNext: (p: InvestorProfile) => void;
  onBack: () => void;
}) {
  const [country, setCountry] = useState(profile.country ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const mutation = useProfileMutation(onNext);

  // Residence only seeds the phone picker; the number itself may be from any country.
  const defaultCountry = COUNTRIES.find((c) => c.country === country)?.iso;
  const phoneValid = Boolean(phone) && isValidPhoneNumber(phone);
  const phoneHasDigits = (parsePhoneNumber(phone)?.nationalNumber ?? "").length > 0;
  const showPhoneError = phoneTouched && phoneHasDigits && !phoneValid;

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Contact information</h2>
        <p className="text-sm text-muted-foreground">Where are you based?</p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({ country, phone, onboarding_step: 2 });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="country">Country of residence</Label>
          <Select value={country} onValueChange={(val) => val && setCountry(val)}>
            <SelectTrigger id="country">
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.country} value={c.country}>
                  {c.country}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone number</Label>
          <PhoneInput
            key={defaultCountry ?? "intl"}
            id="phone"
            defaultCountry={defaultCountry}
            value={phone}
            onChange={(value) => setPhone(value ?? "")}
            onBlur={() => setPhoneTouched(true)}
            required
          />
          {showPhoneError && (
            <p className="text-xs text-destructive">Enter a valid phone number.</p>
          )}
        </div>
        <MutationError error={mutation.error} />
        <div className="flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
            Back
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={!country || !phoneValid || mutation.isPending}
          >
            {mutation.isPending ? "Saving..." : "Continue"}
          </Button>
        </div>
      </form>
    </>
  );
}

function InterestsStep({
  profile,
  onNext,
  onBack,
}: {
  profile: InvestorProfile;
  onNext: (p: InvestorProfile) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(profile.interested_industries ?? []);
  const mutation = useProfileMutation(onNext);

  function toggle(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Which industries interest you?</h2>
        <p className="text-sm text-muted-foreground">
          Select at least 3 to personalise your experience
        </p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({ interested_industries: selected, onboarding_step: 3 });
        }}
      >
        <div className="grid grid-cols-3 gap-2">
          {INDUSTRIES.map((industry) => (
            <button
              key={industry.value}
              type="button"
              onClick={() => toggle(industry.value)}
              className={`rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                selected.includes(industry.value)
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {industry.label}
            </button>
          ))}
        </div>
        <MutationError error={mutation.error} />
        <div className="flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
            Back
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={selected.length < 3 || mutation.isPending}
          >
            {mutation.isPending ? "Saving..." : "Continue"}
          </Button>
        </div>
      </form>
    </>
  );
}

function TicketSizeStep({
  profile,
  onNext,
  onBack,
}: {
  profile: InvestorProfile;
  onNext: (p: InvestorProfile) => void;
  onBack: () => void;
}) {
  const [ticketSize, setTicketSize] = useState(profile.typical_ticket_size ?? "");

  const mutation = useProfileMutation(onNext);

  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">What's your typical ticket size?</h2>
        <p className="text-sm text-muted-foreground">
          This helps us match you with the right opportunities
        </p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({ typical_ticket_size: ticketSize, onboarding_step: 4 });
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          {TICKET_SIZES.map((size) => (
            <button
              key={size.value}
              type="button"
              onClick={() => setTicketSize(size.value)}
              className={`rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                ticketSize === size.value
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {size.label}
            </button>
          ))}
        </div>
        <MutationError error={mutation.error} />
        <div className="flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" className="flex-1" disabled={!ticketSize || mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
// Personal Information section (wraps sub-steps)
// ---------------------------------------------------------------------------

function PersonalInfoSection({
  profile,
  onComplete,
}: {
  profile: InvestorProfile | null;
  onComplete: () => void;
}) {
  const step = profile ? Math.min(profile.onboarding_step, 3) : 0;
  const [subStep, setSubStep] = useState(step);

  function handleNext() {
    if (subStep < 3) {
      setSubStep(subStep + 1);
    } else {
      onComplete();
    }
  }

  return (
    <>
      <StepTracker
        className="mb-6"
        showLabels={false}
        steps={[0, 1, 2, 3].map((i) => ({ key: String(i), label: "" }))}
        getState={(key): StepState => (Number(key) <= subStep ? "done" : "upcoming")}
      />
      {subStep === 0 && <NameStep profile={profile} onNext={handleNext} />}
      {subStep === 1 && profile && (
        <ContactStep profile={profile} onNext={handleNext} onBack={() => setSubStep(0)} />
      )}
      {subStep === 2 && profile && (
        <InterestsStep profile={profile} onNext={handleNext} onBack={() => setSubStep(1)} />
      )}
      {subStep === 3 && profile && (
        <TicketSizeStep profile={profile} onNext={handleNext} onBack={() => setSubStep(2)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// NDA section
// ---------------------------------------------------------------------------

type SignResponse = {
  nda_status: "pending" | "signed";
  signing_url?: string;
};

const SIGNWELL_EMBED_SRC = "https://static.signwell.com/assets/embedded.js";

function useSignWellScript() {
  const [loaded, setLoaded] = useState(
    () => typeof window !== "undefined" && "SignWellEmbed" in window,
  );

  useEffect(() => {
    if (loaded) return;
    const existing = document.querySelector(`script[src="${SIGNWELL_EMBED_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => setLoaded(true));
      return;
    }
    const script = document.createElement("script");
    script.src = SIGNWELL_EMBED_SRC;
    script.async = true;
    script.onload = () => setLoaded(true);
    document.head.appendChild(script);
  }, [loaded]);

  return loaded;
}

function NdaPollingIndicator({ onConfirmed }: { onConfirmed: () => void }) {
  const onConfirmedRef = useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await api<{ nda_status: string }>("/api/v1/signwell/check_nda", {
          method: "POST",
        });
        if (res.nda_status === "signed") {
          onConfirmedRef.current();
          return true;
        }
      } catch {
        // ignore polling errors, will retry
      }
      return false;
    };

    // Initial check
    poll();

    const pollInterval = setInterval(async () => {
      const done = await poll();
      if (done) clearInterval(pollInterval);
    }, 20000);

    return () => clearInterval(pollInterval);
  }, []);

  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function NdaSection({
  ndaStatus,
  onSigned,
}: {
  ndaStatus: "not_started" | "pending" | "signed";
  onSigned: () => void;
}) {
  const { user } = useAuth();
  const [signed, setSigned] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);
  // Bumped by Retry so the embed reopens even when the refetched document is unchanged.
  const [retryKey, setRetryKey] = useState(0);
  const embedRef = useRef<unknown>(null);
  const scriptReady = useSignWellScript();
  const containerId = "signwell-embed";

  // The backend creates the document on first call and returns the same one after,
  // so this is a plain query: concurrent mounts are deduplicated and the URL is cached.
  const session = useQuery({
    queryKey: ["ndaSigningSession", user?.id],
    queryFn: () => api<SignResponse>("/api/v1/signwell/nda_session", { method: "POST" }),
    enabled: ndaStatus !== "signed",
    staleTime: Infinity,
    // Forget the session when the step unmounts, so a later visit after signing has no
    // cached link to reopen (SignWell would show its "document complete" dialog for it).
    gcTime: 0,
    retry: false,
  });

  // Hide a stale message while a retry is in flight so it never sits beside the spinner.
  const error = session.isFetching ? null : (embedError ?? session.error?.message ?? null);

  // Open embed once URL + script are ready
  useEffect(() => {
    if (!scriptReady || !session.data?.signing_url || embedRef.current) return;

    const SignWellEmbed = (window as unknown as Record<string, unknown>)["SignWellEmbed"] as new (
      opts: Record<string, unknown>,
    ) => { open: () => void };

    const embed = new SignWellEmbed({
      url: session.data.signing_url,
      containerId,
      allowClose: false,
      events: {
        completed: () => setSigned(true),
        error: () => setEmbedError("Something went wrong during signing."),
      },
    });

    embedRef.current = embed;
    embed.open();
  }, [scriptReady, session.data, retryKey]);

  // Already signed — show confirmation
  if (ndaStatus === "signed") {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-green-500/10">
          <CheckCircle2Icon className="size-6 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold">Agreement signed</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your non-disclosure agreement has been confirmed.
        </p>
      </div>
    );
  }

  // Pending — poll SignWell API for confirmation
  // Signed in this session, or the backend found the stored document already completed:
  // poll check_nda, which records the signature and moves the flow on.
  if (signed || session.data?.nda_status === "signed") {
    return (
      <NdaPollingIndicator
        onConfirmed={() => {
          onSigned();
        }}
      />
    );
  }

  // No live SignWell account is reachable in this environment — offer a
  // simulated signature instead of trying to load a real hosted iframe.
  if (isMocking) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-xl font-semibold">Sign your agreement</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          No live e-signature provider is connected in this environment. Simulate signing to
          continue.
        </p>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <Button className="mt-6" onClick={() => setSigned(true)} disabled={session.isFetching}>
          Simulate signing
        </Button>
      </div>
    );
  }

  // Signing flow
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Sign your agreement</h2>
        <p className="text-sm text-muted-foreground">
          Review and sign the non-disclosure agreement to continue.
        </p>
      </div>

      <div className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {(session.isFetching || (!scriptReady && !error)) && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Preparing your agreement...</p>
          </div>
        )}

        <div
          id={containerId}
          className="overflow-hidden rounded-lg [&_iframe]:!h-[70vh] [&_iframe]:!min-h-[500px]"
          style={{
            minHeight: session.data && !signed ? "70vh" : 0,
          }}
        />

        {error && (
          <Button
            onClick={() => {
              setEmbedError(null);
              embedRef.current = null;
              setRetryKey((k) => k + 1);
              session.refetch();
            }}
          >
            Retry
          </Button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// KYC section (Persona embedded flow)
// ---------------------------------------------------------------------------

type PersonaConfig = {
  template_id: string;
  environment_id: string;
  reference_id: string;
  inquiry_id: string | null;
};

function KycSection({
  kycStatus,
  onComplete,
  onContinue,
}: {
  kycStatus: string;
  onComplete: () => void;
  onContinue: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<InstanceType<typeof PersonaClient> | null>(null);

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["personaConfig"],
    queryFn: () => api<PersonaConfig>("/api/v1/persona/config"),
    enabled: kycStatus === "not_started",
  });

  const completeMutation = useMutation({
    mutationFn: (inquiryId: string) =>
      api<{ success: boolean }>("/api/v1/persona/complete", {
        method: "POST",
        body: { inquiry_id: inquiryId },
      }),
    onSuccess: () => {
      setSubmitted(true);
      onComplete();
    },
    onError: (err: Error) => setError(err.message),
  });

  useEffect(() => {
    if (!config || clientRef.current || kycStatus !== "not_started") return;
    if (!containerRef.current) return;

    const client = new PersonaClient({
      templateId: config.template_id,
      environmentId: config.environment_id,
      referenceId: config.reference_id,
      inquiryId: config.inquiry_id ?? undefined,
      parent: containerRef.current,
      onComplete: ({ inquiryId }) => {
        completeMutation.mutate(inquiryId);
      },
      onCancel: () => {
        setError("Verification was cancelled.");
      },
      onError: (err) => {
        setError(err.message ?? "Verification failed. Please try again.");
      },
    });

    clientRef.current = client;
    client.open();

    return () => {
      try {
        client.destroy();
      } catch {
        // Persona may throw if DOM nodes were already removed
      }
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, kycStatus, retryKey]);

  const retry = () => {
    setError(null);
    setRetryKey((k) => k + 1);
  };

  // Verified
  if (kycStatus === "approved") {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-green-500/10">
          <CheckCircle2Icon className="size-6 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold">Identity verified</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your identity has been successfully verified.
        </p>
        <Button className="mt-6" onClick={onContinue}>
          Continue to Sign NDA
        </Button>
      </div>
    );
  }

  // Pending review (submitted or webhook-driven)
  if (kycStatus === "pending" || submitted) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-amber-500/10">
          <ClockIcon className="size-6 text-amber-600" />
        </div>
        <h2 className="text-xl font-semibold">Verification in progress</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          We're reviewing your identity documents. This usually takes a few minutes. We'll email you
          as soon as it's done, and you can then come back to sign the NDA.
        </p>
      </div>
    );
  }

  // Failed
  if (kycStatus === "failed") {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <ShieldCheckIcon className="size-6 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">Verification unsuccessful</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          We were unable to verify your identity. Please contact support for assistance.
        </p>
      </div>
    );
  }

  // No live Persona account is reachable in this environment — offer a
  // simulated verification instead of trying to load the real embed.
  if (isMocking) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-xl font-semibold">Identity Verification</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          No live KYC provider is connected in this environment. Simulate verification to continue.
        </p>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <Button
          className="mt-6"
          onClick={() => completeMutation.mutate("mock-inquiry")}
          disabled={completeMutation.isPending}
        >
          Simulate verification
        </Button>
      </div>
    );
  }

  // Not started — show Persona embed
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Identity Verification</h2>
        <p className="text-sm text-muted-foreground">
          Verify your identity to complete account setup.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      )}

      {configLoading && (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Preparing verification...</p>
        </div>
      )}

      <div
        ref={containerRef}
        className="overflow-hidden rounded-lg [&_iframe]:!min-h-[500px]"
        style={{ minHeight: config ? "70vh" : 0 }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function deriveSectionStatuses(
  profile: InvestorProfile | null,
  ndaStatus: "not_started" | "pending" | "signed",
  kycStatus: string,
  consentsComplete: boolean,
): Record<SectionKey, SectionStatus> {
  const channel: SectionStatus = profile?.channel ? "complete" : "not_started";

  let eligibility: SectionStatus = channel === "complete" ? "not_started" : "locked";
  if (profile?.eligibility_confirmed_at) eligibility = "complete";

  let personalInfo: SectionStatus = eligibility === "complete" ? "not_started" : "locked";
  if (profile && eligibility === "complete") {
    personalInfo = profile.onboarding_step >= 4 ? "complete" : "in_progress";
  }

  // Each later section stays locked until the one before it is complete.
  let kyc: SectionStatus = personalInfo === "complete" ? "not_started" : "locked";
  if (kycStatus === "approved") kyc = "complete";
  else if (kycStatus === "pending") kyc = "waiting";

  // The NDA is only signed by a verified identity: it stays locked until Persona approves,
  // including while verification is pending or has failed.
  let nda: SectionStatus = kyc === "complete" ? "not_started" : "locked";
  // The backend reports "pending" as soon as a document exists, i.e. while the investor is
  // still signing in the embed, so it is shown as in progress rather than awaiting confirmation.
  if (ndaStatus === "signed") nda = "complete";
  else if (ndaStatus === "pending") nda = "in_progress";

  const consent: SectionStatus =
    nda !== "complete" ? "locked" : consentsComplete ? "complete" : "not_started";

  return { channel, eligibility, personal_info: personalInfo, nda, kyc, consent };
}

const SECTION_KEYS: SectionKey[] = [
  "channel",
  "eligibility",
  "personal_info",
  "kyc",
  "nda",
  "consent",
];

function isValidSection(s: string | undefined): s is SectionKey {
  return SECTION_KEYS.includes(s as SectionKey);
}

// The requested section if it is open, otherwise the furthest section the investor may see.
function resolveSection(
  requested: string | undefined,
  statuses: Record<SectionKey, SectionStatus>,
): SectionKey {
  if (isValidSection(requested) && statuses[requested] !== "locked") return requested;
  return SECTION_KEYS.filter((key) => statuses[key] !== "locked").at(-1) ?? "personal_info";
}

export default function OnboardingPage() {
  const { refreshUser, user, logout } = useAuth();
  const navigate = useNavigate();
  const { section: sectionParam } = useParams<{ section?: string }>();

  function goToSection(key: SectionKey) {
    navigate(`/onboarding/${key}`, { replace: true });
  }

  // Only investors onboard
  const roleHome = landingPathForRole(user);
  const onboards = roleHome === "/onboarding";

  const { data, isLoading } = useQuery({
    queryKey: ["investorProfile"],
    queryFn: () => api<{ investor_profile: InvestorProfile | null }>("/api/v1/investor_profile"),
    enabled: onboards,
  });

  // KYC polling (webhook-driven, just refresh user)
  const kycPending = user?.kyc_status === "pending";
  const refreshRef = useRef(refreshUser);
  refreshRef.current = refreshUser;

  useEffect(() => {
    if (!kycPending) return;
    const id = setInterval(() => {
      refreshRef.current();
    }, 5000);
    return () => clearInterval(id);
  }, [kycPending]);

  const { data: consentsData } = useConsents();
  const consentsComplete = allRequiredGranted(consentsData?.consents ?? []);

  const ndaStatus = user?.nda_status ?? "not_started";
  const kycStatus = user?.kyc_status ?? "not_started";
  const profile = data?.investor_profile ?? null;
  const statuses = deriveSectionStatuses(profile, ndaStatus, kycStatus, consentsComplete);
  const activeSection = resolveSection(sectionParam, statuses);

  // Onboarding completion is derived server-side from channel + eligibility +
  // personal info + KYC + NDA + required consents (same pattern NDA/KYC
  // already use) — refreshing the user is enough once consents are granted.
  async function completeOnboarding() {
    await refreshUser();
    navigate("/dashboard", { replace: true });
  }

  if (user?.onboarding_completed) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!onboards) {
    return <Navigate to={roleHome} replace />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // Keep the URL canonical: /onboarding and any locked section resolve to the section shown.
  if (sectionParam !== activeSection) {
    return <Navigate to={`/onboarding/${activeSection}`} replace />;
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <div className="flex flex-col border-r bg-muted/30 px-4 py-8">
        <div className="mb-6 px-3">
          <h1 className="text-lg font-bold tracking-tight">Account Setup</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Complete each section to get started
          </p>
        </div>
        <Sidebar statuses={statuses} activeSection={activeSection} onSelect={goToSection} />
        <div className="mt-auto space-y-3 px-3">
          <button
            type="button"
            onClick={async () => {
              await api("/api/v1/onboarding/skip", { method: "POST" });
              await refreshUser();
              navigate("/dashboard", { replace: true });
            }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <FastForwardIcon className="size-3.5" />
            Skip onboarding
          </button>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate("/login", { replace: true });
            }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOutIcon className="size-3.5" />
            Log out
          </button>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LockIcon className="size-3.5" />
            Your information is always secure.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 items-start justify-center overflow-y-auto px-8 py-12">
        <div
          className={`w-full ${
            activeSection === "nda" && ndaStatus === "not_started" ? "max-w-4xl" : "max-w-xl"
          }`}
        >
          {activeSection === "channel" && (
            <ChannelSection
              profile={profile}
              onComplete={() => {
                refreshUser();
                goToSection("eligibility");
              }}
            />
          )}
          {activeSection === "eligibility" && (
            <EligibilitySection
              profile={profile}
              onComplete={() => {
                refreshUser();
                goToSection("personal_info");
              }}
            />
          )}
          {activeSection === "personal_info" && (
            <PersonalInfoSection
              profile={profile}
              onComplete={() => {
                refreshUser();
                goToSection("kyc");
              }}
            />
          )}
          {activeSection === "kyc" && (
            <KycSection
              kycStatus={user?.kyc_status ?? "not_started"}
              onComplete={() => refreshUser()}
              onContinue={() => goToSection("nda")}
            />
          )}
          {activeSection === "nda" && (
            <NdaSection
              ndaStatus={ndaStatus}
              onSigned={() => {
                refreshUser();
                goToSection("consent");
              }}
            />
          )}
          {activeSection === "consent" && <ConsentSection onComplete={completeOnboarding} />}
        </div>
      </div>
    </div>
  );
}
