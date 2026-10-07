import type { ActiveProfileType } from "@/contexts/active-profile-context";

type UserLike =
  | {
      role: string;
      onboarding_completed?: boolean;
      has_investor_profile?: boolean;
      has_eam_profile?: boolean;
    }
  | null
  | undefined;

export function landingPathForRole(user: UserLike, activeProfile?: ActiveProfileType): string {
  if (!user) return "/onboarding";

  if (user.role === "investment_team") return "/luca/deals";
  if (user.role === "rm") return "/rm";
  if (user.role === "ops") return "/ops";

  if (user.role === "luca") return "/luca";

  // Onboarding completion is an investor-profile concept, so it's only checked
  // when we're actually routing into investor territory — not globally. This
  // keeps a dual-profile (e.g. eam + investor) user from being bounced back to
  // the same investor route they were just navigated to (see OnboardedRoute).
  const wantsEam = activeProfile === "eam";
  const wantsInvestor = activeProfile === "investor" || (!activeProfile && user.role !== "eam");

  if (wantsEam && user.has_eam_profile) return "/eam";
  if (wantsInvestor && user.has_investor_profile) {
    return user.onboarding_completed ? "/portfolio" : "/onboarding";
  }

  // Fallback based on role/whatever profile the user actually has
  if (user.role === "eam" && user.has_eam_profile) return "/eam";
  if (user.has_investor_profile) return user.onboarding_completed ? "/portfolio" : "/onboarding";
  return "/onboarding";
}
