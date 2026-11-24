import { AntIcon } from "@/components/ui/AntIcon";
import { Role } from "@/types";
import {
  canManageUsers,
  canViewAllLogs,
  canManageInstruments,
  canManageAnimals,
  canAccessResearchAssistant,
  canSuperviseAnimalFacility,
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
      { href: "/animals/lifecycle", labelKey: "animalLifecycle" },
      {
        href: "/animals/staff-review",
        labelKey: "staffReview",
        show: canSuperviseAnimalFacility,
      },
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
      { href: "/ra/radar", labelKey: "raHotTopicRadar" },
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
  { type: "link", href: "/admin/roster", labelKey: "adminRoster", icon: "users", show: canManageUsers },
];

export function NavIcon({name,className}:{name:string;className?:string}) {const names:Record<string,string>={home:"home",instrument:"experiment",animal:"medicine-box",ra:"read",calendar:"calendar",log:"file-text",users:"team"};return <AntIcon name={names[name]||name} className={className||"h-5 w-5"}/>;}
