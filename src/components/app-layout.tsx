import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Circle,
  TrendingUp,
  Clock3,
  FileTextIcon,
  PanelLeft,
  Moon,
  UserIcon,
  LifeBuoyIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import ProfileSwitcher from "./profile-switcher";

const NAV_ITEMS = [
  { to: "/portfolio", label: "Portfolio", icon: Clock3 },
  { to: "/funds", label: "Invest", icon: TrendingUp },
  { to: "/documents", label: "Documents", icon: FileTextIcon },
  { to: "/account", label: "Account", icon: UserIcon },
  { to: "/support", label: "Support", icon: LifeBuoyIcon },
];

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

function Initials(profile: InvestorProfile | null | undefined): string {
  if (!profile) return "~";

  const parts = [profile.first_name, profile.last_name].filter(Boolean);

  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function AppLayout() {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const activeItem = NAV_ITEMS.find(
    (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  );

  const { data, isLoading } = useQuery({
    queryKey: ["investorProfile"],
    queryFn: () => api<{ investor_profile: InvestorProfile | null }>("/api/v1/investor_profile"),
  });

  const profile = data?.investor_profile;
  console.log(profile, Initials(profile));
  return (
    <div className="flex min-h-screen">
      <aside
        className={`${collapsed ? "w-16" : "w-56"} flex shrink-0 flex-col border-r transition-all`}
      >
        <Link to="/funds" className="mt-1 px-3 py-4">
          <div className={`flex flex-row ${collapsed ? "justify-center" : ""}`}>
            <Circle className={collapsed ? "" : "mx-2"} />
            {!collapsed && <div className="uppercase">Akula Labs</div>}
          </div>
        </Link>
        <nav className="flex flex-col gap-1 px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <Link key={item.to} to={item.to}>
              <Button
                variant={activeItem?.to === item.to ? "secondary" : "ghost"}
                size="lg"
                className={`w-full py-6 ${collapsed ? "justify-center px-0" : "justify-start px-4"}`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className={collapsed ? "" : "mr-2"} />
                {!collapsed && item.label}
              </Button>
            </Link>
          ))}
        </nav>
        <ProfileSwitcher collapsed={collapsed} />
      </aside>

      <div className="flex flex-1 flex-col bg-muted">
        <header className="flex items-center border-b px-6 py-4">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <PanelLeft />
            </Button>
            {activeItem && <span className="ml-2">{activeItem.label}</span>}
          </div>
          <div className="ml-auto flex items-center">
            <Button variant="ghost" size="icon">
              <Moon />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" className="border-border">
                    {isLoading ? "~" : Initials(profile)}
                  </Button>
                }
              />
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => navigate("/account")}>Profile</DropdownMenuItem>
                  <DropdownMenuItem onClick={logout}>Sign out</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-310 flex-1 px-6 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
