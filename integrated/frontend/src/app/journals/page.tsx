import Err from "@/components/Err";
import { getJson } from "@/lib/api";
import { eth } from "@/lib/format";
import type { Journal } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Journals() {
  let data: { categories: { slug: string; label: string }[]; journals: Journal[] } | null = null;
  let error: string | null = null;
  try {
    data = await getJson("/journals");
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <div>
      <h1>Katalog jurnal</h1>
      <p>
        APC dibayar di muka ke escrow (note nominal tetap), lalu 100% menjadi imbalan penelaah. Kebijakan bobot dikunci saat sesi dibuat,
        sehingga perubahan oleh admin hanya berlaku untuk sesi baru.
      </p>
      <Err message={error} />
      {data && (
        <>
          <table>
            <thead>
              <tr><th>ID</th><th>Jurnal</th><th>Kategori</th><th>APC</th><th>Preset bobot (BWM)</th><th>λ</th></tr>
            </thead>
            <tbody>
              {data.journals.map((j) => (
                <tr key={j.id}>
                  <td>{j.id}</td>
                  <td>{j.name}</td>
                  <td>{j.categoryLabel} ({j.categorySlug})</td>
                  <td>{eth(j.apcWei, 4)}</td>
                  <td>{j.weightPolicy.preset}</td>
                  <td>{j.weightPolicy.lambda}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>Kategori</h2>
          <p>{data.categories.map((c) => `${c.label} (${c.slug})`).join(", ")}</p>
        </>
      )}
    </div>
  );
}
