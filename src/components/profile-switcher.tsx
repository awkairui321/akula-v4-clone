import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { useActiveProfile } from "@/contexts/active-profile-context";
import { landingPathForRole } from "@/lib/roles";
import { ChevronUpIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

const PROFILES = {
  investor: { label: "Investor", dot: "bg-green-500" },
  eam: { label: "Adviser", dot: "bg-blue-500" },
} as const;

export default function ProfileSwitcher({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth();
  const { activeProfile, switchProfile } = useActiveProfile();
  const navigate = useNavigate();

  if (!user) return null;

  const current = PROFILES[activeProfile];
  const hasMultipleProfiles = user.has_investor_profile && user.has_eam_profile;

  if (!hasMultipleProfiles) {
    return (
      <div className="mt-auto border-t">
        <div
          className={`flex items-center px-3 py-4 ${collapsed ? "justify-center" : ""}`}
          title={collapsed ? current.label : undefined}
        >
          <span
            className={`h-2 w-2 rounded-full ${current.dot} ${collapsed ? "" : "mr-2"} shrink-0`}
          />
          {!collapsed && <span className="text-sm">{current.label}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-auto border-t">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              className={`flex w-full items-center px-3 py-4 transition-colors hover:bg-muted/50 ${collapsed ? "justify-center" : ""}`}
              title={collapsed ? current.label : undefined}
            >
              <span
                className={`h-2 w-2 rounded-full ${current.dot} ${collapsed ? "" : "mr-2"} shrink-0`}
              />
              {!collapsed && (
                <>
                  <span className="text-sm">{current.label}</span>
                  <ChevronUpIcon className="ml-auto size-4 text-muted-foreground" />
                </>
              )}
            </button>
          }
        />
        <DropdownMenuContent side="top" align="start">
          <DropdownMenuGroup>
            {(Object.keys(PROFILES) as Array<keyof typeof PROFILES>).map((key) => {
              const p = PROFILES[key];
              const isActive = key === activeProfile;
              return (
                <DropdownMenuItem
                  key={key}
                  disabled={isActive}
                  onClick={() => {
                    switchProfile(key);
                    navigate(landingPathForRole(user, key));
                  }}
                >
                  <span className={`h-2 w-2 rounded-full ${p.dot} mr-2 shrink-0`} />
                  {p.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
