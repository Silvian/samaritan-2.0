/**
 * Typed fetch wrapper for the Samaritan REST API.
 *
 * - Auth lives in httpOnly cookies set by Django; JavaScript never sees tokens.
 * - State-changing requests echo the CSRF cookie in X-CSRFToken (double submit).
 * - A 401 triggers one silent refresh (single-flight) and a retry; if that fails
 *   the user is sent to the sign-in page.
 */
import { toQuery } from "./utils";

export const API_BASE = "/api/v1";
const CSRF_COOKIE = "sam_csrftoken";

export class ApiError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string[] | string>;

  constructor(status: number, body: { detail?: string; code?: string; errors?: Record<string, string[] | string> }) {
    super(body?.detail || `Request failed (${status})`);
    this.status = status;
    this.code = body?.code || "error";
    this.errors = body?.errors;
  }

  fieldError(name: string): string | undefined {
    const e = this.errors?.[name];
    if (!e) return undefined;
    return Array.isArray(e) ? e.join(" ") : String(e);
  }
}

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${API_BASE}/auth/refresh/`, { method: "POST", credentials: "include" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

async function ensureCsrf() {
  if (!readCookie(CSRF_COOKIE)) {
    await fetch(`${API_BASE}/auth/csrf/`, { credentials: "include" });
  }
  return readCookie(CSRF_COOKIE);
}

type Options = {
  method?: string;
  body?: unknown;
  params?: Record<string, unknown>;
  raw?: boolean;
  retry?: boolean;
  signal?: AbortSignal;
};

const AUTH_PATHS = ["/auth/login/", "/auth/mfa/verify/", "/auth/refresh/", "/auth/password/reset/"];

export async function request<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const method = (opts.method || "GET").toUpperCase();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers["X-CSRFToken"] = await ensureCsrf();

  const res = await fetch(`${API_BASE}${path}${toQuery(opts.params)}`, {
    method,
    headers,
    credentials: "include",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (res.status === 401 && opts.retry !== false && !AUTH_PATHS.some((p) => path.startsWith(p))) {
    if (await refreshSession()) return request<T>(path, { ...opts, retry: false });
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}&expired=1`;
    }
  }

  if (!res.ok) {
    let body = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON error */
    }
    const err = new ApiError(res.status, body);
    if (res.status === 403 && (err.code === "mfa_setup_required" || err.code === "password_change_required")) {
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/setup")) {
        window.location.href = "/setup";
      }
    }
    throw err;
  }
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, params?: Record<string, unknown>, signal?: AbortSignal) =>
    request<T>(path, { params, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Download a file (CSV / JSON export) through the authenticated API. */
export async function download(path: string, params?: Record<string, unknown>, fallbackName = "export") {
  const res = await request<Response>(path, { params, raw: true });
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const name = cd.match(/filename="([^"]+)"/)?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export type Paginated<T> = {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: T[];
};
