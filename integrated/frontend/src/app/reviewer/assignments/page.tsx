"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Err from "@/components/Err";
import ProgressNote from "@/components/ProgressNote";
import RoleGate from "@/components/RoleGate";
import type { AuthorCtx } from "@/lib/author";
import { api, errorText } from "@/lib/api";
import { shortHex } from "@/lib/format";
import { acceptReviewerInvite, reputationBalance } from "@/lib/party";
import { loadPending } from "@/lib/pending";
import type { Invite, ProgressSummary } from "@/lib/types";
import { reputationTier } from "@decpub/shared";

function Assignments({ ctx }: { ctx: AuthorCtx }) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tier, setTier] = useState<{ balance: bigint; tier: number } | null>(null);

  const load = useCallback(async () => {
    setInvites((await api.get<Invite[]>("/invitations")).data.filter((i) => i.role === "reviewer"));
  }, []);
  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
    reputationBalance(ctx.cfg, ctx.secret).then((b) => setTier({ balance: b, tier: reputationTier(b) })).catch(() => undefined);
    const t = setInterval(() => load().catch(() => undefined), 6000);
    return () => clearInterval(t);
  }, [load, ctx]);

  const accept = async (i: Invite) => {
    setError(null);
    setInfo(null);
    setBusy(i.id);
    try {
      const r = await acceptReviewerInvite(ctx, i);
      setProgress(r.progress ?? null);
      setInfo(`Undangan diterima. Pseudonim Reviewer (batch ${i.slot}): ${r.pseudonym}. Tingkat reputasi yang dinyatakan: ${r.tier ?? "(sudah dinyatakan)"}.`);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h1>Undangan penelaah</h1>
      <Err message={error} />
      {info && <p>{info}</p>}
      <ProgressNote progress={progress} />
      <p>
        Penelaah dipilih acak dari anggota dengan bidang terverifikasi (<Link href="/reviewer/specialization">spesialisasi</Link>); penulis naskah
        dikecualikan. Menerima undangan membuat pseudonim Reviewer baru untuk sesi dan batch itu, dibuat di browser dari secret Anda.
      </p>
      {tier && (
        <p>
          Reputasi Anda (saldo SBT publik setelah decay): {(Number(tier.balance) / 1e18).toFixed(4)}, tingkat {tier.tier} dari 4. Tingkat inilah yang dinyatakan
          (dengan bukti simulasi) sebagai q4 saat menerima undangan; server tidak menerima <code>reputationId</code> Anda.
        </p>
      )}
      {!invites ? (
        <p>Memuat...</p>
      ) : invites.length === 0 ? (
        <p>Belum ada undangan.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Sesi</th><th>Batch</th><th>Jurnal</th><th>Bidang</th><th>Status sesi</th><th>Naskah anonim</th><th>Undangan</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            {invites.map((i) => {
              const pend = loadPending(ctx.userId, i.sessionId, i.slot);
              return (
                <tr key={i.id}>
                  <td><Link href={`/tracker/${i.sessionId}`}><code>{shortHex(i.sessionId, 12)}</code></Link></td>
                  <td>{i.slot}</td>
                  <td>{i.journal?.name ?? "-"}</td>
                  <td>{i.criteria.fields.join(", ") || "-"}</td>
                  <td>{i.sessionStatus}</td>
                  <td>{i.anonymizedManuscriptUrl ? <a href={i.anonymizedManuscriptUrl}>unduh</a> : "-"}</td>
                  <td>{i.voided ? "dibatalkan" : i.accepted ? "diterima" : "menunggu"}{pend ? ` (telaah: ${pend.status})` : ""}</td>
                  <td>
                    {i.voided ? "-" : !i.accepted ? (
                      <button onClick={() => accept(i)} disabled={busy !== null}>{busy === i.id ? "Memproses..." : "Terima"}</button>
                    ) : (
                      <Link href={`/review/${i.sessionId}`}>Telaah</Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function AssignmentsPage() {
  return <RoleGate roles={["reviewer"]} label="penelaah">{(ctx) => <Assignments ctx={ctx} />}</RoleGate>;
}
