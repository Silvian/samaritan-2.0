"use client";

import * as D from "@radix-ui/react-dialog";
import { LogOut, Menu as MenuIcon, Moon, Search, Sun, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/hooks";

import { CommandPalette } from "./command-palette";
import { Sidebar } from "./sidebar";

function Shell({ children }: { children: React.ReactNode }) {
  const { me, isLoading, logout } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { dark, toggle } = useTheme();

  const needsSetup = !!me && (me.must_change_password || (me.mfa_required && !me.mfa_enabled));
  useEffect(() => {
    if (needsSetup) router.replace("/setup");
  }, [needsSetup, router]);


  if (isLoading || !me || needsSetup) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">
        <Sidebar />
      </aside>

      <D.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <D.Content className="fixed inset-y-0 left-0 z-50 w-72 lg:hidden">
            <D.Title className="sr-only">Navigation</D.Title>
            <D.Description className="sr-only">Main navigation</D.Description>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </D.Content>
        </D.Portal>
      </D.Root>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur sm:px-6">
        <button className="rounded-md p-2 text-muted hover:bg-surface-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
          <MenuIcon className="h-5 w-5" />
        </button>
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-subtle hover:border-border-strong"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search people and pages</span>
          <kbd className="hidden rounded border border-border px-1.5 text-[11px] text-muted sm:inline">Ctrl K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={toggle} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label={dark ? "Use light theme" : "Use dark theme"}>
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <Menu>
            <MenuTrigger className="flex items-center gap-2 rounded-md p-1 pr-2 hover:bg-surface-2" aria-label="Account menu">
              <Avatar name={me.full_name} size="sm" />
              <span className="hidden text-sm text-text sm:block">{me.first_name || me.email}</span>
            </MenuTrigger>
            <MenuContent>
              <MenuLabel>
                <span className="block text-sm text-text">{me.full_name}</span>
                <span className="block">{me.role?.name ?? (me.is_superuser ? "Superuser" : "No role")}</span>
              </MenuLabel>
              <MenuSeparator />
              <MenuItem onSelect={() => router.push("/account")}>
                <User className="h-4 w-4" /> Your account
              </MenuItem>
              <MenuItem onSelect={() => logout()}>
                <LogOut className="h-4 w-4" /> Sign out
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <footer className="px-8 pb-6 text-xs text-subtle lg:pl-8">
        <Link href="/account" className="hover:text-muted">Signed in as {me.email}</Link>
      </footer>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Shell>{children}</Shell>
    </AuthProvider>
  );
}
