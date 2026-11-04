import Link from "next/link";
import Comments from "@/components/Comments";
import Err from "@/components/Err";
import OpenReview from "@/components/OpenReview";
import { getJson } from "@/lib/api";
import { shortHex, when, yesNo } from "@/lib/format";
import type { ArticleDetail, OpenReview as OpenReviewData, Party } from "@/lib/types";

export const dynamic = "force-dynamic";

function PartyView({ label, p }: { label: string; p: Party }) {
  if (!p.disclosed) {
    return <tr><th>{label}</th><td>Anonim (tidak membuka identitas)</td></tr>;
  }
  const attrs = Object.entries(p.attributes ?? {}).filter(([, v]) => v !== null);
  return (
    <tr>
      <th>{label}</th>
      <td>
        Membuka identitas pada {when(p.disclosedAt)}
        <table>
          <tbody>
            {attrs.map(([k, v]) => (
              <tr key={k}><td>{k}</td><td>{v}</td></tr>
            ))}
            <tr><td>hash atribut dihitung ulang cocok</td><td>{yesNo(p.attributesVerified)}</td></tr>
            <tr><td>pseudonim di sesi</td><td><code>{p.pseudonym}</code></td></tr>
            <tr><td>akun permanen</td><td><code>{p.permanentAccount}</code></td></tr>
            {p.originalManuscript && (
              <tr>
                <td>naskah asli</td>
                <td>
                  {p.originalManuscript.uploaded ? <a href={p.originalManuscript.url}>unduh</a> : "belum diunggah"}; sha256 sama dengan on-chain:{" "}
                  {yesNo(p.originalManuscript.sha256MatchesOnChain)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export default async function Article({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let a: ArticleDetail | null = null;
  let review: OpenReviewData | null = null;
  let error: string | null = null;
  try {
    [a, review] = await Promise.all([getJson<ArticleDetail>(`/articles/${id}`), getJson<OpenReviewData>(`/articles/${id}/open-review`)]);
  } catch (e) {
    error = (e as Error).message;
  }
  if (!a) {
    return (
      <div>
        <h1>Artikel</h1>
        <Err message={error} />
        <p><Link href="/articles">Kembali ke daftar</Link></p>
      </div>
    );
  }

  return (
    <div>
      <h1>{a.title ?? "(judul tidak terjangkau)"}</h1>
      <p>DOI <b>{a.doi}</b> | versi {a.revisionCount + 1} | terbit {when(a.publishedAt)}</p>
      <Err message={error} />

      <h2>Abstrak</h2>
      <p>{a.abstract || "(tidak ada)"}</p>
      <p>Kata kunci: {a.keywords.join(", ") || "-"} | Jurnal: {a.journal?.name ?? "-"}</p>

      <h2>Naskah</h2>
      <p>
        <a href={a.anonymizedManuscript.url}>Unduh naskah anonim (PDF)</a> | <a href={a.metadataUrl}>metadata publik</a>
      </p>
      <table>
        <tbody>
          <tr><th>sha256 naskah anonim</th><td><code>{a.hashes.anonymized}</code></td></tr>
          <tr><th>sha256 naskah asli (on-chain)</th><td><code>{a.hashes.original}</code></td></tr>
          <tr><th>hash metadata (bersalt)</th><td><code>{a.hashes.metadata}</code></td></tr>
          <tr><th>ID sesi</th><td><code>{a.sessionId}</code></td></tr>
          <PartyView label="Penulis" p={a.author} />
          <PartyView label="Editor" p={a.editor} />
          <tr><th>Penelaah</th><td>Tidak pernah diungkap ({a.reviewers.reviews} telaah dibuka sebagai open review)</td></tr>
          <tr>
            <th>Keputusan akhir</th>
            <td>{a.decision ? `${a.decision.outcome} (batch ${a.decision.batch}, ${a.decision.reviewerCount} penelaah${a.decision.grayZone ? ", zona abu-abu" : ""})` : "-"}</td>
          </tr>
        </tbody>
      </table>
      <p>
        Lihat juga: <Link href={`/tracker/${a.sessionId}`}>jejak sesi dan event on-chain</Link> |{" "}
        <Link href={`/incentive/${a.sessionId}`}>transparansi insentif penelaah</Link> | <code>{shortHex(a.sessionId, 18)}</code>
      </p>

      {review && <OpenReview data={review} />}
      <Comments sessionId={a.sessionId} />
    </div>
  );
}
