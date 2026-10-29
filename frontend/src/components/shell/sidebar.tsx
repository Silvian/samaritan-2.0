"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const { data: church } = useQuery({
    queryKey: ["church-public"],
    queryFn: () => api.get<{ name: string }>("/settings/public/"),
    staleTime: Infinity,
  });

  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-sidebar text-sidebar-text">
      <div className="px-5 pt-6 pb-5">
        <Link href="/dashboard" onClick={onNavigate} className="block">
          <span className="block font-serif text-[19px] leading-snug font-semibold text-white">
            {church?.name ?? "Samaritan"}
          </span>
          <span className="block text-xs text-sidebar-muted mt-0.5">Samaritan church management</span>
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-5">
        {NAV.map((section, i) => {
          const items = section.items.filter((it) => !it.perms || can(...it.perms));
          if (!items.length) return null;
          return (
            <div key={i}>
              {section.label && <p className="px-2.5 pb-1.5 text-xs text-sidebar-muted">{section.label}</p>}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                          active ? "bg-sidebar-active text-white" : "hover:bg-sidebar-hover hover:text-white",
                        )}
                      >
                        <Icon className={cn("h-4 w-4", active ? "text-[#e0b94e]" : "text-sidebar-muted")} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
