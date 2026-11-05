"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthorGate from "@/components/AuthorGate";
import Err from "@/components/Err";
import Steps from "@/components/Steps";
import { intakeRevision, submitRevision, type AuthorCtx } from "@/lib/author";
import { api, API_URL, errorText } from "@/lib/api";
import { shortHex } from "@/lib/format";
import { loadOwnSessions, type OwnSession } from "@/lib/sessions";
import type { SessionProjection } from "@/lib/types";

function Revise({ ctx }: { ctx: AuthorCtx }) {
  const [rows, setRows] = useState<OwnSession[] | null>(null);
  const [pick, setPick] = useState("");
  const [pub, setPub] = useState<SessionProjection | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [keywords, setKeywords] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    loadOwnSessions()
      .then((all) => {
        const need = all.filter((r) => r.detail?.session?.status.endsWith("RevisionRequired"));
        setRows(need);
        const wanted = new URLSearchParams(window.location.search).get("session");
        setPick(need.find((r) => r.manuscript.sessionId === wanted)?.manuscript.sessionId ?? need[0]?.manuscript.sessionId ?? "");
      })
      .catch((e) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    setPub(null);
    if (pick) api.get<SessionProjection>(`/public/sessions/${pick}`).then((r) => setPub(r.data)).catch(() => undefined);
  }, [pick]);

  const log = (s: string) => setSteps((x) => [...x, s]);
  const chosen = rows?.find((r) => r.manuscript.sessionId === pick);

  const send = async () => {
    setError(null);
    setSteps([]);
    setDone(null);
    setBusy(true);
    try {
      if (!chosen) throw new Error("Pilih sesi");
      let pdf: Blob;
      let filename: string;
      if (file) {
        pdf = file;
        filename = file.name;
      } else {
        log("Tidak ada berkas dipilih: memakai PDF contoh bersih dengan isi baru.");
        const r = await fetch(`${API_URL}/manuscripts/samples/clean?title=${encodeURIComponent(title || chosen.manuscript.title)}&seed=${Date.now()}`);
        if (!r.ok) throw new Error(`Gagal mengambil contoh: ${r.status}`);
        pdf = await r.blob();
        filename = "revisi.pdf";
      }
      log("1. Unggah revisi: server menganonimkan seperti P04 dan menghitung hash baru (belum ada yang dicatat on-chain).");
      const it = await intakeRevision(chosen.manuscript.id, pdf, filename, { title, abstract, keywords });
      log(`   Revisi ke-${it.revision}. Status berikutnya: ${it.nextStatus}. Peringatan: ${it.warnings.length ? it.warnings.join("; ") : "tidak ada"}.`);
      log("2. Menandatangani RecordRevision (EIP-712) dengan kunci pseudonim Author sesi ini, lalu mengirim.");
      const r = await submitRevision(ctx, it);
      log(`   Tercatat on-chain, tx ${shortHex(r.tx.txHash, 14)}. Status: ${r.status}. ${r.progress ? `Langkah sistem: ${r.progress.actions.join(", ") || "-"}${r.progress.blocked ? ` (tertunda: ${r.progress.blocked})` : ""}.` : ""}`);
      setDone(chosen.manuscript.sessionId);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>Kirim revisi</h1>
      <Err message={error} />
      <p>
        Hanya untuk sesi yang diminta revisi. Minor kembali ke pemilihan penelaah (orang yang sama, pseudonim baru); Major kembali ke editor yang sama.
        Revisi tidak menjalankan ulang pengecekan P03 (batasan rancangan).
      </p>
      {!rows ? (
        <p>Memuat...</p>
      ) : rows.length === 0 ? (
        <p>Tidak ada naskah yang sedang diminta revisi. <Link href="/author">Naskah saya</Link>.</p>
      ) : (
        <>
          <table>
            <tbody>
              <tr><th>Sesi</th><td>
                <select name="session" value={pick} onChange={(e) => setPick(e.target.value)}>
                  {rows.map((r) => <option key={r.manuscript.id} value={r.manuscript.sessionId}>{r.manuscript.title} ({r.detail?.session?.status})</option>)}
                </select>
              </td></tr>
              {pub && (
                <>
                  <tr><th>Putusan editorial</th><td>{pub.editorial ? `${pub.editorial.decision}` : "-"}</td></tr>
                  <tr><th>Keputusan penelaah</th><td>{pub.decisions.length ? pub.decisions.map((d) => `batch ${d.batch}: ${d.outcome}`).join("; ") : "-"}</td></tr>
                </>
              )}
              <tr><th>Berkas revisi (PDF)</th><td><input type="file" name="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /> (kosong = PDF contoh)</td></tr>
              <tr><th>Judul baru (opsional)</th><td><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></td></tr>
              <tr><th>Abstrak baru (opsional)</th><td><textarea rows={3} value={abstract} onChange={(e) => setAbstract(e.target.value)} /></td></tr>
              <tr><th>Kata kunci baru (opsional)</th><td><input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} /></td></tr>
            </tbody>
          </table>
          <p><button onClick={send} disabled={busy || !chosen}>{busy ? "Memproses..." : "Kirim revisi"}</button></p>
        </>
      )}
      <Steps items={steps} />
      {done && <p><Link href={`/author/sessions/${done}`}>Kembali ke halaman sesi</Link></p>}
    </div>
  );
}

export default function RevisePage() {
  return <AuthorGate>{(ctx) => <Revise ctx={ctx} />}</AuthorGate>;
}
