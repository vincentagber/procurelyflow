import { UserCheck, Briefcase, Landmark, Award, Key, Users, type LucideIcon } from "lucide-react";
import type { AppRole } from "@/lib/useMe";

export const ALL_ROLES: AppRole[] = [
  "requester",
  "approver",
  "procurement_officer",
  "finance",
  "executive",
  "admin",
];

export interface RoleMeta {
  label: string;
  shortLabel: string;
  roleDescription: string;
  icon: LucideIcon;
  themeColor: string;
  badgeBg: string;
  badgeText: string;
  pillBorder: string;
}

export const ROLE_CONFIG: Record<AppRole, RoleMeta> = {
  approver: {
    label: "Department Approver",
    shortLabel: "Approver",
    roleDescription: "Initial departmental budget validation",
    icon: UserCheck,
    themeColor: "text-emerald-700",
    badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
    badgeText: "text-emerald-700",
    pillBorder: "border-emerald-200",
  },
  procurement_officer: {
    label: "Procurement Officer",
    shortLabel: "Procurement",
    roleDescription: "Commercial sourcing & vendor contract review",
    icon: Briefcase,
    themeColor: "text-blue-700",
    badgeBg: "bg-blue-50 text-blue-800 border-blue-200/80",
    badgeText: "text-blue-700",
    pillBorder: "border-blue-200",
  },
  finance: {
    label: "Finance Controller",
    shortLabel: "Finance",
    roleDescription: "Fiscal allocation & disbursement sign-off",
    icon: Landmark,
    themeColor: "text-amber-700",
    badgeBg: "bg-amber-50 text-amber-800 border-amber-200/80",
    badgeText: "text-amber-700",
    pillBorder: "border-amber-200",
  },
  executive: {
    label: "Executive Board",
    shortLabel: "Executive",
    roleDescription: "High-value enterprise authorization (C-Suite)",
    icon: Award,
    themeColor: "text-indigo-700",
    badgeBg: "bg-indigo-50 text-indigo-800 border-indigo-200/80",
    badgeText: "text-indigo-700",
    pillBorder: "border-indigo-200",
  },
  admin: {
    label: "System Admin",
    shortLabel: "Admin",
    roleDescription: "Organizational policy & governance override",
    icon: Key,
    themeColor: "text-purple-700",
    badgeBg: "bg-purple-50 text-purple-800 border-purple-200/80",
    badgeText: "text-purple-700",
    pillBorder: "border-purple-200",
  },
  requester: {
    label: "Requisitioner",
    shortLabel: "Requester",
    roleDescription: "Purchase order and demand initiator",
    icon: Users,
    themeColor: "text-slate-700",
    badgeBg: "bg-slate-100 text-slate-800 border-slate-200",
    badgeText: "text-slate-700",
    pillBorder: "border-slate-200",
  },
};
