"use client";

/**
 * Sesi login (JWT). Token disimpan di localStorage browser. Terpisah total dari secret/pseudonim:
 * login hanya mengenali akun operasional, bukan identitas anonim (lihat lib/secret.ts).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export interface User {
  id: string;
  email: string;
  role: "author" | "reviewer" | "editor" | "admin";
  specialities: string[];
  verifiedFields: string[];
  identityCommitment: string | null;
  permanentAddress: string | null;
  identityRegisteredAt: string | null;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login(email: string, password: string): Promise<User>;
  logout(): void;
  refresh(): Promise<void>;
}

const TOKEN_KEY = "decpub.token";
const Ctx = createContext<AuthState | null>(null);

function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* localStorage tidak tersedia: sesi hanya hidup selama halaman terbuka */
  }
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const { data } = await api.get<User>("/me");
      setUser(data);
    } catch {
      setToken(null);
      setUser(null);
    }
  };

  useEffect(() => {
    let token: string | null = null;
    try {
      token = localStorage.getItem(TOKEN_KEY);
    } catch {
      /* abaikan */
    }
    if (!token) {
      setLoading(false);
      return;
    }
    setToken(token);
    refresh().finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post<{ accessToken: string; user: User }>("/auth/login", { email, password });
    setToken(data.accessToken);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, logout, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth harus di dalam AuthProvider");
  return c;
}
