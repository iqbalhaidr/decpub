"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

/** Daftar tautan polos. Tautan per peran: penulis, editor, penelaah, admin. */
export default function Nav() {
  const { user, loading, logout } = useAuth();
  return (
    <p>
      <b>DecPub</b> | <Link href="/">Beranda</Link> | <Link href="/journals">Jurnal</Link> | <Link href="/articles">Artikel</Link> |{" "}
      <Link href="/tracker">Pelacak</Link> |{" "}
      {loading ? (
        "..."
      ) : user ? (
        <>
          {(user.role === "author" || user.role === "reviewer") && (
            <>
              <Link href="/author">Penulis</Link> |{" "}
            </>
          )}
          {user.role === "editor" && (
            <>
              <Link href="/editor">Editor</Link> |{" "}
            </>
          )}
          {user.role === "reviewer" && (
            <>
              <Link href="/reviewer/assignments">Undangan</Link> | <Link href="/reviewer/specialization">Spesialisasi</Link> | <Link href="/reviewer/earnings">Imbalan</Link> |{" "}
            </>
          )}
          {user.role === "admin" && (
            <>
              <Link href="/admin">Admin</Link> |{" "}
            </>
          )}
          <Link href="/profile">Profil</Link> ({user.email}, {user.role}) | <a href="#keluar" onClick={(e) => { e.preventDefault(); logout(); }}>Keluar</a>
        </>
      ) : (
        <>
          <Link href="/login">Masuk</Link> | <Link href="/register">Daftar</Link>
        </>
      )}
    </p>
  );
}
