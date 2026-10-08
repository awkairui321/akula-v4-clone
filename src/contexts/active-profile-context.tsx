import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { demoPersonaId } from "@/lib/demo-persona";

export type ActiveProfileType = "investor" | "eam";

type ActiveProfileContextValue = {
  activeProfile: ActiveProfileType;
  switchProfile: (profile: ActiveProfileType) => void;
};

const STORAGE_KEY = "akula_active_profile";

const ActiveProfileContext = createContext<ActiveProfileContextValue | null>(null);

function getInitialProfile(): ActiveProfileType {
  if (demoPersonaId()) return "investor";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "investor" || stored === "eam") return stored;
  return "investor";
}

export function ActiveProfileProvider({ children }: { children: ReactNode }) {
  const [activeProfile, setActiveProfile] = useState<ActiveProfileType>(getInitialProfile);

  const switchProfile = useCallback((profile: ActiveProfileType) => {
    if (!demoPersonaId()) localStorage.setItem(STORAGE_KEY, profile);
    setActiveProfile(profile);
  }, []);

  return (
    <ActiveProfileContext.Provider value={{ activeProfile, switchProfile }}>
      {children}
    </ActiveProfileContext.Provider>
  );
}

export function useActiveProfile() {
  const ctx = useContext(ActiveProfileContext);
  if (!ctx) throw new Error("useActiveProfile must be used within ActiveProfileProvider");
  return ctx;
}
