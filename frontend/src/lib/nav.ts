import {
  BarChart3,
  CalendarDays,
  HandCoins,
  HandHeart,
  Home,
  type LucideIcon,
  Mail,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  UsersRound,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; perms?: string[] };
export type NavSection = { label?: string; items: NavItem[] };

export const NAV: NavSection[] = [
  { items: [{ href: "/dashboard", label: "Dashboard", icon: BarChart3 }] },
  {
    label: "Community",
    items: [
      { href: "/people", label: "People", icon: Users, perms: ["people.view", "groups.lead"] },
      { href: "/households", label: "Households", icon: Home, perms: ["people.view"] },
      { href: "/groups", label: "Groups", icon: UsersRound, perms: ["groups.view", "groups.manage", "groups.lead"] },
      { href: "/events", label: "Events & attendance", icon: CalendarDays, perms: ["events.view", "events.manage", "groups.lead"] },
    ],
  },
  {
    label: "Care & giving",
    items: [
      { href: "/care", label: "Pastoral care", icon: HandHeart, perms: ["pastoral.view"] },
      { href: "/giving", label: "Giving", icon: HandCoins, perms: ["giving.view", "giving.manage"] },
      { href: "/messages", label: "Messages", icon: Mail, perms: ["comms.view", "comms.send"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/privacy", label: "Privacy & GDPR", icon: ShieldCheck, perms: ["privacy.view", "privacy.manage"] },
      { href: "/admin/users", label: "Users & roles", icon: UserCog, perms: ["users.manage"] },
      { href: "/admin/audit", label: "Audit log", icon: ScrollText, perms: ["audit.view"] },
      { href: "/admin/settings", label: "Settings", icon: Settings, perms: ["settings.manage"] },
    ],
  },
];
