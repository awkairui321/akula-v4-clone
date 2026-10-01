import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Circle,
  LayoutDashboard,
  TrendingUp,
  FileTextIcon,
  PanelLeft,
  Moon,
  UserCheckIcon,
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
  { to: "/luca/onboarding", label: "Onboarding", icon: UserCheckIcon },
  { to: "/luca/subscriptions", label: "Subscriptions", icon: CreditCard },
  { to: "/luca/partners", label: "Partners", icon: Building2Icon },
  { to: "/luca/documents", label: "Documents", icon: FileTextIcon },
  { to: "/luca/communications", label: "Communications", icon: MailIcon },
];

export default function LucaLayout() {
  const { logout, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const activeItem =
    NAV_ITEMS.find(
      (item) =>
        location.pathname === item.to ||
        (item.to !== "/luca" && location.pathname.startsWith(`${item.to}/`)),
    ) ?? (location.pathname === "/luca" ? NAV_ITEMS[0] : undefined);

  const initials = user?.email ? user.email[0].toUpperCase() : "~";

  return (
    <div className="flex min-h-screen">
      <aside
        className={`${collapsed ? "w-16" : "w-56"} flex shrink-0 flex-col border-r transition-all`}
      >
        <Link to="/luca" className="mt-1 px-3 py-4">
          <div className={`flex flex-row ${collapsed ? "justify-center" : ""}`}>
            <Circle className={collapsed ? "" : "mx-2"} />
            {!collapsed && <div className="uppercase">LUCA</div>}
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
        <div className="mt-auto border">
          <div
            className={`flex flex-row items-center px-3 py-4 ${collapsed ? "justify-center" : ""}`}
            title={collapsed ? "LUCA SGP" : undefined}
          >
            <span className={`h-2 w-2 rounded-full bg-blue-500 ${collapsed ? "" : "mr-2"}`} />
            {!collapsed && "LUCA SGP · Fund Manager"}
          </div>
        </div>
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
                    {initials}
                  </Button>
                }
              />
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => navigate("/luca")}>
                    Command Dashboard
                  </DropdownMenuItem>
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
