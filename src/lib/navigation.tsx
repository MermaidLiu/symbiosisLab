import { Role } from "@/types";
import {
  canManageUsers,
  canViewAllLogs,
  canManageInstruments,
  canManageAnimals,
  canAccessResearchAssistant,
  canSuperviseAnimalFacility,
  canProcessVeterinary,
  isAnimalOpsStaff,
} from "@/lib/roles";

export interface NavLink {
  type: "link";
  href: string;
  labelKey: keyof typeof import("@/i18n/locales/zh").default.nav;
  icon: string;
  show: (roles: Role[]) => boolean;
}

export interface NavGroup {
  type: "group";
  labelKey: keyof typeof import("@/i18n/locales/zh").default.nav;
  icon: string;
  show: (roles: Role[]) => boolean;
  /** Path prefix used to auto-expand the group */
  pathPrefix: string;
  children: {
    href: string;
    labelKey: keyof typeof import("@/i18n/locales/zh").default.nav;
    show?: (roles: Role[]) => boolean;
  }[];
}

export type NavEntry = NavLink | NavGroup;

export const NAV_ENTRIES: NavEntry[] = [
  { type: "link", href: "/", labelKey: "dashboard", icon: "home", show: () => true },
  { type: "link", href: "/instruments", labelKey: "instruments", icon: "instrument", show: () => true },
  {
    type: "group",
    labelKey: "animals",
    icon: "animal",
    pathPrefix: "/animals",
    show: () => true,
    children: [
      {
        href: "/animals/facility-board",
        labelKey: "facilityBoard",
        show: canSuperviseAnimalFacility,
      },
      {
        href: "/animals/managed",
        labelKey: "managedAnimals",
        show: (roles) => !isAnimalOpsStaff(roles),
      },
      {
        href: "/animals/managed",
        labelKey: "animalList",
        show: isAnimalOpsStaff,
      },
      // { href: "/animals/cages", labelKey: "myCages" }, // temporarily hidden
      {
        href: "/animals/applications",
        labelKey: "applications",
        show: (roles) => !isAnimalOpsStaff(roles),
      },
      { href: "/animals/vet-care", labelKey: "vetCare", show: canProcessVeterinary },
    ],
  },
  {
    type: "group",
    labelKey: "researchAssistant",
    icon: "ra",
    pathPrefix: "/ra",
    show: canAccessResearchAssistant,
    children: [
      { href: "/ra/proposals", labelKey: "raProposals" },
      { href: "/ra/process", labelKey: "raProcess" },
      { href: "/ra/closure", labelKey: "raClosure" },
      { href: "/ra/funding", labelKey: "raFunding" },
      { href: "/ra/sys-info", labelKey: "raSysInfo" },
      { href: "/ra/liaison", labelKey: "raLiaison" },
      { href: "/ra/policies", labelKey: "raPolicies" },
      { href: "/ra/achievements", labelKey: "raAchievements" },
      { href: "/ra/images", labelKey: "raImageLibrary" },
      { href: "/ra/ppt", labelKey: "raPptStudio" },
    ],
  },
  { type: "link", href: "/bookings", labelKey: "bookings", icon: "calendar", show: () => true },
  {
    type: "link",
    href: "/progress",
    labelKey: "progressSubmit",
    icon: "ra",
    show: (roles) =>
      roles.includes("user") &&
      !roles.includes("research_assistant") &&
      !roles.includes("super_admin"),
  },
  {
    type: "link",
    href: "/logs",
    labelKey: "logs",
    icon: "log",
    show: (roles) => canViewAllLogs(roles) || canManageInstruments(roles) || canManageAnimals(roles),
  },
  { type: "link", href: "/admin/users", labelKey: "adminUsers", icon: "users", show: canManageUsers },
];

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const cn = className ?? "h-5 w-5";
  const stroke = { fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5 };

  switch (name) {
    case "home":
      return (
        <svg className={cn} {...stroke}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case "instrument":
      return (
        <svg className={cn} {...stroke}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m14 0h2M3 15h2m14 0h2M7 7h10v10H7V7z" />
        </svg>
      );
    case "animal":
      return (
        <svg className={cn} {...stroke}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6c-2 0-3 1.5-3 3.5S10 13 12 13s3-1.5 3-3.5S14 6 12 6zm-7 8c0-2 2-3 4-3h6c2 0 4 1 4 3v2H5v-2z" />
        </svg>
      );
    case "ra":
      return (
        <svg className={cn} {...stroke}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.611L5 14.5" />
        </svg>
      );
    case "calendar":
      return (
        <svg className={cn} {...stroke}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "log":
      return (
        <svg className={cn} {...stroke}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "users":
      return (
        <svg className={cn} {...stroke}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      );
    default:
      return null;
  }
}
