"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { privateKeyToAddress, generatePrivateKey } from "viem/accounts";
import type { Address, Hex } from "viem";
import AuthorGate from "@/components/AuthorGate";
import Err from "@/components/Err";
import { bindNote, noteOnChain, refundNote, type AuthorCtx } from "@/lib/author";
import { api, errorText } from "@/lib/api";
import { eth, shortHex, when } from "@/lib/format";
import { loadNotes, noteOfSession, type StoredNote } from "@/lib/notes";
import type { EscrowStatus, OwnerDetail, SessionProjection } from "@/lib/types";

function Session({ ctx, sessionId }: { ctx: AuthorCtx; sessionId: Hex }) {
  const [detail, setDetail] = useState<OwnerDetail | null>(null);
  const [pub, setPub] = useState<SessionProjection | null>(null);
  const [escrow, setEscrow] = useState<EscrowStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [newKey, setNewKey] = useState<Hex | null>(null);
  const [noteChoice, setNoteChoice] = useState("");
  const [spares, setSpares] = useState<StoredNote[]>([]);
  const [allNotes, setAllNotes] = useState<StoredNote[]>([]);
  const [refundChoice, setRefundChoice] = useState("");

  const load = useCallback(async () => {
    const [d, p, e] = await Promise.all([
      api.get<OwnerDetail>(`/flows/sessions/${sessionId}`),
      api.get<SessionProjection>(`/public/sessions/${sessionId}`).catch(() => null),
      api.get<EscrowStatus>(`/escrow/${sessionId}`).catch(() => null),
    ]);
    setDetail(d.data);
    setPub(p?.data ?? null);
    setEscrow(e?.data ?? null);
    setSpares(loadNotes(ctx.userId).filter((n) => n.status === "deposited" && !n.boundSession));
    setAllNotes(loadNotes(ctx.userId).filter((n) => n.status === "deposited"));
  }, [sessionId, ctx.userId]);

  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
    const t = setInterval(() => load().catch(() => undefined), 5000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!detail) return <div><Err message={error} /><p>Memuat...</p></div>;
  const status = detail.session?.status ?? "(belum diajukan)";
  const note = noteOfSession(ctx.userId, sessionId);
  const escrowState = escrow?.state ?? "?";

  const advance = (recheck: boolean) =>
    act(async () => {
      const r = await api.post<{ status: string; steps: unknown[]; notes?: string[] }>(`/flows/sessions/${sessionId}/advance`, { recheck });
      setInfo(`Dijalankan. Status: ${r.data.status}. ${(r.data.notes ?? []).join(" ")}`);
    });

  const bind = () =>
    act(async () => {
      const n = loadNotes(ctx.userId).find((x) => x.secret === noteChoice);
      if (!n) throw new Error("Pilih note");
      const c = await noteOnChain(ctx.cfg, n.secret);
      if (!c.deposited || c.used) throw new Error(c.used ? "Note itu sudah terikat ke sesi lain" : "Note itu tidak ada sebagai setoran di chain");
      await bindNote(ctx, sessionId, n);
      setInfo("APC terikat. Langkah sistem berikutnya dijalankan server.");
    });

  const refund = () =>
    act(async () => {
      // Bila catatan ikatan hilang (data browser dibersihkan), penulis memilih note dari hasil impor; zk-sim menolak note yang salah.
      const chosen = note ?? allNotes.find((n) => n.secret === refundChoice);
      if (!chosen) throw new Error("Pilih note untuk refund (impor rahasia note di /author/apc bila belum ada)");
      if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) throw new Error("Isi alamat penerima baru (0x + 40 heksadesimal)");
      const r = await refundNote(ctx, sessionId, chosen, recipient as Address);
      setInfo(`Refund terkirim ke ${recipient}, tx ${r.tx.txHash}.`);
    });

  const newAddress = () => {
    const k = generatePrivateKey();
    setNewKey(k);
    setRecipient(privateKeyToAddress(k));
  };

  const s = detail.session;
  return (
    <div>
      <h1>Sesi <code>{shortHex(sessionId, 18)}</code></h1>
      <Err message={error} />
      {info && <p>{info}</p>}
      <p>Naskah: <b>{detail.title}</b></p>
      {s ? (
        <p>Status: <b>{status}</b> (tahap {s.statusValue}) | revisi ke-{s.revisionCount} | diperbarui {when(s.updatedAt)}</p>
      ) : (
        <p>Naskah ini belum diajukan ke sesi on-chain.</p>
      )}
      <p>
        <Link href={`/tracker/${sessionId}`}>Halaman pelacak publik (jejak event on-chain)</Link> | <Link href="/author">Naskah saya</Link>
        {status.endsWith("RevisionRequired") && <> | <Link href={`/author/revise?session=${sessionId}`}><b>Kirim revisi</b></Link></>}
        {status === "Published" && <> | <Link href={`/articles/${sessionId}`}>Artikel</Link> | <Link href={`/author/disclose?session=${sessionId}`}><b>Ungkap identitas</b></Link></>}
      </p>

      {detail.warnings.map((w) => <p key={w}><b>PERINGATAN:</b> {w}</p>)}

      <h2>Hash on-chain</h2>
      {s && (
        <table>
          <tbody>
            <tr><th>Naskah asli (sha256)</th><td><code>{s.originalManuscriptHash}</code></td></tr>
            <tr><th>Naskah anonim (sha256)</th><td><code>{s.anonymizedManuscriptHash}</code></td></tr>
            <tr><th>Metadata (bersalt)</th><td><code>{s.metadataHash}</code></td></tr>
          </tbody>
        </table>
      )}
      {detail.anonymizedManuscriptUrl && <p>Naskah anonim di storage publik: <a href={detail.anonymizedManuscriptUrl}>unduh</a>. Naskah asli tidak ada di sana.</p>}

      <h2>P03 Pengecekan otomatis</h2>
      {detail.automaticCheck && detail.report ? (
        <table>
          <tbody>
            <tr><th>Hasil</th><td><b>{detail.automaticCheck.result}</b> (batch {detail.automaticCheck.batch}, {when(detail.automaticCheck.recordedAt)})</td></tr>
            <tr><th>Halaman</th><td>{detail.report.pageCount}</td></tr>
            <tr><th>Plagiarisme [SIMULASI]</th><td>skor {detail.report.plagiarism.score} (ambang {detail.report.plagiarism.threshold})</td></tr>
            <tr><th>Identitas terbaca di isi PDF</th><td>{detail.report.identityExposedFields.length ? `YA: ${detail.report.identityExposedFields.join(", ")}` : "tidak terdeteksi"}</td></tr>
            <tr><th>Catatan</th><td>{detail.report.notes}</td></tr>
          </tbody>
        </table>
      ) : (
        <p>Belum ada.</p>
      )}
      {status === "Incomplete" && (
        <p>Metadata kurang. Dengan berkas yang sama sistem hanya bisa memeriksa ulang: <button onClick={() => advance(true)} disabled={busy}>Periksa ulang</button></p>
      )}
      {status === "Submitted" && <p>Menunggu pengecekan. <button onClick={() => advance(false)} disabled={busy}>Jalankan langkah sistem</button></p>}

      <h2>Posisi pada alur (publik)</h2>
      {pub ? (
        <table>
          <tbody>
            <tr><th>Putusan editorial</th><td>{pub.editorial ? `${pub.editorial.decision} (revisi ${pub.editorial.revision})` : "belum ada"}</td></tr>
            <tr><th>Penelaah</th><td>batch {pub.selection.batch}: terpilih {pub.selection.selected}, mengikat {pub.selection.bound}; fase {pub.review.phase}; commit {pub.review.committed}, reveal {pub.review.revealed}</td></tr>
            <tr><th>Keputusan</th><td>{pub.decisions.length ? pub.decisions.map((d) => `batch ${d.batch}: ${d.outcome}${d.grayZone ? " (zona abu-abu)" : ""}`).join("; ") : "belum ada"}</td></tr>
            {pub.publication && <tr><th>DOI</th><td>{pub.publication.doi}</td></tr>}
          </tbody>
        </table>
      ) : (
        <p>(tidak tersedia)</p>
      )}

      <h2>Escrow APC</h2>
      {escrow ? (
        <table>
          <tbody>
            <tr><th>Status</th><td>{escrow.state}</td></tr>
            <tr><th>Jumlah</th><td>{eth(escrow.amountWei, 4)}</td></tr>
            <tr><th>Boleh refund</th><td>{escrow.refundable ? "ya" : "tidak"}</td></tr>
            <tr><th>Boleh dibagikan ke penelaah</th><td>{escrow.distributable ? "ya" : "tidak"}</td></tr>
          </tbody>
        </table>
      ) : (
        <p>(tidak tersedia)</p>
      )}
      <p>Note terikat (catatan browser ini): {note ? <code>{shortHex(note.commitment, 14)}</code> : "tidak ada"}. <Link href={`/incentive/${sessionId}`}>Transparansi insentif</Link></p>

      {ctx.cfg.escrowRequired && escrowState === "None" && s && (
        <>
          <h3>Ikat APC</h3>
          <p>Sesi menunggu APC; pengecekan baru jalan setelah APC terikat.</p>
          {spares.length === 0 ? (
            <p>Tidak ada note. <Link href="/author/apc">Beli di sini</Link>.</p>
          ) : (
            <p>
              <select name="note" value={noteChoice} onChange={(e) => setNoteChoice(e.target.value)}>
                <option value="">(pilih note)</option>
                {spares.map((n) => <option key={n.secret} value={n.secret}>note {shortHex(n.commitment, 14)}</option>)}
              </select>{" "}
              <button onClick={bind} disabled={busy}>Ikat ke sesi ini</button>
            </p>
          )}
        </>
      )}

      {escrow?.refundable && (
        <>
          <h3>Refund APC</h3>
          <p>
            Naskah ditolak sebelum ada penelaah (atau sesi macet): APC kembali penuh. Kirim ke <b>alamat yang belum pernah dipakai</b>; bila dikirim ke
            dompet penyetor, penyetor dan pengaju sesi tertaut. Penerima terikat pada bukti, relayer tidak bisa mengalihkannya.
          </p>
          {!note && (
            <p>
              Browser ini tidak punya catatan note yang terikat ke sesi ini. Pilih note yang dulu diikat ke sesi ini (hasil impor di <Link href="/author/apc">/author/apc</Link>):{" "}
              <select name="refundNote" value={refundChoice} onChange={(e) => setRefundChoice(e.target.value)}>
                <option value="">(pilih note)</option>
                {allNotes.map((n) => <option key={n.secret} value={n.secret}>note {shortHex(n.commitment, 14)}</option>)}
              </select>
            </p>
          )}
          <p>
            <input type="text" name="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x... alamat baru" />{" "}
            <button onClick={newAddress}>Buat alamat baru</button>{" "}
            <button onClick={refund} disabled={busy}>Refund</button>
          </p>
          {newKey && <p>Kunci privat alamat baru (simpan, hanya tampil di sini): <code>{newKey}</code></p>}
        </>
      )}
      {escrowState === "Refunded" && <p>APC sudah di-refund; sesi dihentikan.</p>}
    </div>
  );
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AuthorGate>{(ctx) => <Session ctx={ctx} sessionId={id as Hex} />}</AuthorGate>;
}
