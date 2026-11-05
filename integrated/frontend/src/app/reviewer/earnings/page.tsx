"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import type { Address, Hex } from "viem";
import { reputationTier } from "@decpub/shared";
import Err from "@/components/Err";
import RoleGate from "@/components/RoleGate";
import type { AuthorCtx } from "@/lib/author";
import { api, errorText } from "@/lib/api";
import { eth, shortHex } from "@/lib/format";
import { claimReputation, claimReward, ownRow, reputationBalance } from "@/lib/party";
import { reputationClaimed } from "@/lib/pending";
import type { IncentiveView, Invite } from "@/lib/types";

const e18 = (v: bigint | string) => (Number(BigInt(v)) / 1e18).toFixed(4);

function Row({ ctx, invite, view, reload }: { ctx: AuthorCtx; invite: Invite; view: IncentiveView; reload: () => Promise<void> }) {
  const { pseudonym, row } = ownRow(ctx, view, invite.sessionId, invite.slot);
  const [recipient, setRecipient] = useState("");
  const [newKey, setNewKey] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queued = reputationClaimed(ctx.userId, invite.sessionId, invite.slot);

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
  const newAddress = () => {
    const k = generatePrivateKey();
    setNewKey(k);
    setRecipient(privateKeyToAddress(k));
  };
  const claim = () =>
    act(async () => {
      if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) throw new Error("Isi alamat penerima baru (0x + 40 heksadesimal)");
      const r = await claimReward(ctx, invite.sessionId, invite.slot, recipient as Address);
      setInfo(`Imbalan ${eth(r.amountWei, 6)} dikirim ke ${recipient}, tx ${r.tx.txHash}.`);
    });
  const repClaim = () =>
    act(async () => {
      const r = await claimReputation(ctx, invite.sessionId, invite.slot, view);
      setInfo(r ? `Klaim reputasi ${e18(r.amount)} diantrikan; dimint saat admin memicu epoch.` : "Kredit di bawah 0,25: tidak ada reputasi yang bisa diklaim.");
    });

  return (
    <div>
      <h3>Sesi <Link href={`/tracker/${invite.sessionId}`}><code>{shortHex(invite.sessionId, 14)}</code></Link>, batch {invite.slot}</h3>
      <Err message={error} />
      {info && <p>{info}</p>}
      {!view.distribution ? (
        <p>Imbalan belum dihitung. Distribusi otomatis setelah ada keputusan dan status final. Status escrow: {view.escrow.state}. <Link href={`/incentive/${invite.sessionId}`}>Transparansi insentif</Link></p>
      ) : !row ? (
        <p>Pseudonim Anda (<code>{shortHex(pseudonym, 14)}</code>) tidak ada di matriks sesi ini: hanya pseudonim yang membuka telaah (reveal) yang dihitung. <Link href={`/incentive/${invite.sessionId}`}>Lihat perhitungan</Link></p>
      ) : (
        <>
          <table>
            <tbody>
              <tr><th>Pseudonim Anda</th><td><code>{shortHex(pseudonym, 14)}</code></td></tr>
              <tr><th>Skor TOPSIS / sigmoid</th><td>{e18(row.score)} / {e18(row.sigmoid)}</td></tr>
              <tr><th>Imbalan</th><td><b>{eth(row.rewardWei, 6)}</b></td></tr>
              <tr><th>Sudah diklaim</th><td>{row.claimed ? "ya" : "belum"}</td></tr>
              <tr><th>Reputasi yang bisa diklaim (kredit sigmoid dibulatkan ke bawah, kelipatan 0,25)</th><td>{e18(BigInt(row.sigmoid) / (25n * 10n ** 16n) * 25n * 10n ** 16n)}{queued ? ` (sudah diantrikan: ${e18(queued)})` : ""}</td></tr>
            </tbody>
          </table>
          <p><Link href={`/incentive/${invite.sessionId}`}>Bagaimana imbalan ini dihitung</Link></p>
          {!row.claimed && (
            <>
              <p>
                Klaim ke <b>alamat yang belum pernah dipakai</b>. Penerima terikat pada tanda tangan pseudonim, relayer tidak bisa mengalihkannya, dan dengan
                alamat baru imbalan tidak menaut ke dompet Anda.
              </p>
              <p>
                <input type="text" name="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x... alamat baru" />{" "}
                <button onClick={newAddress}>Buat alamat baru</button> <button onClick={claim} disabled={busy}>Klaim imbalan</button>
              </p>
              {newKey && <p>Kunci privat alamat baru (simpan, hanya tampil di sini): <code>{newKey}</code></p>}
            </>
          )}
          <p>
            Reputasi: <button onClick={repClaim} disabled={busy || Boolean(queued)}>Klaim reputasi</button>{" "}
            {queued ? "(sudah diantrikan dari browser ini)" : "(permintaan tidak memuat sesi maupun pseudonim; dimint berkelompok per epoch)"}
          </p>
        </>
      )}
    </div>
  );
}

function Earnings({ ctx }: { ctx: AuthorCtx }) {
  const [items, setItems] = useState<{ invite: Invite; view: IncentiveView }[] | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [pendingClaims, setPendingClaims] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const invites = (await api.get<Invite[]>("/invitations")).data.filter((i) => i.role === "reviewer" && i.accepted && !i.voided);
    const out: { invite: Invite; view: IncentiveView }[] = [];
    for (const invite of invites) {
      try {
        out.push({ invite, view: (await api.get<IncentiveView>(`/incentive/${invite.sessionId}`)).data });
      } catch {
        /* sesi belum punya data insentif */
      }
    }
    setItems(out);
    setBalance(await reputationBalance(ctx.cfg, ctx.secret).catch(() => null));
    const p = await api.get<{ pending: number } | number>("/incentive/reputation-claims/pending").catch(() => null);
    setPendingClaims(p ? (typeof p.data === "number" ? p.data : (p.data as { pending: number }).pending) : null);
  }, [ctx]);
  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
  }, [load]);

  return (
    <div>
      <h1>Imbalan dan reputasi</h1>
      <Err message={error} />
      <h2>Reputasi (SBT)</h2>
      <p>
        Saldo terhitung dari <code>reputationId</code> turunan secret Anda, publik di <code>ReputationSBT</code> dan meluruh 2% per hari.
        Mint dilakukan relayer berkelompok per epoch tanpa menyebut pseudonim sesi.
      </p>
      <table>
        <tbody>
          <tr><th>Saldo efektif</th><td>{balance === null ? "?" : e18(balance)}{balance !== null ? ` (tingkat ${reputationTier(balance)} dari 4)` : ""}</td></tr>
          <tr><th>Klaim reputasi menunggu epoch (seluruh platform)</th><td>{pendingClaims ?? "?"}</td></tr>
        </tbody>
      </table>
      <h2>Per sesi</h2>
      {!items ? <p>Memuat...</p> : items.length === 0 ? <p>Belum ada sesi yang Anda telaah. <Link href="/reviewer/assignments">Undangan</Link>.</p> : items.map((x) => <Row key={x.invite.id} ctx={ctx} invite={x.invite} view={x.view} reload={load} />)}
    </div>
  );
}

export default function EarningsPage() {
  return <RoleGate roles={["reviewer"]} label="penelaah">{(ctx) => <Earnings ctx={ctx} />}</RoleGate>;
}
