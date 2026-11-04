import Link from "next/link";
import Err from "@/components/Err";
import { getJson } from "@/lib/api";
import { eth, shortHex, when, yesNo } from "@/lib/format";
import type { IncentiveView } from "@/lib/types";

export const dynamic = "force-dynamic";

const CRITERIA = ["q1 kecepatan (hari, makin kecil makin baik)", "q2 relevansi [SIMULASI]", "q3 actionability [SIMULASI]", "q4 reputasi (tingkat)"];
const e18 = (v: string) => (Number(BigInt(v)) / 1e18).toFixed(4);
const f4 = (n: number) => n.toFixed(4);

/**
 * Transparansi insentif: dari mana imbalan tiap penelaah berasal. Publik, hanya pseudonim; tanpa alamat dompet asli.
 * Angka ini dihitung server dari laporan QoS di storage publik, hash-nya dicocokkan dengan yang tercatat on-chain.
 */
export default async function Incentive({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let v: IncentiveView | null = null;
  let error: string | null = null;
  try {
    v = await getJson<IncentiveView>(`/incentive/${id}`);
  } catch (e) {
    error = (e as Error).message;
  }
  if (!v) {
    return (
      <div>
        <h1>Insentif</h1>
        <Err message={error} />
        <p><Link href="/tracker">Pelacak</Link></p>
      </div>
    );
  }
  const d = v.distribution;

  return (
    <div>
      <h1>Insentif penelaah, sesi <code>{shortHex(v.sessionId, 18)}</code></h1>
      <p><Link href={`/tracker/${v.sessionId}`}>Jejak sesi</Link></p>

      <h2>Escrow APC</h2>
      <table>
        <tbody>
          <tr><th>Status</th><td>{v.escrow.state}</td></tr>
          <tr><th>Jumlah</th><td>{eth(v.escrow.amountWei, 4)}</td></tr>
          <tr><th>Belum diklaim</th><td>{eth(v.escrow.unclaimedWei, 6)}</td></tr>
        </tbody>
      </table>

      <h2>Kebijakan bobot (dikunci saat sesi dibuat)</h2>
      {v.policy ? (
        <>
          <table>
            <tbody>
              <tr><th>Preset BWM</th><td>{v.policy.preset}</td></tr>
              <tr><th>λ (subjektif vs objektif)</th><td>{v.policy.lambda}</td></tr>
              <tr><th>Dikunci</th><td>{v.policy.lockedAt}{v.policy.lockedLate ? " (terlambat: sesi lama)" : ""}</td></tr>
              <tr><th>Hash kebijakan</th><td><code>{v.policy.hash}</code></td></tr>
            </tbody>
          </table>
          <details><summary>Isi kebijakan</summary><pre>{JSON.stringify(v.policy.detail, null, 2)}</pre></details>
        </>
      ) : (
        <p>Belum dikunci.</p>
      )}

      {!d ? (
        <p>Belum ada distribusi. Imbalan dihitung otomatis setelah ada keputusan dan status final (Published atau Rejected setelah telaah).</p>
      ) : (
        <>
          <h2>Distribusi</h2>
          <table>
            <tbody>
              <tr><th>Dieksekusi</th><td>{when(d.executedAt)}{d.txHash ? ` (tx ${shortHex(d.txHash, 12)})` : ""}</td></tr>
              <tr><th>Jumlah penelaah (reveal)</th><td>{d.reviewerCount}</td></tr>
              <tr><th>Penyedia QoS</th><td>{d.qosProvider}</td></tr>
              <tr><th>Hash laporan QoS on-chain</th><td><code>{d.qosReportHash}</code></td></tr>
              <tr><th>Laporan di storage cocok dengan on-chain</th><td>{yesNo(d.reportMatchesOnChain)}{d.reportUrl ? <> (<a href={d.reportUrl}>berkas laporan</a>)</> : null}</td></tr>
              <tr><th>Hash kebijakan on-chain sama dengan yang dikunci</th><td>{yesNo(d.policyMatchesLocked)}</td></tr>
            </tbody>
          </table>

          <h2>Bobot kriteria</h2>
          {d.weights ? (
            <table>
              <thead><tr><th>Kriteria</th><th>BWM (subjektif)</th><th>ECWM (objektif)</th><th>Fusi W</th></tr></thead>
              <tbody>
                {CRITERIA.map((c, i) => (
                  <tr key={c}><td>{c}</td><td>{f4(d.weights!.bwm[i])}</td><td>{f4(d.weights!.ecwm[i])}</td><td>{f4(d.weights!.fused[i])}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>(laporan tidak terjangkau)</p>
          )}
          {d.weights && <p>Rasio konsistensi BWM: {f4(d.weights.bwmConsistencyRatio)}. W = λ·BWM + (1-λ)·ECWM.</p>}

          <h2>Matriks, skor, dan imbalan per pseudonim</h2>
          <p>
            Hanya pseudonim yang membuka telaah (reveal) yang masuk matriks. Skor TOPSIS dan sigmoid dihitung di kontrak; imbalan = escrow × sigmoid / jumlah sigmoid.
            Pseudonim berlaku per sesi dan putaran; klaim dilakukan ke alamat baru, sehingga imbalan tidak menaut ke dompet.
          </p>
          <table>
            <thead>
              <tr><th>Pseudonim</th><th>Batch</th><th>q1 (hari)</th><th>q2</th><th>q3</th><th>Tingkat q4</th><th>Skor TOPSIS</th><th>Sigmoid</th><th>Imbalan</th><th>Diklaim</th></tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.pseudonym}>
                  <td><code>{shortHex(r.pseudonym, 14)}</code></td>
                  <td>{r.batch}</td>
                  <td>{f4(r.q1Days)}</td>
                  <td>{f4(r.q2)}</td>
                  <td>{f4(r.q3)}</td>
                  <td>{r.tier} ({f4(r.q4)})</td>
                  <td>{e18(r.score)}</td>
                  <td>{e18(r.sigmoid)}</td>
                  <td>{eth(r.rewardWei, 6)}</td>
                  <td>{yesNo(r.claimed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Jumlah imbalan: {eth(d.rows.reduce((a, r) => a + BigInt(r.rewardWei), 0n), 6)}</p>
        </>
      )}
    </div>
  );
}
