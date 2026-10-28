"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import { api } from "@/lib/api";

export function AuthFrame({ children }: { children: React.ReactNode }) {
  const { data } = useQuery({
    queryKey: ["church-public"],
    queryFn: () => api.get<{ name: string; privacy_notice_url: string }>("/settings/public/"),
    staleTime: Infinity,
  });
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="relative hidden overflow-hidden bg-sidebar px-12 py-12 text-sidebar-text lg:flex lg:flex-col">
        {/* Quiet nod to leaded glass: a few panes in the liturgical colours */}
        <svg aria-hidden className="absolute -right-24 -bottom-24 h-[520px] w-[520px] opacity-[0.22]" viewBox="0 0 200 200">
          <path d="M100 10 L190 100 L100 190 L10 100 Z" fill="none" stroke="#e0b94e" strokeWidth="1.2" />
          <path d="M100 10 L100 190 M10 100 L190 100" stroke="#e0b94e" strokeWidth="1" />
          <path d="M100 10 L190 100 L100 100 Z" fill="#5b3e96" />
          <path d="M10 100 L100 190 L100 100 Z" fill="#3a7d5c" />
          <path d="M100 100 L190 100 L100 190 Z" fill="#b4473c" opacity="0.8" />
          <path d="M10 100 L100 10 L100 100 Z" fill="#3d6fb6" opacity="0.8" />
        </svg>
        <p className="text-sm text-sidebar-muted">Samaritan</p>
        <div className="mt-auto max-w-md relative">
          <h1 className="font-serif text-[44px] leading-[1.1] font-semibold text-white">{data?.name ?? "Your church"}</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-sidebar-text/90">
            People, groups, giving and pastoral care in one place, kept private and handled with care.
          </p>
          <p className="mt-10 flex items-center gap-2 text-xs text-sidebar-muted">
            <ShieldCheck className="h-4 w-4" />
            Encrypted, audited and two-factor protected.
          </p>
        </div>
      </section>
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <p className="mb-8 font-serif text-xl font-semibold text-text lg:hidden">{data?.name ?? "Samaritan"}</p>
          {children}
          {data?.privacy_notice_url && (
            <p className="mt-10 text-xs text-muted">
              Read how we use personal data in our{" "}
              <a className="underline hover:text-text" href={data.privacy_notice_url} target="_blank" rel="noreferrer">
                privacy notice
              </a>
              .
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
