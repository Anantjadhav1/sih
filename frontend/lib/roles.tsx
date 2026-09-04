"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Demo-only role model.
 *
 * There is no authentication here on purpose: the hackathon build picks a role
 * from a button and keeps it in React state. Production replaces this provider
 * with JWT-backed RBAC - the `useRole()` call sites and the `can()` checks below
 * stay as they are, they just read claims from a verified token instead of
 * local state. Nothing security-relevant is gated on this; it shapes the UI only.
 */
export type Role = "researcher" | "official" | "public";

export interface RoleDef {
  id: Role;
  label: string;
  blurb: string;
  /** What this role may do in the Innovation Hub */
  canApply: boolean;
  canCreate: boolean;
}

export const ROLES: RoleDef[] = [
  {
    id: "researcher",
    label: "Researcher",
    blurb:
      "Runs simulations, reads the full repository, and applies to open calls.",
    canApply: true,
    canCreate: false,
  },
  {
    id: "official",
    label: "Government Official",
    blurb:
      "Everything a researcher can do, plus publishing new hackathons and grants.",
    canApply: true,
    canCreate: true,
  },
  {
    id: "public",
    label: "Public User",
    blurb: "Read-only access to published evidence and open calls.",
    canApply: false,
    canCreate: false,
  },
];

export function getRole(id: Role): RoleDef {
  return ROLES.find((r) => r.id === id) ?? ROLES[2];
}

interface RoleContextValue {
  role: RoleDef | null;
  setRole: (id: Role) => void;
  signOut: () => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<RoleDef | null>(null);

  const value = useMemo<RoleContextValue>(
    () => ({
      role,
      setRole: (id: Role) => setRoleState(getRole(id)),
      signOut: () => setRoleState(null),
    }),
    [role]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside <RoleProvider>");
  return ctx;
}
