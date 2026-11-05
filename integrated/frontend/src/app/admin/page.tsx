"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Err from "@/components/Err";
import ProgressNote from "@/components/ProgressNote";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { FieldRequest, JournalList, ProgressSummary, PublicConfig } from "@/lib/types";

/** Satu jurnal: kebijakan bobot insentif (preset BWM dan λ). Berlaku untuk sesi baru; sesi yang ada tetap memakai kebijakan saat dibuat (D1). */
function JournalRow({ j, presets, onSaved }: { j: JournalList["journals"][number]; presets: string[]; onSaved: (msg: string) => void }) {
  const [preset, setPreset] = useState(j.weightPolicy.preset);
  const [lambda, setLambda] = useState(String(j.weightPolicy.lambda));
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    try {
      await api.patch(`/journals/${j.id}/weight-policy`, { preset, lambda: Number(lambda) });
      onSaved(`Kebijakan jurnal "${j.name}" disimpan: ${preset}, λ ${lambda}. Hanya untuk sesi yang dibuat sesudah ini.`);
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <tr>
      <td>{j.name}</td>
      <td>{j.categoryLabel}</td>
      <td>
        <select name={`preset-${j.id}`} value={preset} onChange={(e) => setPreset(e.target.value)}>
          {presets.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </td>
      <td><input type="text" name={`lambda-${j.id}`} size={4} value={lambda} onChange={(e) => setLambda(e.target.value)} /></td>
      <td><button onClick={save}>Simpan</button>{error && <> GALAT: {error}</>}</td>
    </tr>
  );
}

function AdminHome() {
  const [requests, setRequests] = useState<FieldRequest[] | null>(null);
  const [journals, setJournals] = useState<JournalList | null>(null);
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [sessionId, setSessionId] = useState("");

  const load = useCallback(async () => {
    const [r, j, c, p] = await Promise.all([
      api.get<FieldRequest[]>("/admin/field-requests"),
      api.get<JournalList>("/journals"),
      api.get<PublicConfig>("/config"),
      api.get<{ pending: number }>("/incentive/reputation-claims/pending"),
    ]);
    setRequests(r.data);
    setJournals(j.data);
    setCfg(c.data);
    setPending(p.data.pending);
  }, []);
  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
  }, [load]);

  const act = async (fn: () => Promise<string | void>) => {
    setError(null);
    setInfo(null);
    setProgress(null);
    try {
      const msg = await fn();
      if (msg) setInfo(msg);
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const decide = (r: FieldRequest, verb: "approve" | "reject") =>
    act(async () => {
      await api.post(`/admin/field-requests/${r.id}/${verb}`);
      return verb === "approve" ? `Permintaan #${r.id} disetujui: kredensial bidang ${r.fields.join(", ")} kini bisa diterbitkan.` : `Permintaan #${r.id} ditolak.`;
    });

  const flush = () =>
    act(async () => {
      const r = (await api.post<{ minted: number; transactions: string[]; rejected: unknown[] }>("/admin/epochs/flush")).data;
      return `Epoch dipicu: ${r.minted} klaim reputasi dimint dalam ${r.transactions.length} transaksi${r.rejected.length ? `; ${r.rejected.length} ditolak chain` : ""}.`;
    });

  const sessionAction = (path: "admin/sessions" | "system/sessions", verb: "close-phase" | "progress") =>
    act(async () => {
      if (!/^0x[0-9a-fA-F]{64}$/.test(sessionId)) throw new Error("Isi ID sesi (0x + 64 heksadesimal)");
      const r = (await api.post<ProgressSummary & { progress?: ProgressSummary }>(`/${path}/${sessionId}/${verb}`)).data;
      setProgress(r.progress ?? r);
      return verb === "close-phase" ? "Fase telaah ditutup." : "Langkah sistem dijalankan.";
    });

  return (
    <div>
      <h1>Admin</h1>
      <Err message={error} />
      {info && <p>{info}</p>}

      <h2>Verifikasi bidang penelaah</h2>
      <p>Hanya penelaah dengan bidang terverifikasi yang menjadi kandidat seleksi. Admin yang menyetujui, bukan editor (editor tidak boleh melihat surel kandidat).</p>
      {!requests ? (
        <p>Memuat...</p>
      ) : requests.length === 0 ? (
        <p>Tidak ada permintaan menunggu.</p>
      ) : (
        <table>
          <thead><tr><th>#</th><th>Pemohon</th><th>Bidang</th><th>Diajukan</th><th>Aksi</th></tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td><td>{r.email}</td><td>{r.fields.join(", ")}</td><td>{r.createdAt}</td>
                <td><button onClick={() => decide(r, "approve")}>Setujui</button> <button onClick={() => decide(r, "reject")}>Tolak</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Kebijakan bobot insentif per jurnal</h2>
      <p>Preset BWM dan λ (W = λ·Wsub + (1-λ)·Wobj). Dikunci saat sesi dibuat; mengubahnya tidak memengaruhi sesi yang sudah ada.</p>
      {journals && (
        <table>
          <thead><tr><th>Jurnal</th><th>Kategori</th><th>Preset</th><th>λ (0-1)</th><th></th></tr></thead>
          <tbody>{journals.journals.map((j) => <JournalRow key={j.id} j={j} presets={journals.weightPresets} onSaved={(m) => { setInfo(m); load().catch(() => undefined); }} />)}</tbody>
        </table>
      )}

      <h2>Epoch reputasi</h2>
      <p>Klaim reputasi menunggu: <b>{pending ?? "?"}</b>. Mint berkelompok dan acak, sehingga waktu dan isi mint tidak tertaut ke sesi mana pun.</p>
      <p><button onClick={flush}>Picu epoch</button></p>

      <h2>Pemeliharaan sesi</h2>
      <p>
        Tenggat belum otomatis. <i>Tutup fase</i> mewakili tenggat yang terlewat bagi penelaah yang tidak commit/reveal (hanya yang reveal dihitung);
        <i> Jalankan langkah sistem</i> memajukan sesi yang tertunda (idempoten).
      </p>
      <p>
        ID sesi: <input type="text" name="sessionId" value={sessionId} onChange={(e) => setSessionId(e.target.value.trim())} placeholder="0x..." />{" "}
        <button onClick={() => sessionAction("admin/sessions", "close-phase")}>Tutup fase</button>{" "}
        <button onClick={() => sessionAction("system/sessions", "progress")}>Jalankan langkah sistem</button>
      </p>
      <ProgressNote progress={progress} />
      {sessionId && <p><Link href={`/tracker/${sessionId}`}>Pelacak sesi ini</Link></p>}

      {cfg && (
        <>
          <h2>Jaringan dan alamat kontrak</h2>
          <p>{cfg.network} (chainId {cfg.chainId})</p>
          <table>
            <tbody>{Object.entries(cfg.contracts).map(([n, a]) => <tr key={n}><td>{n}</td><td><code>{a}</code></td></tr>)}</tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  if (loading) return <p>Memuat...</p>;
  if (!user) return <p>Halaman ini butuh login. <Link href="/login">Masuk</Link> sebagai admin.</p>;
  if (user.role !== "admin") return <p>Halaman ini untuk admin. Akun Anda berperan {user.role}.</p>;
  return <AdminHome />;
}
