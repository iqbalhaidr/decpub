import Link from "next/link";
import axios from "axios";
import Err from "@/components/Err";
import { getJson } from "@/lib/api";
import { eth, shortHex, when } from "@/lib/format";
import { PUBLICATION_STATUS_NAMES } from "@decpub/shared";
import type { AuditEntry, CheckReport, EscrowStatus, SessionProjection } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Status yang dilewati alur utama; sisanya cabang (revisi, Incomplete, Rejected). */
const MAIN_PATH = ["Submitted", "UnderAutomaticChecking", "UnderAnonymization", "UnderEditorialScreening", "AssigningReviewers", "UnderReview", "Accepted", "Published"];

async function tryJson<T>(path: string): Promise<T | null> {
  try {
    return await getJson<T>(path);
  } catch {
    return null;
  }
}

export default async function TrackerSession({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let p: SessionProjection | null = null;
  let error: string | null = null;
  try {
    p = await getJson<SessionProjection>(`/public/sessions/${id}`);
  } catch (e) {
    error = (e as Error).message;
  }
  if (!p) {
    return (
      <div>
        <h1>Sesi</h1>
        <Err message={error} />
        <p><Link href="/tracker">Kembali</Link></p>
      </div>
    );
  }

  const [trail, escrow, report] = await Promise.all([
    tryJson<{ entries: AuditEntry[] }>(`/public/sessions/${id}/audit-trail`),
    tryJson<EscrowStatus>(`/escrow/${id}`),
    p.reportUrl ? axios.get<CheckReport>(p.reportUrl).then((r) => r.data).catch(() => null) : Promise.resolve(null),
  ]);
  const s = p.session;
  const inMain = MAIN_PATH.includes(s.status);

  return (
    <div>
      <h1>Sesi <code>{shortHex(s.sessionId, 18)}</code></h1>
      <p>Status: <b>{s.status}</b> (tahap {s.statusValue} dari 12) | revisi ke-{s.revisionCount} | dibuat {when(s.createdAt)} | diperbarui {when(s.updatedAt)}</p>
      {p.publication && (
        <p>Terbit: DOI {p.publication.doi}. <Link href={`/articles/${s.sessionId}`}>Buka artikel</Link></p>
      )}

      <h2>Posisi pada alur</h2>
      <ol>
        {MAIN_PATH.map((n) => (
          <li key={n}>{n === s.status ? <b>{n} &lt;-- di sini</b> : n}</li>
        ))}
      </ol>
      {!inMain && <p>Status saat ini ada di cabang: <b>{s.status}</b> ({PUBLICATION_STATUS_NAMES.filter((n) => !MAIN_PATH.includes(n) && n !== "None").join(", ")}).</p>}

      <h2>Hash on-chain</h2>
      <table>
        <tbody>
          <tr><th>Naskah asli (sha256)</th><td><code>{s.originalManuscriptHash}</code></td></tr>
          <tr><th>Naskah anonim (sha256)</th><td><code>{s.anonymizedManuscriptHash}</code></td></tr>
          <tr><th>Metadata (bersalt)</th><td><code>{s.metadataHash}</code></td></tr>
        </tbody>
      </table>
      <p>Naskah anonim: <a href={p.anonymizedManuscriptUrl}>unduh</a>. Naskah asli tidak ada di storage publik.</p>

      <h2>Escrow APC</h2>
      {escrow ? (
        <table>
          <tbody>
            <tr><th>Status</th><td>{escrow.state}</td></tr>
            <tr><th>Jumlah</th><td>{eth(escrow.amountWei, 4)}</td></tr>
            <tr><th>Belum diklaim penelaah</th><td>{eth(escrow.unclaimedWei, 6)}</td></tr>
            <tr><th>Boleh refund</th><td>{escrow.refundable ? "ya" : "tidak"}</td></tr>
            <tr><th>Boleh dibagikan</th><td>{escrow.distributable ? "ya" : "tidak"}</td></tr>
          </tbody>
        </table>
      ) : (
        <p>(tidak tersedia)</p>
      )}
      <p><Link href={`/incentive/${s.sessionId}`}>Transparansi insentif penelaah</Link></p>

      <h2>P03 Pengecekan otomatis</h2>
      {p.automaticCheck ? (
        <>
          <p>Batch {p.automaticCheck.batch}: <b>{p.automaticCheck.result}</b> pada {when(p.automaticCheck.recordedAt)}. <a href={p.reportUrl!}>Berkas laporan</a></p>
          {report && (
            <table>
              <tbody>
                <tr><th>Halaman</th><td>{report.pageCount}</td></tr>
                <tr><th>Ukuran</th><td>{report.fileSize} byte</td></tr>
                <tr><th>Plagiarisme</th><td>skor {report.plagiarism.score} (ambang {report.plagiarism.threshold}, {report.plagiarism.provider})</td></tr>
                <tr><th>Bendera</th><td>{Object.entries(report.flags).map(([k, v]) => `${k}=${String(v)}`).join(", ")}</td></tr>
                <tr><th>Peringatan identitas di isi PDF</th><td>{report.identityExposedFields.length ? `TERBACA: ${report.identityExposedFields.join(", ")} (anonimisasi hanya menghapus metadata dan sampul)` : "tidak terdeteksi"}</td></tr>
                <tr><th>Catatan</th><td>{report.notes}</td></tr>
              </tbody>
            </table>
          )}
        </>
      ) : (
        <p>Belum ada.</p>
      )}

      <h2>P05 Penyaringan editorial</h2>
      {p.editorial ? (
        <p>Revisi {p.editorial.revision}: putusan <b>{p.editorial.decision}</b> pada {when(p.editorial.recordedAt)}. <a href={p.editorial.reportUrl}>Laporan editorial (anonim)</a></p>
      ) : (
        <p>Belum ada.</p>
      )}

      <h2>P06-P07 Penelaah dan telaah</h2>
      <table>
        <tbody>
          <tr><th>Batch terakhir</th><td>{p.selection.batch} (terpilih {p.selection.selected}, mengikat penugasan {p.selection.bound})</td></tr>
          <tr><th>Fase telaah</th><td>{p.review.phase}</td></tr>
          <tr><th>Batch dalam ronde ini</th><td>{p.review.roundBatches.join(", ") || "-"}</td></tr>
          <tr><th>Sudah commit / reveal</th><td>{p.review.committed} / {p.review.revealed}</td></tr>
        </tbody>
      </table>
      {p.review.reviews ? (
        <table>
          <thead><tr><th>Pseudonim</th><th>Rekomendasi</th><th>Dibuka</th><th>Berkas</th></tr></thead>
          <tbody>
            {p.review.reviews.map((r) => (
              <tr key={r.pseudonym}><td><code>{shortHex(r.pseudonym, 14)}</code></td><td>{r.recommendation}</td><td>{when(r.revealedAt)}</td><td><a href={r.reviewUrl}>telaah</a></td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Isi telaah baru tampil setelah semua penelaah membuka (fase Closed).</p>
      )}

      <h2>Keputusan</h2>
      {p.decisions.length === 0 ? (
        <p>Belum ada keputusan.</p>
      ) : (
        <table>
          <thead><tr><th>Batch</th><th>Hasil</th><th>Penelaah</th><th>Zona abu-abu</th><th>Waktu</th></tr></thead>
          <tbody>
            {p.decisions.map((d) => (
              <tr key={d.batch}><td>{d.batch}</td><td>{d.outcome}</td><td>{d.reviewerCount}</td><td>{d.grayZone ? `ya (+${d.additionalReviewerCount ?? 0})` : "tidak"}</td><td>{when(d.decidedAt)}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Jejak event on-chain</h2>
      <p>Dibaca dari log kontrak, berurutan menurut blok.</p>
      {trail ? (
        <table>
          <thead><tr><th>#</th><th>Blok</th><th>Waktu</th><th>Kontrak</th><th>Event</th><th>Keterangan</th><th>Tx</th></tr></thead>
          <tbody>
            {trail.entries.map((e) => (
              <tr key={`${e.txHash}-${e.logIndex}`}>
                <td>{e.order}</td><td>{e.blockNumber}</td><td>{when(e.timestamp)}</td><td>{e.contract}</td><td>{e.event}</td><td>{e.summary}</td><td><code>{shortHex(e.txHash, 10)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>(tidak tersedia)</p>
      )}
    </div>
  );
}
