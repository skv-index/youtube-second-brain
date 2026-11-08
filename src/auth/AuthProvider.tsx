import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type AuthStatus } from "@/api/client";

const AuthContext = createContext<AuthStatus | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api<AuthStatus>("/auth/status");
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setStatus({ oauthConfigured: false, authenticated: false, connected: false, needsReauth: false, profile: null, lastCompletedAt: null, lastError: null, lastErrorKind: null });
      }
    };
    void load();
    // Re-check after OAuth redirects land on this page.
    const url = new URL(window.location.href);
    if (url.searchParams.has("connected") || url.searchParams.has("authError")) {
      window.history.replaceState({}, "", "/");
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onAuth = () => {
      void api<AuthStatus>("/auth/status").then(setStatus);
    };
    window.addEventListener("ysb-auth-updated", onAuth);
    return () => window.removeEventListener("ysb-auth-updated", onAuth);
  }, []);

  return <AuthContext.Provider value={status}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthStatus | null {
  return useContext(AuthContext);
}

export function notifyAuthChanged(): void {
  window.dispatchEvent(new Event("ysb-auth-updated"));
}
