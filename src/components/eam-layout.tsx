import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Circle,
  LayoutDashboard,
  Users,
  TrendingUp,
  BarChart3Icon,
  UserIcon,
  PanelLeft,
  Moon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import ProfileSwitcher from "./profile-switcher";
import DemoResetButton from "./demo-reset-button";

const NAV_ITEMS = [
  { to: "/eam", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/eam/clients", label: "Clients", icon: Users },
  { to: "/eam/opportunities", label: "Opportunities", icon: TrendingUp },
  { to: "/eam/revenue", label: "Revenue", icon: BarChart3Icon },
  { to: "/eam/profile", label: "Profile", icon: UserIcon },
];

type EamProfile = {
  id: number;
  firm_name: string;
  display_name: string;
  email: string;
  created_at: string;
};

function getInitials(profile: EamProfile | null | undefined): string {
  if (!profile) return "~";
  const parts = profile.display_name.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0]?.[0]?.toUpperCase() ?? "~";
}

export default function EamLayout() {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const screen = window.matchMedia("(max-width: 767px)");
    const collapse = () => {
      if (screen.matches) setCollapsed(true);
    };
    screen.addEventListener("change", collapse);
    return () => screen.removeEventListener("change", collapse);
  }, []);

  const activeItem = NAV_ITEMS.find((item) => {
    if (item.exact) return location.pathname === item.to;
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  });

  const { data, isLoading } = useQuery({
    queryKey: ["eamProfile"],
    queryFn: () => api<EamProfile>("/api/v1/eam/profile"),
  });

  const profile = data ?? null;

  return (
    <div className="flex min-h-screen">
      <aside
        className={`akula-sidebar ${collapsed ? "w-16" : "w-40 md:w-56"} flex shrink-0 flex-col border-r transition-all`}
      >
        <Link to="/eam" className="mt-1 px-3 py-4">
          <div className={`flex flex-row ${collapsed ? "justify-center" : ""}`}>
            <Circle className={collapsed ? "" : "mx-2"} />
            {!collapsed && <div className="uppercase text-[11px] font-semibold tracking-[0.16em]">Akula EAM</div>}
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

      <div className="flex min-w-0 flex-1 flex-col bg-background">
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
          <div className="ml-auto flex items-center gap-3">
            <Link to="/live-demo" className="text-xs text-primary underline">Live compare</Link>
            <DemoResetButton compact />
            <Button variant="ghost" size="icon">
              <Moon />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" className="border-border">
                    {isLoading ? "~" : getInitials(profile)}
                  </Button>
                }
              />
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => navigate("/eam/profile")}>
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={logout}>Sign out</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-310 flex-1 px-3 py-6 sm:px-6 sm:py-8">
          <Link
            to="/workflows"
            className="mb-5 inline-block rounded-md border bg-background px-4 py-2 text-sm"
          >
            Connected workflows · servicing & records →
          </Link>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
