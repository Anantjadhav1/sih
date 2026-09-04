"use client";

import { useCallback, useState } from "react";
import TopBar from "@/components/TopBar";
import TabNav from "@/components/TabNav";
import type { TabId } from "@/components/TabNav";
import Dashboard from "@/components/views/Dashboard";
import SimulatorView from "@/components/views/SimulatorView";
import KnowledgeRepository from "@/components/views/KnowledgeRepository";
import GisExplorer from "@/components/views/GisExplorer";
import InnovationHub from "@/components/views/InnovationHub";
import { TABS } from "@/components/TabNav";
import LoginScreen from "@/components/LoginScreen";
import { RoleProvider, useRole } from "@/lib/roles";
import { SessionProvider } from "@/lib/session";

function DashboardShell() {
  const { role } = useRole();
  const [tab, setTab] = useState<TabId>("dashboard");
  // The simulator owns its own scope; it reports up so the breadcrumb can show it
  const [simScope, setSimScope] = useState("Pune");
  const handleScopeChange = useCallback((label: string) => setSimScope(label), []);

  const breadcrumb =
    tab === "simulator"
      ? simScope
      : TABS.find((t) => t.id === tab)?.label ?? "";

  // No role chosen yet - the platform is behind the role picker
  if (!role) return <LoginScreen />;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <TopBar districtLabel={breadcrumb} online />
      <TabNav active={tab} onChange={setTab} />

      {/*
        Each tab owns a full view. They are mounted one at a time rather than
        hidden with CSS: both map views hold a live Leaflet instance, and
        keeping two of those alive off-screen wastes tile requests and memory
        for no benefit at demo scale.
      */}
      <main className="flex min-h-0 flex-1 flex-col">
        {tab === "dashboard" && <Dashboard />}
        {tab === "simulator" && <SimulatorView onScopeChange={handleScopeChange} />}
        {tab === "repository" && <KnowledgeRepository />}
        {tab === "gis" && <GisExplorer />}
        {tab === "innovation" && <InnovationHub />}
      </main>
    </div>
  );
}

/**
 * Both providers sit above the shell rather than inside it: the login screen
 * and the tabs must read the same role state, and session run history has to
 * outlive the Simulator being unmounted on a tab switch.
 */
export default function Home() {
  return (
    <RoleProvider>
      {/*
        SessionProvider sits above the tabs, not inside the Simulator:
        views unmount when you switch tabs, and the Dashboard has to keep
        reading runs the Simulator recorded before it was unmounted.
      */}
      <SessionProvider>
        <DashboardShell />
      </SessionProvider>
    </RoleProvider>
  );
}
