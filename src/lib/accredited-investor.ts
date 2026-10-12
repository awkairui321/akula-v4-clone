/**
 * Singapore accredited investor (AI) declaration.
 *
 * Definition: Securities and Futures Act 2001, s 4A(1)(a), and the Securities and Futures
 * (Offers of Investments) (Securities and Securities-based Derivatives Contracts) Regulations 2018.
 * Under MAS's opt-in regime an eligible person is treated as an AI only after consenting in writing.
 */

export type AccreditedBasis = {
  value: string;
  /** Short name used in the definition and in the audit trail. */
  label: string;
  /** The test, as the investor declares it. */
  declaration: string;
};

export const ACCREDITED_BASES: AccreditedBasis[] = [
  {
    value: "net_personal_assets",
    label: "Net personal assets above S$2,000,000",
    declaration:
      "My net personal assets exceed S$2,000,000 (or the equivalent in foreign currency), of which no more than S$1,000,000 is the value of my primary residence",
  },
  {
    value: "net_financial_assets",
    label: "Net financial assets above S$1,000,000",
    declaration:
      "My net financial assets, after deducting related liabilities, exceed S$1,000,000 (or the equivalent in foreign currency)",
  },
  {
    value: "income",
    label: "Income of at least S$300,000",
    declaration:
      "My income in the preceding 12 months was not less than S$300,000 (or the equivalent in foreign currency)",
  },
  {
    value: "entity_net_assets",
    label: "Company with net assets above S$10,000,000",
    declaration:
      "I am investing through a company whose net assets exceed S$10,000,000 (or the equivalent in foreign currency)",
  },
];

export const labelForBasis = (value: string) =>
  ACCREDITED_BASES.find((b) => b.value === value)?.label ?? value;

const STAFF_ROLES = ["luca", "investment_team", "rm", "ops"];

/** Whether this signed-in user is entering the investor portal (and so must declare). */
export function entersInvestorPortal(
  user: { role: string; has_investor_profile?: boolean } | null | undefined,
): boolean {
  return Boolean(user?.has_investor_profile && !STAFF_ROLES.includes(user.role));
}

// The declaration is made each time someone enters the investor portal from sign-in, so it is
// remembered for this browser session only and forgotten on sign-out.
const KEY = "akula.accredited-declaration";
let remembered: number | null = null;

export function hasDeclared(userId: number): boolean {
  if (remembered === userId) return true;
  try {
    return sessionStorage.getItem(KEY) === String(userId);
  } catch {
    return false;
  }
}

export function markDeclared(userId: number) {
  remembered = userId;
  try {
    sessionStorage.setItem(KEY, String(userId));
  } catch {
    // Storage can be blocked; the in-memory copy still covers this page load.
  }
}

export function clearDeclared() {
  remembered = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored to clear.
  }
}

// A one-off line for the sign-in page, left by whoever just signed out of the declaration.
const NOTICE_KEY = "akula.login-notice";

export function setLoginNotice(message: string) {
  try {
    sessionStorage.setItem(NOTICE_KEY, message);
  } catch {
    // The notice is a courtesy; sign-out works without it.
  }
}

export function peekLoginNotice(): string | null {
  try {
    return sessionStorage.getItem(NOTICE_KEY);
  } catch {
    return null;
  }
}

export function clearLoginNotice() {
  try {
    sessionStorage.removeItem(NOTICE_KEY);
  } catch {
    // Nothing stored to clear.
  }
}
