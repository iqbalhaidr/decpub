"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Err from "@/components/Err";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { shortHex } from "@/lib/format";
import type { ManuscriptRow } from "@/lib/types";

/**
 * Pelacak: buka sesi lewat ID (publik), atau lihat naskah milik sendiri bila login.
 * Tidak ada daftar semua sesi: itu akan menautkan sesi ke aktivitas orang.
 */
export default function Tracker() {
  const router = useRouter();
  const { user } = useAuth();
  const [id, setId] = useState("");
  const [mine, setMine] = useState<ManuscriptRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && (user.role === "author" || user.role === "reviewer")) {
      api.get<ManuscriptRow[]>("/manuscripts").then((r) => setMine(r.data)).catch((e) => setError(errorText(e)));
    } else {
      setMine(null);
    }
  }, [user]);

  const open = (e: React.FormEvent) => {
    e.preventDefault();
    const v = id.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(v)) {
      setError("ID sesi harus 0x diikuti 64 digit heksadesimal");
      return;
    }
    router.push(`/tracker/${v.toLowerCase()}`);
  };

  return (
    <div>
      <h1>Pelacak sesi</h1>
      <p>Status 13 tahap, hasil pengecekan, putusan editorial, seleksi, telaah, keputusan, escrow, dan jejak event on-chain. Semua data publik: tanpa nama atau surel.</p>
      <form onSubmit={open}>
        <p>ID sesi: <input type="text" value={id} onChange={(e) => setId(e.target.value)} placeholder="0x..." /> <button type="submit">Buka</button></p>
      </form>
      <Err message={error} />
      {mine && (
        <>
          <h2>Naskah saya</h2>
          {mine.length === 0 ? (
            <p>Belum ada naskah.</p>
          ) : (
            <table>
              <thead><tr><th>Judul</th><th>Dibuat</th><th>Diajukan</th><th>Sesi</th></tr></thead>
              <tbody>
                {mine.map((m) => (
                  <tr key={m.id}>
                    <td>{m.title}</td>
                    <td>{m.createdAt}</td>
                    <td>{m.submittedAt ?? "(belum)"}</td>
                    <td><Link href={`/tracker/${m.sessionId}`}><code>{shortHex(m.sessionId, 14)}</code></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
