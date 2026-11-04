"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Err from "@/components/Err";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { shortHex, when } from "@/lib/format";
import type { CommentsResponse } from "@/lib/types";

/**
 * Komentar pembaca. Isi di server, hash di event DOIToken on-chain; "cocok" berarti hash dihitung ulang sama dengan event.
 * Diposting relayer, jadi pembaca hanya dibedakan lewat nama tampilan per artikel (tanpa surel).
 */
export default function Comments({ sessionId }: { sessionId: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<CommentsResponse | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData((await api.get<CommentsResponse>(`/articles/${sessionId}/comments`)).data);
    } catch (e) {
      setError(errorText(e));
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/articles/${sessionId}/comments`, { text });
      setText("");
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2>Komentar</h2>
      <Err message={error} />
      {data && data.comments.length === 0 && <p>Belum ada komentar.</p>}
      {data && data.comments.length > 0 && (
        <table>
          <thead><tr><th>Nama</th><th>Isi</th><th>Waktu</th><th>Hash on-chain</th><th>Cocok</th></tr></thead>
          <tbody>
            {data.comments.map((c) => (
              <tr key={c.contentHash}>
                <td>{c.handle ?? "(langsung ke chain)"}</td>
                <td>{c.body ?? "(isi tidak ada di server)"}</td>
                <td>{when(c.postedAt)}</td>
                <td><code>{shortHex(c.contentHash, 12)}</code> tx <code>{shortHex(c.txHash, 12)}</code></td>
                <td>{c.verified ? "ya" : "tidak"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {user ? (
        <form onSubmit={post}>
          <p><textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis komentar" required /></p>
          <p><button type="submit" disabled={busy}>Kirim komentar</button></p>
        </form>
      ) : (
        <p><Link href="/login">Masuk</Link> untuk berkomentar.</p>
      )}
    </div>
  );
}
