import Link from "next/link";
import Err from "@/components/Err";
import { getJson } from "@/lib/api";
import type { PublicConfig, Stats } from "@/lib/types";

export const dynamic = "force-dynamic";

const GATEWAY = process.env.NEXT_PUBLIC_STORAGE_GATEWAY_URL ?? "http://127.0.0.1:8081";

export default async function Home() {
  let cfg: PublicConfig | null = null;
  let stats: Stats | null = null;
  let error: string | null = null;
  try {
    [cfg, stats] = await Promise.all([getJson<PublicConfig>("/config"), getJson<Stats>("/stats")]);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div>
      <h1>DecPub: publikasi ilmiah triple-blind dengan insentif penelaah</h1>
      <p>
        Integrasi tiga tugas akhir: alur anonimitas (Ciko), escrow dan insentif adaptif (Hugo), serta jurnal, DOI, dan komentar (Roihan).
        Halaman ini hanya untuk mencoba alur; tampilannya sengaja polos.
      </p>
      <Err message={error} />

      <h2>Publik</h2>
      <ul>
        <li><Link href="/articles">Artikel terbit</Link> (DOI, open review, komentar)</li>
        <li><Link href="/journals">Katalog jurnal</Link> (kategori, APC, kebijakan bobot)</li>
        <li><Link href="/tracker">Pelacak sesi</Link> (status, jejak event on-chain)</li>
        <li><a href={GATEWAY}>Storage publik</a> [SIMULASI] (cari dan unduh berkas lewat CID)</li>
      </ul>

      <h2>Akun</h2>
      <ul>
        <li><Link href="/register">Daftar</Link>, <Link href="/login">masuk</Link></li>
        <li><Link href="/profile">Profil</Link>: buat dan ekspor secret identitas, daftarkan identitas, lihat kredensial</li>
      </ul>

      <h2>Penulis</h2>
      <ul>
        <li><Link href="/author">Naskah saya</Link></li>
        <li><Link href="/author/apc">Beli note APC</Link> (biaya pemrosesan artikel di muka, ke escrow)</li>
        <li><Link href="/author/submit">Ajukan naskah</Link></li>
        <li>Rincian sesi, <Link href="/author">revisi, dan pengungkapan identitas</Link> dibuka dari daftar naskah sesuai status</li>
      </ul>

      <h2>Editor, penelaah, admin (belum tersedia di halaman ini)</h2>
      <ul>
        <li>Undangan, putusan, telaah, klaim imbalan, verifikasi bidang (M11)</li>
        <li>Sementara aksi-aksi itu dijalankan skrip <code>npm run demo:m8</code> (lihat README)</li>
      </ul>

      {cfg && (
        <>
          <h2>Mode</h2>
          <table>
            <tbody>
              <tr><th>Jaringan</th><td>{cfg.network} (chainId {cfg.chainId})</td></tr>
              <tr><th>APC di muka (escrow)</th><td>{cfg.escrowRequired ? "wajib" : "tidak wajib"}</td></tr>
              <tr><th>Ambang plagiarisme</th><td>{cfg.plagiarismThreshold}</td></tr>
              <tr><th>Storage publik</th><td>{cfg.storage.gatewayUrl}</td></tr>
              <tr><th>ZK</th><td>{cfg.zkUrl}</td></tr>
            </tbody>
          </table>
          <ul>
            {cfg.simulations.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <h3>Alamat kontrak</h3>
          <table>
            <tbody>
              {Object.entries(cfg.contracts).map(([name, addr]) => (
                <tr key={name}><td>{name}</td><td><code>{addr}</code></td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {stats && (
        <>
          <h2>Statistik platform</h2>
          <p>Angka agregat saja, tanpa sesi, orang, atau pseudonim.</p>
          <table>
            <tbody>
              <tr><th>Artikel terbit</th><td>{stats.articlesPublished}</td></tr>
              <tr><th>Telaah pada artikel terbit</th><td>{stats.reviewsOnPublishedArticles}</td></tr>
              <tr><th>Penulis membuka identitas</th><td>{stats.authorsDisclosed}</td></tr>
              <tr><th>Editor membuka identitas</th><td>{stats.editorsDisclosed}</td></tr>
              <tr><th>Komentar</th><td>{stats.commentsPosted}</td></tr>
              <tr><th>Penelaah dengan bidang terverifikasi</th><td>{stats.reviewersWithVerifiedFields}</td></tr>
              <tr><th>Verifikasi bidang menunggu</th><td>{stats.pendingFieldVerifications}</td></tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
