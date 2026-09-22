import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  SlidersHorizontal,
  Users,
  UserCheck,
  CreditCard,
  History,
  BadgeCheck,
  User,
  Plus,
  X,
} from "lucide-react";
import { useMe, can } from "@/lib/useMe";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { RulesSection } from "@/components/settings/RulesSection";
import { TeamSection } from "@/components/settings/TeamSection";
import { DelegationsSection } from "@/components/settings/DelegationsSection";
import { BillingSection } from "@/components/settings/BillingSection";
import { AuditLogSection } from "@/components/settings/AuditLogSection";
import { NdpaComplianceSection } from "@/components/settings/NdpaComplianceSection";
import { ProfileSection } from "@/components/settings/ProfileSection";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Organization Settings — Procurely Flow" },
      {
        name: "description",
        content:
          "Edit approval thresholds, manage teammate roles and read the permanent approval audit log.",
      },
      { property: "og:title", content: "Settings — Procurely Flow" },
      { property: "og:description", content: "Configure approval routing for your organization." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const me = useMe();
  const isAdmin = can(me.data?.roles, ["admin"]);
  const [showBuilder, setShowBuilder] = useState(false);

  return (
    <div className="space-y-8 pb-16 max-w-7xl mx-auto">
      {/* 1. Executive Master Header */}
      <header className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
              Organization Settings
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-normal leading-normal">
              Manage financial spend approval thresholds, team member role assignments, and
              governance audit records.
            </p>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2.5 shrink-0">
              <Button
                onClick={() => setShowBuilder((prev) => !prev)}
                className={cn(
                  "h-9 px-4 rounded-lg text-xs font-semibold transition-all shadow-xs gap-1.5 cursor-pointer",
                  showBuilder
                    ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                    : "bg-[#0B1457] hover:bg-[#0001FF] text-white",
                )}
              >
                {showBuilder ? (
                  <>
                    <X className="h-3.5 w-3.5" />
                    <span>Close Designer</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create Policy Tier</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* 2. Sleek Segmented Tabs Navigation */}
      <Tabs defaultValue="rules" className="space-y-6">
        <div className="border-b border-slate-200/80 pb-1">
          <TabsList className="h-10 bg-slate-100/80 p-1 rounded-lg gap-1 border border-slate-200/60">
            <TabsTrigger
              value="rules"
              className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:font-semibold transition-all shadow-none data-[state=active]:shadow-2xs cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
              <span>Approval Rules</span>
            </TabsTrigger>
            <TabsTrigger
              value="team"
              className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:font-semibold transition-all shadow-none data-[state=active]:shadow-2xs cursor-pointer"
            >
              <Users className="h-3.5 w-3.5 text-slate-500" />
              <span>Team &amp; Permissions</span>
            </TabsTrigger>
            <TabsTrigger
              value="delegations"
              className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:font-semibold transition-all shadow-none data-[state=active]:shadow-2xs cursor-pointer"
            >
              <UserCheck className="h-3.5 w-3.5 text-slate-500" />
              <span>Delegations (FR-2.6)</span>
            </TabsTrigger>
            <TabsTrigger
              value="billing"
              className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:font-semibold transition-all shadow-none data-[state=active]:shadow-2xs cursor-pointer"
            >
              <CreditCard className="h-3.5 w-3.5 text-slate-500" />
              <span>Subscription &amp; Billing</span>
            </TabsTrigger>
            <TabsTrigger
              value="audit"
              className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:font-semibold transition-all shadow-none data-[state=active]:shadow-2xs cursor-pointer"
            >
              <History className="h-3.5 w-3.5 text-slate-500" />
              <span>Audit Log</span>
            </TabsTrigger>
            <TabsTrigger
              value="ndpa"
              className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:font-semibold transition-all shadow-none data-[state=active]:shadow-2xs cursor-pointer"
            >
              <BadgeCheck className="h-3.5 w-3.5 text-slate-500" />
              <span>NDPA Compliance</span>
            </TabsTrigger>
            <TabsTrigger
              value="profile"
              className="flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:font-semibold transition-all shadow-none data-[state=active]:shadow-2xs cursor-pointer"
            >
              <User className="h-3.5 w-3.5 text-slate-500" />
              <span>My Profile</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Approval Rules */}
        <TabsContent value="rules" className="mt-0 space-y-6">
          <RulesSection
            isAdmin={isAdmin}
            showBuilder={showBuilder}
            setShowBuilder={setShowBuilder}
          />
        </TabsContent>

        {/* Tab 2: Team & Permissions */}
        <TabsContent value="team" className="mt-0">
          <TeamSection isAdmin={isAdmin} />
        </TabsContent>

        {/* Tab 3: Approval Authority Delegation (FR-2.6) */}
        <TabsContent value="delegations" className="mt-0">
          <DelegationsSection isAdmin={isAdmin} />
        </TabsContent>

        {/* Tab 4: Subscription & Virtual Account Billing (NFR-LOC.2) */}
        <TabsContent value="billing" className="mt-0">
          <BillingSection isAdmin={isAdmin} />
        </TabsContent>

        {/* Tab 5: Cryptographic Audit Log */}
        <TabsContent value="audit" className="mt-0">
          <AuditLogSection />
        </TabsContent>

        {/* Tab 6: NDPA Compliance & Regulatory Trust */}
        <TabsContent value="ndpa" className="mt-0">
          <NdpaComplianceSection isAdmin={isAdmin} />
        </TabsContent>

        {/* Tab 7: My Profile & Avatar */}
        <TabsContent value="profile" className="mt-0">
          <ProfileSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
