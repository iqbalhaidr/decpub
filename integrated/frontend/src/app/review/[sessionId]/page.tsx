"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import type { Hex } from "viem";
import Err from "@/components/Err";
import ProgressNote from "@/components/ProgressNote";
import RoleGate from "@/components/RoleGate";
import type { AuthorCtx } from "@/lib/author";
import { api, errorText } from "@/lib/api";
import { recName, shortHex } from "@/lib/format";
import { commitReview, revealReview } from "@/lib/party";
import { loadPending, type PendingReview } from "@/lib/pending";
import type { Invite, ProgressSummary, SessionProjection } from "@/lib/types";

const RECS: { value: 1 | 2 | 3 | 4; label: string }[] = [
  { value: 4, label: "AcceptAsIs: terima apa adanya" },
  { value: 3, label: "MinorRevision: revisi kecil" },
  { value: 2, label: "MajorRevision: revisi besar" },
  { value: 1, label: "Reject: tolak" },
];

/** Satu kursi penelaah (satu batch). Fase dibaca dari chain lewat proyeksi publik. */
function Seat({ ctx, invite }: { ctx: AuthorCtx; invite: Invite }) {
  const [pub, setPub] = useState<SessionProjection | null>(null);
  const [pend, setPend] = useState<PendingReview | null>(() => loadPending(ctx.userId, invite.sessionId, invite.slot));
  const [rec, setRec] = useState<1 | 2 | 3 | 4>(4);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const load = useCallback(async () => {
    setPub((await api.get<SessionProjection>(`/public/sessions/${invite.sessionId}`)).data);
    setPend(loadPending(ctx.userId, invite.sessionId, invite.slot));
  }, [invite.sessionId, invite.slot, ctx.userId]);
  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
    const t = setInterval(() => load().catch(() => undefined), 4000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (fn: () => Promise<{ progress?: ProgressSummary }>, done: string) => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const r = await fn();
      setProgress(r.progress ?? null);
      setInfo(done);
      await load();
    } catch (e) {
      setError(errorText(e));
      setPend(loadPending(ctx.userId, invite.sessionId, invite.slot));
    } finally {
      setBusy(false);
    }
  };

  const phase = pub?.review.phase ?? "?";
  const mine = pub?.review.reviews?.length ? pub.review.reviews : null;
  return (
    <div>
      <h3>Batch {invite.slot}</h3>
      <Err message={error} />
      {info && <p>{info}</p>}
      <ProgressNote progress={progress} />
      <table>
        <tbody>
          <tr><th>Status sesi</th><td>{pub?.session.status ?? invite.sessionStatus}</td></tr>
          <tr><th>Fase telaah</th><td><b>{phase}</b> (commit {pub?.review.committed ?? "?"}, reveal {pub?.review.revealed ?? "?"})</td></tr>
          <tr><th>Naskah anonim</th><td>{invite.anonymizedManuscriptUrl ? <a href={invite.anonymizedManuscriptUrl}>unduh PDF</a> : "-"}</td></tr>
          <tr><th>Telaah Anda (browser ini)</th><td>{pend ? pend.status : "belum"}</td></tr>
        </tbody>
      </table>

      {!invite.accepted && <p>Undangan ini belum diterima. <Link href="/reviewer/assignments">Terima di halaman undangan</Link>.</p>}

      {invite.accepted && phase === "Commit" && !pend && (
        <>
          <h4>Langkah 1: commit</h4>
          <p>
            Rekomendasi dan teks dihitung menjadi hash di browser ini. Yang dikirim ke server dan chain hanya hash bertanda tangan pseudonim;
            rekomendasi dan teks baru dikirim pada langkah 2 (reveal), setelah semua penelaah commit.
          </p>
          <p>
            <select name="recommendation" value={rec} onChange={(e) => setRec(Number(e.target.value) as 1 | 2 | 3 | 4)}>
              {RECS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </p>
          <p>Teks telaah:<br /><textarea name="reviewText" rows={8} cols={70} value={text} onChange={(e) => setText(e.target.value)} /></p>
          <p><button onClick={() => act(() => commitReview(ctx, invite, rec, text), "Commit diterima. Simpan perangkat ini sampai reveal: data pembukaan hanya ada di browser.")} disabled={busy || text.trim().length < 10}>{busy ? "Memproses..." : "Commit"}</button></p>
          {text.trim().length < 10 && <p>Isi teks telaah (sedikitnya 10 karakter).</p>}
        </>
      )}
      {invite.accepted && phase === "Commit" && pend?.status === "committed" && <p>Commit tercatat. Menunggu semua penelaah batch ini commit; fase Reveal dibuka sistem setelahnya.</p>}

      {invite.accepted && phase === "Reveal" && pend?.status === "committed" && (
        <>
          <h4>Langkah 2: reveal</h4>
          <p>Semua penelaah sudah commit. Buka telaah Anda: rekomendasi dan teks dikirim bersama nonce pembukaan.</p>
          <p><button onClick={() => act(() => revealReview(ctx, invite), "Reveal diterima.")} disabled={busy}>{busy ? "Memproses..." : "Reveal"}</button></p>
        </>
      )}
      {invite.accepted && phase === "Reveal" && !pend && <p>Fase Reveal terbuka, tetapi browser ini tidak punya data commit Anda. Tanpa data itu telaah tidak bisa dibuka (hash tidak bisa direkonstruksi).</p>}
      {pend?.status === "revealed" && <p>Telaah Anda sudah dibuka. Keputusan diambil sistem setelah semua penelaah reveal. Lihat <Link href={`/incentive/${invite.sessionId}`}>transparansi insentif</Link> dan <Link href="/reviewer/earnings">imbalan</Link> setelah sesi selesai.</p>}
      {phase === "Closed" && pub && pub.decisions.length > 0 && <p>Keputusan: {pub.decisions.map((d) => `batch ${d.batch}: ${d.outcome}${d.grayZone ? " (zona abu-abu)" : ""}`).join("; ")}</p>}

      {pend && pend.status !== "revealed" && (
        <p>
          <button onClick={() => setShowExport(!showExport)}>{showExport ? "Sembunyikan" : "Tampilkan data commit untuk disalin"}</button>
          {showExport && <pre>{JSON.stringify(pend, null, 2)}</pre>}
        </p>
      )}

      {mine && (
        <>
          <h4>Telaah yang sudah dibuka (publik, per pseudonim)</h4>
          <table>
            <thead><tr><th>Pseudonim</th><th>Rekomendasi</th></tr></thead>
            <tbody>{mine.map((r) => <tr key={r.pseudonym}><td><code>{shortHex(r.pseudonym, 14)}</code></td><td>{recName(r.recommendation)}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </div>
  );
}

function ReviewPage({ ctx, sessionId }: { ctx: AuthorCtx; sessionId: Hex }) {
  const [seats, setSeats] = useState<Invite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<Invite[]>("/invitations").then((r) => setSeats(r.data.filter((i) => i.role === "reviewer" && i.sessionId.toLowerCase() === sessionId.toLowerCase() && !i.voided))).catch((e) => setError(errorText(e)));
  }, [sessionId]);
  return (
    <div>
      <h1>Telaah sesi <code>{shortHex(sessionId, 18)}</code></h1>
      <p><Link href="/reviewer/assignments">Undangan saya</Link> | <Link href={`/tracker/${sessionId}`}>Pelacak publik</Link></p>
      <Err message={error} />
      {!seats ? <p>Memuat...</p> : seats.length === 0 ? <p>Anda tidak punya undangan penelaah untuk sesi ini.</p> : seats.map((i) => <Seat key={i.id} ctx={ctx} invite={i} />)}
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  return <RoleGate roles={["reviewer"]} label="penelaah">{(ctx) => <ReviewPage ctx={ctx} sessionId={sessionId as Hex} />}</RoleGate>;
}
