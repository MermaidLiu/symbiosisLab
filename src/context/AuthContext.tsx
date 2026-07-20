"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Role } from "@/types";
import { api, PublicUser } from "@/lib/api/client";
import { applyBootstrap, hydrateFromApi, setCachePartial } from "@/lib/storage/db";

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateUserRoles: (userId: string, roles: Role[]) => Promise<void>;
  updateNickname: (nickname: string) => Promise<{ ok: boolean; warning?: string; error?: string }>;
  refreshUser: () => Promise<void>;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  phone?: string;
  department?: string;
  roles: Role[];
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const ok = await hydrateFromApi();
      if (!ok) {
        setUser(null);
        return;
      }
      const me = await api.me();
      setUser(me.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.me();
        setUser(me.user);
        await hydrateFromApi();
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { user: loggedIn } = await api.login(email, password);
      setUser(loggedIn);
      const data = await api.bootstrap();
      applyBootstrap(data);
      return { ok: true };
    } catch (e) {
      const code = (e as { code?: string }).code ?? "invalid_credentials";
      return { ok: false, error: code };
    }
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    try {
      const { user: created } = await api.register(data);
      setUser(created);
      const boot = await api.bootstrap();
      applyBootstrap(boot);
      return { ok: true };
    } catch (e) {
      const code = (e as { code?: string }).code ?? "register_failed";
      return { ok: false, error: code };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    setUser(null);
  }, []);

  const updateUserRoles = useCallback(
    async (userId: string, roles: Role[]) => {
      if (!user?.roles.includes("super_admin")) return;
      const { users } = await api.updateUserRoles(userId, roles);
      setCachePartial({ users });
      if (userId === user.id) {
        const me = users.find((u) => u.id === userId);
        if (me) setUser(me);
      }
    },
    [user]
  );

  const updateNickname = useCallback(async (nickname: string) => {
    try {
      const { user: next, warning } = await api.updateProfile({ nickname });
      setUser(next);
      await hydrateFromApi();
      return { ok: true as const, warning };
    } catch (e) {
      const code = (e as { code?: string }).code ?? "update_failed";
      return { ok: false as const, error: code };
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        updateUserRoles,
        updateNickname,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
