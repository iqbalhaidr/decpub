"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FIELD_SLUGS, type DisclosureAttributes } from "@decpub/shared";
import Err from "@/components/Err";
import ProgressNote from "@/components/ProgressNote";
import RoleGate from "@/components/RoleGate";
import { discloseAs, type AuthorCtx, type DisclosureResult } from "@/lib/author";
import { api, errorText } from "@/lib/api";
import { shortHex, when } from "@/lib/format";
import { acceptEditorInvite, screenSession, type ScreeningInput } from "@/lib/party";
import type { Invite, ProgressSummary, SessionProjection } from "@/lib/types";

const DECISIONS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: "Proceed: lanjut ke pemilihan penelaah" },
  { value: 2, label: "Revise: minta penulis merevisi sebelum ditelaah" },
  { value: 3, label: "DeskReject: tolak tanpa telaah (APC dikembalikan ke penulis)" },
];

/** Satu undangan editor beserta aksinya, sesuai status sesi. */
function Seat({ ctx, invite, reload }: { ctx: AuthorCtx; invite: Invite; reload: () => Promise<void> }) {
  const [pub, setPub] = useState<SessionProjection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [decision, setDecision] = useState<1 | 2 | 3>(1);
  const [comments, setComments] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");
  const [fields, setFields] = useState<string[]>(invite.criteria.fields.length ? invite.criteria.fields : invite.journal ? [invite.journal.category] : []);
  const [disc, setDisc] = useState<{ name: string; affiliation: string; useEmail: boolean }>({ name: "", affiliation: "", useEmail: false });
  const [confirmed, setConfirmed] = useState(false);
  const [discResult, setDiscResult] = useState<DisclosureResult | null>(null);
  const [alreadyDisclosed, setAlreadyDisclosed] = useState(false);

  const status = invite.sessionStatus;
  useEffect(() => {
    api.get<SessionProjection>(`/public/sessions/${invite.sessionId}`).then((r) => setPub(r.data)).catch(() => setPub(null));
    if (status === "Published") api.get(`/articles/${invite.sessionId}`).then((r) => setAlreadyDisclosed(Boolean(r.data.editor?.disclosed))).catch(() => undefined);
  }, [invite.sessionId, status]);

  const act = async (fn: () => Promise<void>) => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const accept = () =>
    act(async () => {
      const r = await acceptEditorInvite(ctx, invite);
      setProgress(r.progress ?? null);
      setInfo(`Undangan diterima. Pseudonim Editor sesi ini: ${r.pseudonym}`);
    });

  const submit = () =>
    act(async () => {
      if (decision === 1 && fields.length === 0) throw new Error("Pilih sedikitnya satu bidang penelaah");
      const input: ScreeningInput = { decision, comments, reviewerFields: decision === 1 ? fields : [], privateNotes: privateNotes || undefined };
      const r = await screenSession(ctx, invite.sessionId, input);
      setProgress(r.progress ?? null);
      setInfo("Putusan tercatat on-chain dan laporan publik diunggah.");
    });

  const disclose = () =>
    act(async () => {
      const attributes: DisclosureAttributes = {};
      if (disc.name.trim()) attributes.name = disc.name.trim();
      if (disc.affiliation.trim()) attributes.affiliation = disc.affiliation.trim();
      if (disc.useEmail) attributes.email = ctx.email;
      if (Object.keys(attributes).length === 0) throw new Error("Pilih sedikitnya satu atribut");
      setDiscResult(await discloseAs(ctx, 2, invite.sessionId, attributes, false));
    });

  return (
    <div>
      <h3>Sesi <Link href={`/tracker/${invite.sessionId}`}><code>{shortHex(invite.sessionId, 18)}</code></Link></h3>
      <Err message={error} />
      {info && <p>{info}</p>}
      <ProgressNote progress={progress} />
      <table>
        <tbody>
          <tr><th>Jurnal</th><td>{invite.journal ? `${invite.journal.name} (kategori ${invite.journal.category})` : "-"}</td></tr>
          <tr><th>Status sesi</th><td><b>{status}</b>{pub ? ` (revisi ke-${pub.session.revisionCount}, diperbarui ${when(pub.session.updatedAt)})` : ""}</td></tr>
          <tr><th>Naskah (anonim)</th><td>{invite.anonymizedManuscriptUrl ? <a href={invite.anonymizedManuscriptUrl}>unduh PDF</a> : "-"} (identitas penulis tidak ditampilkan kepada editor)</td></tr>
          <tr><th>Undangan</th><td>{invite.accepted ? "diterima" : invite.voided ? "dibatalkan" : "menunggu"}</td></tr>
          <tr><th>Putusan terakhir</th><td>{pub?.editorial ? `${pub.editorial.decision} (revisi ${pub.editorial.revision}, ${when(pub.editorial.recordedAt)})` : "belum ada"}</td></tr>
        </tbody>
      </table>

      {!invite.accepted && !invite.voided && (
        <p>
          Menerima undangan membuat pseudonim Editor untuk sesi ini di browser (bukti simulasi dari zk-sim, secret tidak dikirim ke server) dan
          mengikatnya ke penugasan. <button onClick={accept} disabled={busy}>{busy ? "Memproses..." : "Terima undangan"}</button>
        </p>
      )}

      {invite.accepted && status === "UnderEditorialScreening" && (
        <>
          <h4>Putusan penyaringan editorial</h4>
          <p>Ditandatangani pseudonim Editor di browser; relayer hanya membayar gas.</p>
          <p>
            <select name="decision" value={decision} onChange={(e) => setDecision(Number(e.target.value) as 1 | 2 | 3)}>
              {DECISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </p>
          <p>Komentar (masuk laporan publik):<br /><textarea name="comments" rows={4} cols={70} value={comments} onChange={(e) => setComments(e.target.value)} /></p>
          {decision === 1 && (
            <p>
              Bidang penelaah yang dibutuhkan (kandidat hanya penelaah dengan bidang terverifikasi):<br />
              {FIELD_SLUGS.map((f) => (
                <label key={f}>
                  <input type="checkbox" name={`field-${f}`} checked={fields.includes(f)} onChange={(e) => setFields(e.target.checked ? [...fields, f] : fields.filter((x) => x !== f))} /> {f}{" "}
                </label>
              ))}
            </p>
          )}
          <p>Catatan internal (hanya di arsip terenkripsi server, tidak masuk laporan publik):<br /><textarea name="privateNotes" rows={2} cols={70} value={privateNotes} onChange={(e) => setPrivateNotes(e.target.value)} /></p>
          <p><button onClick={submit} disabled={busy}>{busy ? "Memproses..." : "Kirim putusan"}</button></p>
        </>
      )}

      {invite.accepted && status !== "UnderEditorialScreening" && status !== "Published" && <p>Tidak ada aksi editor pada status ini. Sistem yang melanjutkan sesi.</p>}

      {invite.accepted && status === "Published" && (
        <>
          <h4>Ungkap identitas editor (opsional)</h4>
          {alreadyDisclosed || discResult ? (
            <p>Identitas editor sesi ini sudah diungkap. <Link href={`/articles/${invite.sessionId}`}>Lihat artikel</Link>.</p>
          ) : (
            <>
              <p>
                <b>Tidak bisa dicabut.</b> Pseudonim Editor sesi ini akan tertaut ke akun permanen Anda di ledger selamanya. Nama dan afiliasi adalah
                klaim Anda sendiri (tidak ada data profil untuk dicocokkan); surel harus surel akun ini.
              </p>
              <p>Nama: <input type="text" name="discName" value={disc.name} onChange={(e) => setDisc({ ...disc, name: e.target.value })} /></p>
              <p>Afiliasi: <input type="text" name="discAffiliation" value={disc.affiliation} onChange={(e) => setDisc({ ...disc, affiliation: e.target.value })} /></p>
              <p><label><input type="checkbox" name="discEmail" checked={disc.useEmail} onChange={(e) => setDisc({ ...disc, useEmail: e.target.checked })} /> Buka surel akun ({ctx.email})</label></p>
              <p><label><input type="checkbox" name="discConfirm" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Saya mengerti bahwa pengungkapan ini permanen dan tidak bisa dicabut.</label></p>
              <p><button onClick={disclose} disabled={busy || !confirmed}>Ungkap sebagai editor</button></p>
            </>
          )}
          {discResult && <p>Terkirim, transaksi <code>{discResult.txHash}</code>. Atribut dibuka: {Object.keys(discResult.attributes).join(", ")}.</p>}
        </>
      )}
    </div>
  );
}

function EditorHome({ ctx }: { ctx: AuthorCtx }) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setInvites((await api.get<Invite[]>("/invitations")).data.filter((i) => i.role === "editor"));
  }, []);
  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
    const t = setInterval(() => load().catch(() => undefined), 6000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div>
      <h1>Editor</h1>
      <Err message={error} />
      <p>
        Undangan datang dari sistem (editor dipilih acak sesuai kategori jurnal). Naskah yang Anda baca adalah versi anonim; identitas penulis tidak
        pernah ditampilkan. Aksi Anda ditandatangani pseudonim Editor per sesi, bukan akun ini.
      </p>
      {!invites ? <p>Memuat...</p> : invites.length === 0 ? <p>Tidak ada undangan.</p> : invites.map((i) => <Seat key={i.id} ctx={ctx} invite={i} reload={load} />)}
    </div>
  );
}

export default function EditorPage() {
  return <RoleGate roles={["editor"]} label="editor">{(ctx) => <EditorHome ctx={ctx} />}</RoleGate>;
}
