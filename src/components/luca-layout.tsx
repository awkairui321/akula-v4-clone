import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import DemoResetButton from "./demo-reset-button";
import {
  Circle,
  LayoutDashboard,
  TrendingUp,
  ShieldCheckIcon,
  PanelLeft,
  UserCheckIcon,
  UserPlusIcon,
  Building2Icon,
  CreditCard,
  MailIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

const NAV_ITEMS = [
  { to: "/luca", label: "Dashboard", icon: LayoutDashboard },
  { to: "/luca/deals", label: "Deals", icon: TrendingUp },
  { to: "/luca/publication", label: "Publication", icon: ShieldCheckIcon },
  { to: "/luca/onboarding", label: "Onboarding", icon: UserCheckIcon },
  { to: "/luca/subscriptions", label: "Subscriptions", icon: CreditCard },
  { to: "/luca/clients", label: "Clients and follow ups", icon: UserCheckIcon },
  { to: "/luca/opportunities", label: "Opportunities", icon: TrendingUp },
  { to: "/luca/partners", label: "Partner client book", icon: Building2Icon },
  { to: "/luca/reports", label: "Client reports", icon: TrendingUp },
  { to: "/luca/client-documents", label: "Client documents", icon: ShieldCheckIcon },
  { to: "/luca/support", label: "Support", icon: MailIcon },
  { to: "/luca/compliance", label: "Compliance", icon: ShieldCheckIcon },
  { to: "/luca/communications", label: "Communications", icon: MailIcon },
];

export default function LucaLayout() {
  const { logout, user } = useAuth();
  const isRm = user?.role === "rm";
  const isTeam = user?.role === "investment_team";
  const home = isRm ? "/rm" : isTeam ? "/luca/deals" : "/luca";
  const roleLabel = isRm ? "LUCA · RM" : isTeam ? "LUCA · Investment Team" : "LUCA · Fund Manager";
  const navItems = isRm
    ? [
        { to: "/rm", label: "Overview", icon: LayoutDashboard },
        { to: "/rm/clients", label: "Clients and follow ups", icon: UserCheckIcon },
        { to: "/rm/onboarding", label: "Client onboarding", icon: UserPlusIcon },
        { to: "/rm/opportunities", label: "Opportunities", icon: TrendingUp },
        { to: "/rm/partners", label: "Partner client book", icon: Building2Icon },
        { to: "/rm/documents", label: "Documents", icon: ShieldCheckIcon },
        { to: "/rm/reports", label: "Reports", icon: TrendingUp },
        { to: "/rm/support", label: "Support", icon: MailIcon },
      ]
    : isTeam
      ? NAV_ITEMS.filter((item) => ["/luca/deals", "/luca/publication"].includes(item.to))
      : NAV_ITEMS;
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

  const activeItem =
    navItems.find(
      (item) =>
        location.pathname === item.to ||
        (item.to !== home && location.pathname.startsWith(`${item.to}/`)),
    ) ?? (location.pathname === home ? navItems[0] : undefined);

  const initials = user?.email ? user.email[0].toUpperCase() : "~";

  return (
    <div className="flex min-h-screen">
      <aside
        className={`akula-sidebar ${collapsed ? "w-16" : "w-40 md:w-56"} flex shrink-0 flex-col border-r transition-all`}
      >
        <Link to={home} className="mt-1 px-3 py-4">
          <div className={`flex flex-row ${collapsed ? "justify-center" : ""}`}>
            <Circle className={collapsed ? "" : "mx-2"} />
            {!collapsed && (
              <div className="text-[11px] font-semibold tracking-[0.16em] uppercase">
                {roleLabel}
              </div>
            )}
          </div>
        </Link>
        <nav className="flex flex-col gap-1 px-3 py-4">
          {navItems.map((item) => (
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
        <div className="mt-auto border">
          <div
            className={`flex flex-row items-center px-3 py-4 ${collapsed ? "justify-center" : ""}`}
            title={collapsed ? roleLabel : undefined}
          >
            <span className={`h-2 w-2 rounded-full bg-blue-500 ${collapsed ? "" : "mr-2"}`} />
            {!collapsed && roleLabel}
          </div>
        </div>
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
            <Button variant="outline" size="sm" onClick={() => navigate("/live-demo")}>
              Compare roles live
            </Button>
            <DemoResetButton compact />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" className="border-border">
                    {initials}
                  </Button>
                }
              />
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={logout}>Sign out</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-310 flex-1 px-3 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
