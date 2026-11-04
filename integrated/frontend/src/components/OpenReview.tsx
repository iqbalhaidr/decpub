import type { OpenReview as OpenReviewData } from "@/lib/types";
import { when, yesNo } from "@/lib/format";

/** Open review: laporan editorial dan telaah per batch. Pseudonim berlaku per putaran; tanpa nama atau surel. */
export default function OpenReview({ data }: { data: OpenReviewData }) {
  return (
    <div>
      <h2>Open review</h2>
      <p>{data.note}</p>

      <h3>Penyaringan editorial</h3>
      {data.editorial.length === 0 && <p>Tidak ada laporan.</p>}
      {data.editorial.map((e) => (
        <div key={e.revision}>
          <p>
            Revisi {e.revision}: putusan <b>{e.decision}</b>; hash laporan cocok: {yesNo(e.hashVerified)};{" "}
            <a href={e.reportUrl}>berkas laporan</a>
          </p>
          {e.comments && <pre>{e.comments}</pre>}
        </div>
      ))}

      {data.batches.map((b) => (
        <div key={b.batch}>
          <h3>Batch penelaah {b.batch}</h3>
          {b.decision ? (
            <p>
              Keputusan batch: <b>{b.decision.outcome}</b> atas {b.decision.reviewerCount} penelaah
              {b.decision.grayZone ? `; zona abu-abu, ditambah ${b.decision.additionalReviewerCount} penelaah` : ""}
            </p>
          ) : (
            <p>Belum ada keputusan batch ini.</p>
          )}
          <table>
            <thead><tr><th>Pseudonim</th><th>Rekomendasi</th><th>Dibuka</th><th>Hash cocok</th><th>Telaah</th></tr></thead>
            <tbody>
              {b.reviews.map((r) => (
                <tr key={r.pseudonym}>
                  <td><code>{r.pseudonym}</code></td>
                  <td>{r.recommendation}</td>
                  <td>{when(r.revealedAt)}</td>
                  <td>{yesNo(r.hashVerified)}</td>
                  <td>
                    {r.text ? <pre>{r.text}</pre> : "(tidak terjangkau)"}
                    <a href={r.reviewUrl}>berkas</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
