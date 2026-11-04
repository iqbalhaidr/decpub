import Link from "next/link";
import Err from "@/components/Err";
import { getJson } from "@/lib/api";
import { when } from "@/lib/format";
import type { ArticleSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Articles() {
  let list: ArticleSummary[] = [];
  let error: string | null = null;
  try {
    list = await getJson<ArticleSummary[]>("/articles");
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <div>
      <h1>Artikel terbit</h1>
      <p>
        Setiap artikel tampil dalam versi anonim. Nama penulis baru muncul bila penulis memilih membukanya (selective disclosure); penelaah
        tidak pernah diungkap.
      </p>
      <Err message={error} />
      {!error && list.length === 0 && <p>Belum ada artikel terbit.</p>}
      {list.length > 0 && (
        <table>
          <thead>
            <tr><th>DOI</th><th>Judul</th><th>Jurnal</th><th>Penulis</th><th>Versi</th><th>Terbit</th></tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.sessionId}>
                <td><Link href={`/articles/${a.sessionId}`}>{a.doi}</Link></td>
                <td>{a.title}</td>
                <td>{a.journal?.name ?? "-"}</td>
                <td>{a.authorDisclosed ? a.authorName ?? "(dibuka tanpa nama)" : "Anonim"}</td>
                <td>{a.revisionCount + 1}</td>
                <td>{when(a.publishedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
