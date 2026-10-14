import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useActiveProfile } from "@/contexts/active-profile-context";
import { api } from "@/lib/api";
import { landingPathForRole } from "@/lib/roles";
import {
  ACCREDITED_BASES,
  entersInvestorPortal,
  hasDeclared,
  markDeclared,
  setLoginNotice,
} from "@/lib/accredited-investor";
import { Button } from "@/components/ui/button";
import DisclaimerFooter from "@/components/disclaimer-footer";
import { Checkbox } from "@/components/ui/checkbox";

const TESTS = [
  {
    measure: "Net personal assets",
    threshold: "Above S$2,000,000",
    note: "No more than S$1,000,000 of this may be the value of your primary residence.",
  },
  {
    measure: "Net financial assets",
    threshold: "Above S$1,000,000",
    note: "Deposits and investments, less any related liabilities.",
  },
  {
    measure: "Income",
    threshold: "At least S$300,000",
    note: "Earned in the preceding 12 months.",
  },
];

const REASONS = [
  {
    title: "The law limits who can be offered these investments.",
    body: "Opportunities on this platform are private offers made under exemptions in the Securities and Futures Act, such as section 275, so no prospectus is registered with the Monetary Authority of Singapore. Those exemptions are available only for offers to accredited investors and certain other persons. LUCA must be satisfied that you qualify before it shows you an offering, and may ask for evidence of your status.",
  },
  {
    title: "Accredited investors have fewer regulatory safeguards.",
    body: "An accredited investor is treated as better able to assess risk and bear loss. You will not receive a registered prospectus, and certain disclosure and conduct protections given to retail investors do not apply to you. Private investments are illiquid, can lose all of their value and are not covered by an investor compensation scheme.",
  },
  {
    title: "Your consent is required, and you can withdraw it.",
    body: "Under MAS rules an eligible individual is treated as an accredited investor only if they have agreed to be, in writing. You may withdraw your consent at any time by writing to LUCA through Messages. LUCA will then treat you as a retail investor and you will no longer be able to access new offers.",
  },
];

export default function AccreditedDeclarationPage() {
  const { user, logout } = useAuth();
  const { activeProfile } = useActiveProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [bases, setBases] = useState<string[]>([]);
  const [declared, setDeclared] = useState(false);
  const [consented, setConsented] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api("/api/v1/investor/declaration", {
        method: "POST",
        body: { basis: bases, declared, consented },
      }),
    onSuccess: () => {
      if (!user) return;
      markDeclared(user.id);
      navigate(from ?? landingPathForRole(user, activeProfile), { replace: true });
    },
  });

  // Staff and advisers never see this page; someone who already declared this session carries on.
  if (!user || !entersInvestorPortal(user) || hasDeclared(user.id)) {
    return <Navigate to={user ? landingPathForRole(user, activeProfile) : "/login"} replace />;
  }

  const ready = bases.length > 0 && declared && consented;
  const toggle = (value: string) =>
    setBases((current) =>
      current.includes(value) ? current.filter((b) => b !== value) : [...current, value],
    );

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
        <div className="mx-auto max-w-2xl">
          <p className="text-[11px] font-semibold tracking-[.18em] text-[#5a7f92]">
            INVESTOR PORTAL · ACCESS DECLARATION
          </p>
          <h1 className="mt-3 text-3xl font-medium tracking-[-.03em] sm:text-4xl">
            Accredited investor declaration
          </h1>
          <p className="mt-4 text-base leading-7 text-[#587180]">
            The LUCA investor portal is open only to accredited investors, as defined under
            Singapore law. Please read the information below and make your declaration before you
            continue.
          </p>

          <section className="mt-12" aria-labelledby="who">
            <h2 id="who" className="text-lg font-medium">
              Who is an accredited investor in Singapore?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#587180]">
              Under section 4A of the Securities and Futures Act 2001, an individual is an
              accredited investor if they meet <strong className="text-[#193548]">any one</strong>{" "}
              of the following tests.
            </p>
            <dl className="mt-4 divide-y divide-[#dce4e8] border-y border-[#dce4e8]">
              {TESTS.map((test) => (
                <div
                  key={test.measure}
                  className="grid gap-1 py-3.5 sm:grid-cols-[10rem_11rem_1fr] sm:gap-6"
                >
                  <dt className="text-sm font-medium">{test.measure}</dt>
                  <dd className="text-sm font-medium text-[#285f80] tabular-nums">
                    {test.threshold}
                  </dd>
                  <dd className="text-sm leading-6 text-[#587180]">{test.note}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm leading-6 text-[#587180]">
              A company with net assets above S$10,000,000 also qualifies. Each amount may be met in
              an equivalent foreign currency.
            </p>
          </section>

          <section className="mt-12" aria-labelledby="why">
            <h2 id="why" className="text-lg font-medium">
              Why we ask you to declare
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

          <section className="mt-12" aria-labelledby="declaration">
            <h2 id="declaration" className="text-lg font-medium">
              Your declaration
            </h2>
            <fieldset className="mt-3">
              <legend className="text-sm text-[#587180]">
                I qualify as an accredited investor because (select all that apply):
              </legend>
              <div className="mt-3 space-y-3">
                {ACCREDITED_BASES.map((option) => (
                  <label key={option.value} className="flex cursor-pointer items-start gap-3">
                    <Checkbox
                      checked={bases.includes(option.value)}
                      onChange={() => toggle(option.value)}
                      className="mt-0.5 accent-[#285f80]"
                    />
                    <span className="text-sm leading-6">{option.declaration}.</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-6 space-y-3 border-t border-[#dce4e8] pt-6">
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={declared}
                  onChange={(e) => setDeclared(e.target.checked)}
                  className="mt-0.5 accent-[#285f80]"
                />
                <span className="text-sm leading-6">
                  I declare that I am an accredited investor under section 4A of the Securities and
                  Futures Act 2001 on the basis selected above, that this declaration is true and
                  complete, and that I will tell LUCA promptly if my circumstances change.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={consented}
                  onChange={(e) => setConsented(e.target.checked)}
                  className="mt-0.5 accent-[#285f80]"
                />
                <span className="text-sm leading-6">
                  I consent to being treated as an accredited investor. I understand that certain
                  regulatory safeguards for retail investors will not apply to me, and that I may
                  withdraw this consent at any time.
                </span>
              </label>
            </div>

            {mutation.error && (
              <p className="mt-4 text-sm text-destructive">{(mutation.error as Error).message}</p>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Button
                size="lg"
                className="bg-[#285f80] px-6 text-white hover:bg-[#193f56]"
                disabled={!ready || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Recording declaration..." : "Confirm and enter the portal"}
              </Button>
              <button
                type="button"
                onClick={notAccredited}
                className="text-sm text-[#587180] hover:text-[#193548] hover:underline"
              >
                I am not an accredited investor
              </button>
            </div>
            <p className="mt-4 text-xs leading-5 text-[#718896]">
              Your declaration is recorded with the date and time and is visible to LUCA.
            </p>
          </section>
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
