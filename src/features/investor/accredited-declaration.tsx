import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useActiveProfile } from "@/contexts/active-profile-context";
import { api } from "@/lib/api";
import { landingPathForRole } from "@/lib/roles";
import {
  entersInvestorPortal,
  hasDeclared,
  markDeclared,
  setLoginNotice,
} from "@/lib/accredited-investor";
import {
  EVIDENCE_RULES,
  QUALIFYING_OPTIONS,
  evidenceLabel,
  latestByKind,
  missingEvidence,
  optionFor,
} from "@/lib/accredited-evidence";
import {
  EvidenceRow,
  SampleDocumentsButton,
  useOnboardingDocuments,
} from "@/features/investor/evidence-upload";
import { Button } from "@/components/ui/button";
import DisclaimerFooter from "@/components/disclaimer-footer";
import { Checkbox } from "@/components/ui/checkbox";

const REASONS = [
  {
    title: "Only accredited investors can be offered these deals.",
    body: "Opportunities on this platform are private offers made under exemptions in the Securities and Futures Act, such as section 275, so no prospectus is registered with the Monetary Authority of Singapore. Those exemptions are available only for offers to accredited investors and certain other persons. LUCA must be satisfied that you qualify before it shows you an offering.",
  },
  {
    title: "You give up some investor protections.",
    body: "An accredited investor is treated as better able to assess risk and bear loss. You will not receive a registered prospectus, and some disclosure and conduct protections given to retail investors do not apply to you. Private investments are illiquid, can lose all of their value and are not covered by an investor compensation scheme.",
  },
  {
    title: "Your consent is yours to withdraw.",
    body: "Under MAS rules an eligible individual is treated as an accredited investor only if they have agreed to be, in writing. You may withdraw your consent at any time by writing to LUCA through Messages. LUCA will then treat you as a retail investor and you will no longer be able to access new offers.",
  },
  {
    title: "We check what you tell us.",
    body: "LUCA relies on your declaration and documents. We review them, may ask for more at any time, and ask for fresh copies every 6 months. Giving false or misleading information may have legal consequences, and we may suspend your access.",
  },
];

export default function AccreditedDeclarationPage() {
  const { user, logout } = useAuth();
  const { activeProfile } = useActiveProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  // The investor picks exactly one way they qualify. Until they do, their last choice is offered.
  const [picked, setPicked] = useState<string | null>(null);
  const [declared, setDeclared] = useState(false);
  const [consented, setConsented] = useState(false);

  const { data: last } = useQuery({
    queryKey: ["accreditedDeclaration"],
    queryFn: () =>
      api<{ declaration: { basis: string; declared_at: string } | null }>(
        "/api/v1/investor/declaration",
      ),
    enabled: Boolean(user),
  });
  const { data: uploaded } = useOnboardingDocuments();

  const chosen = picked ?? last?.declaration?.basis ?? null;
  const option = optionFor(chosen);
  const documents = uploaded?.documents ?? [];
  const latest = latestByKind(documents);
  const missing = missingEvidence(chosen, documents);

  const mutation = useMutation({
    mutationFn: () =>
      api("/api/v1/investor/declaration", {
        method: "POST",
        body: { basis: [chosen], declared, consented },
      }),
    onSuccess: () => {
      if (!user) return;
      // Whatever is read next, such as the onboarding step, must see this declaration.
      queryClient.invalidateQueries({ queryKey: ["accreditedDeclaration"] });
      markDeclared(user.id);
      navigate(from ?? landingPathForRole(user, activeProfile), { replace: true });
    },
  });

  // Staff and advisers never see this page; someone who already declared this session carries on.
  // Someone whose proof has lapsed is sent back here to renew it, even in the same session.
  const renewing = new URLSearchParams(location.search).get("renew") === "1";
  if (!user || !entersInvestorPortal(user) || (hasDeclared(user.id) && !renewing)) {
    return <Navigate to={user ? landingPathForRole(user, activeProfile) : "/login"} replace />;
  }

  const ready = Boolean(option) && missing.length === 0 && declared && consented;
  const blocker = !option
    ? "Choose how you qualify to see what to upload."
    : missing.length > 0
      ? `Upload ${missing.map((kind) => evidenceLabel(kind).toLowerCase()).join(", ")} to continue.`
      : !declared || !consented
        ? "Tick both confirmations to continue."
        : "Everything is in place.";

  async function notAccredited() {
    setLoginNotice("Access to the investor portal is limited to accredited investors.");
    await logout();
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f7f8] text-[#193548]">
      <header className="flex items-center justify-between border-b border-[#dce4e8] px-6 py-5 sm:px-10">
        <span className="text-[13px] font-semibold tracking-[.2em]">AKULA · PRIVATE MARKETS</span>
        <span className="flex items-center gap-4 text-xs text-[#718896]">
          <span className="hidden sm:inline">{user.email}</span>
          <button type="button" onClick={() => logout()} className="text-[#285f80] hover:underline">
            Sign out
          </button>
        </span>
      </header>

      <main className="flex-1 px-6 py-12 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-[11px] font-semibold tracking-[.18em] text-[#5a7f92]">
            INVESTOR PORTAL · ACCESS DECLARATION
          </p>
          <h1 className="mt-3 text-3xl font-medium tracking-[-.03em] sm:text-4xl">
            Accredited investor declaration
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#587180]">
            The LUCA investor portal is open only to accredited investors, as defined under
            Singapore law. Read what this means for you, then tell us how you qualify and upload
            your proof.
          </p>

          {renewing && (
            <p className="mt-6 max-w-3xl border-l-2 border-amber-600 bg-amber-500/5 px-4 py-3 text-sm leading-6">
              Your accreditation proof has expired. Upload current documents and confirm your
              declaration again to continue.
            </p>
          )}

          <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-16">
            {/* The warning: what the term means and what the investor gives up */}
            <div className="space-y-12 lg:sticky lg:top-8 lg:self-start">
              <section aria-labelledby="who">
                <h2 id="who" className="text-lg font-medium">
                  Who is an accredited investor in Singapore?
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#587180]">
                  Under section 4A of the Securities and Futures Act 2001, an individual is an
                  accredited investor if they have{" "}
                  <strong className="font-medium text-[#193548]">
                    net personal assets above S$2,000,000
                  </strong>{" "}
                  (their primary residence counts for no more than S$1,000,000 of this),{" "}
                  <strong className="font-medium text-[#193548]">
                    net financial assets above S$1,000,000
                  </strong>
                  , or{" "}
                  <strong className="font-medium text-[#193548]">
                    income of at least S$300,000
                  </strong>{" "}
                  in the last 12 months. A company with net assets above S$10,000,000 also
                  qualifies. Each amount may be met in an equivalent foreign currency. You only need
                  to meet one.
                </p>
              </section>

              <section aria-labelledby="why">
                <h2 id="why" className="text-lg font-medium">
                  What you should know before you declare
                </h2>
                <div className="mt-4 space-y-5">
                  {REASONS.map((reason) => (
                    <p key={reason.title} className="text-sm leading-6 text-[#587180]">
                      <strong className="font-medium text-[#193548]">{reason.title}</strong>{" "}
                      {reason.body}
                    </p>
                  ))}
                </div>
              </section>
            </div>

            {/* The function: choose one way to qualify, upload its proof, confirm */}
            <section
              aria-labelledby="verify"
              className="space-y-8 lg:border-l lg:border-[#dce4e8] lg:pl-12"
            >
              <div>
                <h2 id="verify" className="text-lg font-medium">
                  Verify your status
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#587180]">
                  Choose the one way you qualify. The documents you need depend on your choice, and
                  you cannot continue until they are uploaded.
                </p>
              </div>

              <fieldset>
                <legend className="flex items-center gap-2.5 text-sm font-medium">
                  <StepNumber n={1} /> How do you qualify?
                </legend>
                <div
                  role="radiogroup"
                  aria-label="How you qualify"
                  className="mt-3 divide-y divide-[#dce4e8] border-y border-[#dce4e8]"
                >
                  {QUALIFYING_OPTIONS.map((item) => {
                    const selected = chosen === item.value;
                    return (
                      <label
                        key={item.value}
                        className={`flex cursor-pointer items-start gap-3 px-2 py-3.5 ${selected ? "bg-[#e9f0f4]" : "hover:bg-[#eef3f6]"}`}
                      >
                        <input
                          type="radio"
                          name="basis"
                          value={item.value}
                          checked={selected}
                          onChange={() => setPicked(item.value)}
                          className="mt-1 size-4 accent-[#285f80]"
                        />
                        <span className="text-sm leading-6">
                          <span className="font-medium">{item.title}</span>
                          <span className="text-[#285f80]"> · {item.test}</span>
                          <span className="block text-[#587180]">{item.note}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {last?.declaration && picked === null && (
                  <p className="mt-2 text-xs text-[#718896]">
                    This is the choice you made last time. Change it if it no longer applies.
                  </p>
                )}
              </fieldset>

              <div>
                <h3 className="flex items-center gap-2.5 text-sm font-medium">
                  <StepNumber n={2} /> Upload your proof
                </h3>
                {option ? (
                  <>
                    <p className="mt-1 text-sm text-[#587180]">
                      For {option.title.toLowerCase()}: {option.evidence.length - missing.length} of{" "}
                      {option.evidence.length} on file.
                    </p>
                    <ul className="mt-2 divide-y divide-[#dce4e8] border-t border-[#dce4e8]">
                      {option.evidence.map((kind) => (
                        <EvidenceRow key={kind} kind={kind} uploaded={latest.get(kind)} />
                      ))}
                    </ul>
                    <div className="mt-3">
                      <SampleDocumentsButton kinds={missing} />
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#718896]">
                      <li>
                        Documents must be dated within the last {EVIDENCE_RULES.maxAgeMonths}{" "}
                        months, in your own name, with every page.
                      </li>
                      <li>
                        PDF, PNG or JPEG, up to {EVIDENCE_RULES.maxFileMb} MB each. LUCA uses them
                        only to verify your status.
                      </li>
                      <li>
                        We keep your proof on file for {EVIDENCE_RULES.validForMonths} months, so
                        you will not need to upload it every time you sign in.
                      </li>
                    </ul>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-[#718896]">
                    Choose how you qualify above and the documents you need will appear here.
                  </p>
                )}
              </div>

              <div>
                <h3 className="flex items-center gap-2.5 text-sm font-medium">
                  <StepNumber n={3} /> Confirm
                </h3>
                <div className="mt-3 space-y-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <Checkbox
                      checked={declared}
                      onChange={(e) => setDeclared(e.target.checked)}
                      className="mt-0.5 accent-[#285f80]"
                    />
                    <span className="text-sm leading-6">
                      I declare that I am an accredited investor under section 4A of the Securities
                      and Futures Act 2001 on the basis I chose. My declaration and documents are
                      true, complete and my own, and I will tell LUCA promptly if my circumstances
                      change.
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3">
                    <Checkbox
                      checked={consented}
                      onChange={(e) => setConsented(e.target.checked)}
                      className="mt-0.5 accent-[#285f80]"
                    />
                    <span className="text-sm leading-6">
                      I consent to being treated as an accredited investor. I understand that
                      certain regulatory safeguards for retail investors will not apply to me, and
                      that I may withdraw this consent at any time.
                    </span>
                  </label>
                </div>

                {mutation.error && (
                  <p role="alert" className="mt-4 text-sm text-destructive">
                    {(mutation.error as Error).message}
                  </p>
                )}

                <p className="mt-6 text-sm text-[#587180]" aria-live="polite">
                  {blocker}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Button
                    size="lg"
                    className="bg-[#285f80] px-6 text-white hover:bg-[#193f56]"
                    disabled={!ready || mutation.isPending}
                    onClick={() => mutation.mutate()}
                  >
                    {mutation.isPending
                      ? "Recording declaration..."
                      : "Confirm and enter the portal"}
                  </Button>
                  <button
                    type="button"
                    onClick={notAccredited}
                    className="text-sm text-[#587180] hover:text-[#193548] hover:underline"
                  >
                    I am not an accredited investor
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#718896]">
                  Your declaration is recorded with the date and time and is visible to LUCA.
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>

      <DisclaimerFooter className="border-[#dce4e8]" />
      <footer className="border-t border-[#dce4e8] px-6 py-5 text-xs leading-5 text-[#718896] sm:px-10">
        Akula Labs Pte. Ltd. · Singapore. Draft wording for LUCA Compliance to review before launch.
        Statutory basis: Securities and Futures Act 2001, s 4A(1)(a); Securities and Futures (Offers
        of Investments) (Securities and Securities-based Derivatives Contracts) Regulations 2018.
      </footer>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#dfe8ed] text-[11px] font-semibold text-[#285f80] tabular-nums">
      {n}
    </span>
  );
}
