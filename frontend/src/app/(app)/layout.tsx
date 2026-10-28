import { AppShell } from "@/components/shell/app-shell";

// Everything below is personal data rendered client-side after the API
// authorises the request, so there is no static shell to validate.
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
