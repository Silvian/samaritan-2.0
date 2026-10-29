"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";

import { api } from "./api";
import type { Me } from "./types";

type AuthContextValue = {
  me: Me | undefined;
  isLoading: boolean;
  can: (...perms: string[]) => boolean;
  logout: (everywhere?: boolean) => Promise<void>;
  refetch: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const IDLE_MINUTES = 30;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: me, isLoading, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<Me>("/auth/me/"),
    staleTime: 60_000,
    retry: false,
  });

  const can = useCallback(
    (...perms: string[]) => !!me && (me.is_superuser || perms.some((p) => me.permissions.includes(p))),
    [me],
  );

  const logout = useCallback(
    async (everywhere = false) => {
      try {
        await api.post("/auth/logout/", { everywhere });
      } finally {
        qc.clear();
        router.replace("/login");
      }
    },
    [qc, router],
  );

  // Sign out after a period of inactivity (shared devices in church offices).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!me) return;
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        api.post("/auth/logout/").finally(() => {
          qc.clear();
          window.location.href = "/login?idle=1";
        });
      }, IDLE_MINUTES * 60_000);
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [me, qc]);

  const value = useMemo(
    () => ({ me, isLoading, can, logout, refetch: () => void refetch() }),
    [me, isLoading, can, logout, refetch],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
