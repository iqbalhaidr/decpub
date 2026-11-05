"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthorGate from "@/components/AuthorGate";
import Err from "@/components/Err";
import { errorText } from "@/lib/api";
import { shortHex } from "@/lib/format";
import { loadOwnSessions, statusOf, type OwnSession } from "@/lib/sessions";

function Mine() {
  const [rows, setRows] = useState<OwnSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadOwnSessions().then(setRows).catch((e) => setError(errorText(e)));
  }, []);
  return (
    <div>
      <Err message={error} />
      {!rows ? (
        <p>Memuat...</p>
      ) : rows.length === 0 ? (
        <p>Belum ada naskah. <Link href="/author/submit">Ajukan naskah</Link>.</p>
      ) : (
        <table>
          <thead><tr><th>Judul</th><th>Sesi</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.manuscript.id}>
                <td>{r.manuscript.title}</td>
                <td><code>{shortHex(r.manuscript.sessionId, 14)}</code></td>
                <td>{statusOf(r)}</td>
                <td>
                  {r.manuscript.submittedAt ? <Link href={`/author/sessions/${r.manuscript.sessionId}`}>rincian</Link> : "(hanya intake; ajukan ulang)"}
                  {r.detail?.session?.status.endsWith("RevisionRequired") && <> | <Link href={`/author/revise?session=${r.manuscript.sessionId}`}>revisi</Link></>}
                  {r.detail?.session?.status === "Published" && <> | <Link href={`/author/disclose?session=${r.manuscript.sessionId}`}>ungkap identitas</Link></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function AuthorHome() {
  return (
    <div>
      <h1>Penulis</h1>
      <ul>
        <li><Link href="/author/apc">Beli note APC</Link> (biaya pemrosesan artikel dibayar di muka ke escrow)</li>
        <li><Link href="/author/submit">Ajukan naskah</Link></li>
        <li><Link href="/profile">Secret identitas</Link></li>
      </ul>
      <h2>Naskah saya</h2>
      <AuthorGate>{() => <Mine />}</AuthorGate>
    </div>
  );
}
