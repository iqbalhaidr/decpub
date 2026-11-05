"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { permanentAccountAddress } from "@decpub/shared";
import AuthorGate from "@/components/AuthorGate";
import Err from "@/components/Err";
import { discloseAuthor, type AuthorCtx, type DisclosureResult } from "@/lib/author";
import { api, errorText } from "@/lib/api";
import { shortHex } from "@/lib/format";
import { loadOwnSessions, type OwnSession } from "@/lib/sessions";
import type { ArticleDetail, Manifest } from "@/lib/types";

type Field = "name" | "affiliation" | "email";

function Disclose({ ctx }: { ctx: AuthorCtx }) {
  const [rows, setRows] = useState<OwnSession[] | null>(null);
  const [pick, setPick] = useState("");
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [chosen, setChosen] = useState<Record<Field, boolean>>({ name: true, affiliation: true, email: false });
  const [includeManuscript, setIncludeManuscript] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DisclosureResult | null>(null);

  useEffect(() => {
    loadOwnSessions()
      .then((all) => {
        const pubd = all.filter((r) => r.detail?.session?.status === "Published");
        setRows(pubd);
        const wanted = new URLSearchParams(window.location.search).get("session");
        setPick(pubd.find((r) => r.manuscript.sessionId === wanted)?.manuscript.sessionId ?? pubd[0]?.manuscript.sessionId ?? "");
      })
      .catch((e) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    setManifest(null);
    setArticle(null);
    setResult(null);
    const m = rows?.find((r) => r.manuscript.sessionId === pick)?.manuscript;
    if (!m) return;
    api.get<Manifest>(`/manuscripts/${m.id}/manifest`).then((r) => setManifest(r.data)).catch((e) => setError(errorText(e)));
    api.get<ArticleDetail>(`/articles/${pick}`).then((r) => setArticle(r.data)).catch(() => undefined);
  }, [pick, rows]);

  const values: Record<Field, string | undefined> = {
    name: manifest?.metadata.authorName,
    affiliation: manifest?.metadata.affiliation,
    email: manifest?.metadata.authorEmail,
  };
  const LABEL: Record<Field, string> = { name: "Nama", affiliation: "Afiliasi", email: "Surel" };

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      const attributes: Partial<Record<Field, string>> = {};
      for (const f of ["name", "affiliation", "email"] as Field[]) if (chosen[f] && values[f]) attributes[f] = values[f];
      if (Object.keys(attributes).length === 0 && !includeManuscript) throw new Error("Pilih sedikitnya satu atribut atau naskah asli");
      setResult(await discloseAuthor(ctx, pick as `0x${string}`, attributes, includeManuscript));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>Ungkap identitas (selective disclosure)</h1>
      <Err message={error} />
      <p>
        <b>Tidak bisa dicabut.</b> Setelah terkirim, pseudonim penulis sesi ini tertaut ke akun permanen Anda di ledger selamanya, dan atribut yang
        dipilih tampil di halaman artikel. Hanya atribut yang Anda centang yang masuk ke hash dan ke halaman publik. Penelaah tidak pernah diungkap.
      </p>
      {!rows ? (
        <p>Memuat...</p>
      ) : rows.length === 0 ? (
        <p>Tidak ada naskah berstatus Published. Pengungkapan hanya setelah terbit (desk reject dan gagal P03 tidak diungkap). <Link href="/author">Naskah saya</Link>.</p>
      ) : result ? (
        <>
          <h2>Terkirim</h2>
          <table>
            <tbody>
              <tr><th>Transaksi</th><td><code>{result.txHash}</code></td></tr>
              <tr><th>Hash atribut</th><td><code>{result.attributesHash}</code></td></tr>
              <tr><th>Atribut dibuka</th><td>{Object.entries(result.attributes).map(([k, v]) => `${k}=${v}`).join(", ") || "(tidak ada)"}</td></tr>
              <tr><th>Naskah asli</th><td>{result.originalManuscript ? <>CID <code>{result.originalManuscript.cid}</code>, sha256 <code>{shortHex(result.originalManuscript.sha256, 16)}</code>, terunggah: {result.originalManuscript.uploaded ? "ya" : "belum"}</> : "tidak dibuka"}</td></tr>
            </tbody>
          </table>
          <p><Link href={`/articles/${pick}`}>Lihat artikel</Link></p>
        </>
      ) : (
        <>
          <table>
            <tbody>
              <tr><th>Artikel</th><td>
                <select name="session" value={pick} onChange={(e) => setPick(e.target.value)}>
                  {rows.map((r) => <option key={r.manuscript.id} value={r.manuscript.sessionId}>{r.manuscript.title}</option>)}
                </select>
                {article && <> | DOI {article.doi}{article.author.disclosed ? " (identitas sudah diungkap)" : ""}</>}
              </td></tr>
            </tbody>
          </table>
          {article?.author.disclosed ? (
            <p>Penulis artikel ini sudah mengungkap identitas; pengungkapan hanya bisa satu kali per sesi.</p>
          ) : (
            <>
              <h2>Atribut yang dibuka (dari data pengajuan Anda)</h2>
              <table>
                <tbody>
                  {(["name", "affiliation", "email"] as Field[]).map((f) => (
                    <tr key={f}>
                      <th><label><input type="checkbox" name={`attr-${f}`} checked={chosen[f]} disabled={!values[f]} onChange={(e) => setChosen({ ...chosen, [f]: e.target.checked })} /> {LABEL[f]}</label></th>
                      <td>{values[f] ?? "(kosong)"}</td>
                    </tr>
                  ))}
                  <tr>
                    <th><label><input type="checkbox" name="includeManuscript" checked={includeManuscript} onChange={(e) => setIncludeManuscript(e.target.checked)} /> Naskah asli</label></th>
                    <td>dibuka ke storage publik; hash-nya harus sama dengan <code>originalManuscriptHash</code> on-chain</td>
                  </tr>
                </tbody>
              </table>
              <p>Akun permanen yang ditautkan: <code>{permanentAccountAddress(ctx.secret)}</code> (turunan secret, didaftarkan di Profil).</p>
              <p><label><input type="checkbox" name="confirm" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Saya mengerti bahwa pengungkapan ini permanen dan tidak bisa dicabut.</label></p>
              <p><button onClick={send} disabled={busy || !confirmed || !manifest}>{busy ? "Memproses..." : "Ungkap"}</button></p>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function DisclosePage() {
  return <AuthorGate>{(ctx) => <Disclose ctx={ctx} />}</AuthorGate>;
}
