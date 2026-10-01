import { useState } from "react";
import { useLocation } from "react-router-dom";
import AccountPage from "@/features/investor/account";
import SupportPage from "@/features/investor/support";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AccountSupportPage() {
  const location = useLocation();
  const [tab, setTab] = useState(location.pathname === "/support" ? "support" : "account");

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Investor workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Account &amp; Support</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your profile, security, privacy and service requests.</p>
        </div>
        <Tabs value={tab} onValueChange={(value) => value && setTab(value)}>
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="support">Support &amp; requests</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {tab === "account" ? <AccountPage /> : <SupportPage />}
    </div>
  );
}
