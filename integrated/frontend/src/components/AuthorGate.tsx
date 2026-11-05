"use client";

/**
 * Pintu halaman penulis: memastikan sudah login, punya secret di browser ini, dan identitas terdaftar dengan
 * commitment yang sama. Bila belum, menjelaskan apa yang kurang dan menautkan ke /profile. Setelah lolos,
 * anak dirender dengan konteks (konfigurasi server, id akun, secret).
 */
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { Hex } from "viem";
import Err from "@/components/Err";
import type { AuthorCtx } from "@/lib/author";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadSecret, publicIdentity } from "@/lib/secret";
import type { PublicConfig } from "@/lib/types";

export default function AuthorGate({ children }: { children: (ctx: AuthorCtx) => ReactNode }) {
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
    return <p>Halaman ini butuh login. <Link href="/login">Masuk</Link> atau <Link href="/register">daftar</Link> sebagai penulis.</p>;
  }
  if (user.role !== "author" && user.role !== "reviewer") return <p>Halaman ini untuk penulis. Akun Anda berperan {user.role}.</p>;
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
  return <>{children({ cfg, userId: user.id, secret })}</>;
}
