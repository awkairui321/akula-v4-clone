import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { demoPersonaId } from "@/lib/demo-persona";

type User = {
  id: number;
  email: string;
  role: string;
  onboarding_completed: boolean;
  onboarding_step: number;
  verified: boolean;
  two_factor_enabled: boolean;
  has_investor_profile: boolean;
  has_eam_profile: boolean;
  nda_status: "not_started" | "pending" | "signed";
  kyc_status: "not_started" | "pending" | "approved" | "failed";
};

type LoginResult =
  | { success: true; user: User | null }
  | { success: false; two_factor_required: true };

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, otpCode?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const data = await api<{ user: User }>("/api/v1/me");
      setUser(data.user);
      return data.user;
    } catch {
      setUser(null);
      if (!demoPersonaId()) localStorage.removeItem("token");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (demoPersonaId() || localStorage.getItem("token")) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [fetchUser]);

  const login = async (email: string, password: string, otpCode?: string): Promise<LoginResult> => {
    if (demoPersonaId()) throw new Error("Change the persona using the comparison controls.");
    const body: Record<string, unknown> = { email, password };
    if (otpCode) body.otp_attempt = otpCode;

    const res = await api<{ user?: { id: number }; two_factor_required?: boolean }>(
      "/api/v1/login",
      {
        method: "POST",
        body: { user: body },
      },
    );

    if (res.two_factor_required) {
      return { success: false, two_factor_required: true };
    }

    // JWT was captured by api() from response header
    queryClient.clear();
    const user = await fetchUser();
    return { success: true, user };
  };

  const logout = async () => {
    if (demoPersonaId()) {
      setUser(null);
      queryClient.clear();
      return;
    }
    try {
      await api("/api/v1/logout", { method: "DELETE" });
    } finally {
      localStorage.removeItem("token");
      setUser(null);
      queryClient.clear();
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
