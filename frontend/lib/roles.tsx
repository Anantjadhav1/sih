"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

/**
 * Sign-in and roles.
 *
 * Picking a role signs in to that demo account on the server, which checks the
 * password and returns a signed pass (token). Every write sends the pass, and
 * the server reads the role from its own signature - so the permission flags
 * below only shape what the UI offers; the server is what actually enforces
 * them (see backend/auth.py).
 */
export type Role = "researcher" | "official" | "public";

export interface RoleDef {
  id: Role;
  label: string;
  /** Demo account this role signs in as */
  username: string;
  /**
   * DEMO ONLY - lets the login buttons sign in with one click. A real
   * deployment has people type their own password; nothing else changes.
   */
  demoPassword: string;
  blurb: string;
  /** What this role may do in the Innovation Hub */
  canApply: boolean;
  canCreate: boolean;
  /**
   * Whether this role may seal decisions on the blockchain ledger. Everyone
   * can read and verify it - that openness is the point of a public ledger.
   */
  canRecord: boolean;
}

export const ROLES: RoleDef[] = [
  {
    id: "researcher",
    label: "Researcher",
    username: "researcher@demo",
    demoPassword: "researcher-demo",
    blurb: "Runs simulations, reads research, verifies the ledger and applies to open calls.",
    canApply: true,
    canCreate: false,
    canRecord: false,
  },
  {
    id: "official",
    label: "Government Official",
    username: "official@demo",
    demoPassword: "official-demo",
    blurb: "Approves or rejects policies on the blockchain, and publishes grants.",
    canApply: true,
    canCreate: true,
    canRecord: true,
  },
  {
    id: "public",
    label: "Public User",
    username: "citizen@demo",
    demoPassword: "citizen-demo",
    blurb: "Views everything, sends ground-truth photos, and can check no record was altered.",
    canApply: false,
    canCreate: false,
    canRecord: false,
  },
];

export function getRole(id: Role): RoleDef {
  return ROLES.find((r) => r.id === id) ?? ROLES[2];
}

interface RoleContextValue {
  role: RoleDef | null;
  /** The signed pass from the server; sent with every write. */
  token: string | null;
  /** Sign in as that role's demo account. Keeps the old role if it fails. */
  setRole: (id: Role) => Promise<void>;
  signOut: () => void;
  signingIn: Role | null;
  signInError: string | null;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<RoleDef | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState<Role | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);

  const setRole = useCallback(async (id: Role) => {
    const def = getRole(id);
    setSigningIn(id);
    setSignInError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: def.username, password: def.demoPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Sign-in failed.");
      }
      const data = await res.json();
      setToken(data.token);
      setRoleState(def);
    } catch (e) {
      const message = (e as Error).message;
      setSignInError(
        message === "Failed to fetch"
          ? "Can't reach the server. Is the backend running on port 8000?"
          : message
      );
    } finally {
      setSigningIn(null);
    }
  }, []);

  const value = useMemo<RoleContextValue>(
    () => ({
      role,
      token,
      setRole,
      signOut: () => {
        setRoleState(null);
        setToken(null);
      },
      signingIn,
      signInError,
    }),
    [role, token, setRole, signingIn, signInError]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside <RoleProvider>");
  return ctx;
}
