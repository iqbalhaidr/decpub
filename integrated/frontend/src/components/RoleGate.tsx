"use client";

/**
 * Pintu halaman per peran: login, peran yang sesuai, secret di browser ini, dan identitas terdaftar dengan commitment yang
 * sama. Bila ada yang kurang, halaman menjelaskan dan menautkan ke /profile. Setelah lolos, anak dirender dengan konteks
 * (konfigurasi server, id akun, surel, secret). Dipakai halaman penulis, editor, dan penelaah.
 */
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { Hex } from "viem";
import Err from "@/components/Err";
import type { AuthorCtx } from "@/lib/author";
import { api, errorText } from "@/lib/api";
import { useAuth, type User } from "@/lib/auth";
import { loadSecret, publicIdentity } from "@/lib/secret";
import type { PublicConfig } from "@/lib/types";

export default function RoleGate({ roles, label, children }: { roles: User["role"][]; label: string; children: (ctx: AuthorCtx) => ReactNode }) {
  const { user, loading } = useAuth();
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<Hex | null | undefined>(undefined);

  useEffect(() => {
    api.get<PublicConfig>("/config").then((r) => setCfg(r.data)).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    if (user) setSecret(loadSecret(user.id));
  }, [user]);

  if (loading || (user && secret === undefined)) return <p>Memuat...</p>;
  if (!user) {
    return <p>Halaman ini butuh login. <Link href="/login">Masuk</Link> atau <Link href="/register">daftar</Link> sebagai {label}.</p>;
  }
  if (!roles.includes(user.role)) return <p>Halaman ini untuk {label}. Akun Anda berperan {user.role}.</p>;
  if (!secret) {
    return <p>Belum ada secret identitas di browser ini. Buat atau impor di <Link href="/profile">Profil</Link> lebih dulu.</p>;
  }
  if (!user.identityCommitment) {
    return <p>Identitas belum didaftarkan. Daftarkan di <Link href="/profile">Profil</Link> lebih dulu.</p>;
  }
  if (publicIdentity(secret).commitment.toLowerCase() !== user.identityCommitment.toLowerCase()) {
    return <p>Secret di browser ini tidak cocok dengan identitas yang terdaftar pada akun. Impor secret yang benar di <Link href="/profile">Profil</Link>.</p>;
  }
  if (error) return <Err message={error} />;
  if (!cfg) return <p>Memuat konfigurasi...</p>;
  return <>{children({ cfg, userId: user.id, email: user.email, secret })}</>;
}
