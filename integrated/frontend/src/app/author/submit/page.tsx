"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Hex } from "viem";
import AuthorGate from "@/components/AuthorGate";
import Err from "@/components/Err";
import Steps from "@/components/Steps";
import { bindNote, buyNote, createPseudonym, intake, noteOnChain, submitSession, type AdvanceSummary, type AuthorCtx, type IntakeResult } from "@/lib/author";
import { api, API_URL, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { shortHex } from "@/lib/format";
import { loadNotes, spareNotes, type StoredNote } from "@/lib/notes";
import type { Journal } from "@/lib/types";

const SAMPLES = [
  ["clean", "bersih (identitas tidak ada di isi)"],
  ["identity-exposed", "nama dan surel penulis tertulis di isi (memicu peringatan identityExposed)"],
  ["plagiarized", "isi menjiplak korpus (akan ditolak di P03)"],
  ["incomplete", "metadata kurang (akan Incomplete di P03)"],
  ["too-long", "100 halaman atau lebih (akan ditolak di P03)"],
] as const;

function Submit({ ctx }: { ctx: AuthorCtx }) {
  const { user } = useAuth();
  const [journals, setJournals] = useState<Journal[]>([]);
  const [journalId, setJournalId] = useState("");
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("Penelitian ini mengusulkan mekanisme telaah buta ganda berbasis blockchain dengan skema commit reveal untuk mengurangi bias identitas.");
  const [keywords, setKeywords] = useState("telaah buta, blockchain");
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState(user?.email ?? "");
  const [affiliation, setAffiliation] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sample, setSample] = useState<string>("clean");
  const [noteChoice, setNoteChoice] = useState<string>("");
  const [spares, setSpares] = useState<StoredNote[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ intake: IntakeResult; advance?: AdvanceSummary } | null>(null);

  useEffect(() => {
    api.get<{ journals: Journal[] }>("/journals").then((r) => {
      setJournals(r.data.journals);
      if (r.data.journals[0]) setJournalId(String(r.data.journals[0].id));
    }).catch((e) => setError(errorText(e)));
    setSpares(spareNotes(ctx.userId));
  }, [ctx.userId]);

  const log = (s: string) => setSteps((x) => [...x, s]);

  const submit = async () => {
    setError(null);
    setSteps([]);
    setResult(null);
    setBusy(true);
    try {
      if (!journalId || !title.trim() || !authorName.trim() || !authorEmail.trim()) throw new Error("Jurnal, judul, nama, dan surel penulis wajib diisi");
      const escrow = ctx.cfg.escrowRequired;

      // Pilih note SEBELUM mengunggah apa pun, supaya pengajuan yang pasti gagal tidak meninggalkan sesi setengah jadi.
      let note: StoredNote | undefined;
      if (escrow) {
        if (noteChoice === "baru") {
          log("Membeli note baru dari dompet (korelasi waktu dengan pengajuan ini: lihat catatan di /author/apc)...");
          note = await buyNote(ctx);
        } else {
          note = loadNotes(ctx.userId).find((n) => n.secret === noteChoice);
          if (!note) throw new Error("Pilih note APC (atau 'beli baru'). Server mewajibkan APC di muka.");
          const c = await noteOnChain(ctx.cfg, note.secret);
          if (!c.deposited) throw new Error("Note itu tidak ditemukan sebagai setoran di chain");
          if (c.used) throw new Error("Note itu sudah terikat ke sesi lain");
        }
      }

      let pdf: Blob;
      let filename: string;
      if (file) {
        pdf = file;
        filename = file.name;
      } else {
        log(`Mengambil PDF contoh '${sample}' dari server...`);
        const r = await fetch(`${API_URL}/manuscripts/samples/${sample}?title=${encodeURIComponent(title)}&seed=${Date.now()}`);
        if (!r.ok) throw new Error(`Gagal mengambil contoh: ${r.status}`);
        pdf = await r.blob();
        filename = `${sample}.pdf`;
      }

      log("1. Unggah ke server: berkas asli dan identitas disimpan terenkripsi, hash dan CID versi anonim dihitung.");
      const it = await intake(pdf, filename, { journalId: Number(journalId), title, authorName, authorEmail, affiliation, abstract, keywords });
      log(`   Sesi ${shortHex(it.sessionId, 16)}. Peringatan server: ${it.warnings.length ? it.warnings.join("; ") : "tidak ada"}.`);

      log("2. Membuat pseudonim Author di browser: bukti [SIMULASI] dari zk-sim, lalu relay tanpa login (server tidak bisa menautkannya ke akun).");
      const ps = await createPseudonym(ctx, it.sessionId, 0, 0);
      log(`   Pseudonim ${shortHex(ps.pseudonym, 14)}.`);

      log("3. Menandatangani CreateSession (EIP-712) dengan kunci pseudonim, lalu mengajukan sesi.");
      const sub = await submitSession(ctx, it, ps);
      log(`   Tercatat on-chain, tx ${shortHex(sub.tx.txHash, 14)}.`);
      let advance = sub.advance;

      if (note) {
        log("4. Mengikat note APC ke sesi: bukti NOTE_BIND [SIMULASI], relay tanpa login (note dan dompet tidak muncul di transaksi).");
        const b = await bindNote(ctx, it.sessionId, note);
        if (b.advance) advance = b.advance;
        log("   APC terikat.");
      }
      setResult({ intake: it, advance });
      log("Selesai. Lihat status dan hasil pengecekan di halaman sesi.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setSpares(spareNotes(ctx.userId));
    }
  };

  return (
    <div>
      <h1>Ajukan naskah</h1>
      <Err message={error} />
      <p>
        Alur P02. Server tahu siapa pemilik naskah (login), tetapi tidak pernah menerima secret Anda. Yang ditulis ke chain adalah
        hash naskah anonim, bukan nama. {ctx.cfg.escrowRequired ? "Server mewajibkan APC di muka." : "APC tidak diwajibkan pada server ini."}
      </p>

      <h2>Naskah</h2>
      <table>
        <tbody>
          <tr><th>Jurnal</th><td>
            <select name="journal" value={journalId} onChange={(e) => setJournalId(e.target.value)}>
              {journals.map((j) => <option key={j.id} value={j.id}>{j.name} ({j.categoryLabel})</option>)}
            </select>
          </td></tr>
          <tr><th>Judul</th><td><input type="text" name="title" value={title} onChange={(e) => setTitle(e.target.value)} /></td></tr>
          <tr><th>Abstrak</th><td><textarea name="abstract" rows={3} value={abstract} onChange={(e) => setAbstract(e.target.value)} /></td></tr>
          <tr><th>Kata kunci (pisah koma)</th><td><input type="text" name="keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} /></td></tr>
          <tr><th>Berkas PDF</th><td><input type="file" name="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></td></tr>
          <tr><th>... atau PDF contoh</th><td>
            <select name="sample" value={sample} onChange={(e) => setSample(e.target.value)} disabled={!!file}>
              {SAMPLES.map(([k, d]) => <option key={k} value={k}>{k}: {d}</option>)}
            </select>
            {" "}(dipakai bila tidak memilih berkas)
          </td></tr>
        </tbody>
      </table>

      <h2>Identitas penulis (rahasia)</h2>
      <p>Disimpan terenkripsi di server, hanya dibuka bila Anda memilih mengungkapkannya setelah terbit.</p>
      <table>
        <tbody>
          <tr><th>Nama</th><td><input type="text" name="authorName" value={authorName} onChange={(e) => setAuthorName(e.target.value)} /></td></tr>
          <tr><th>Surel</th><td><input type="email" name="authorEmail" value={authorEmail} onChange={(e) => setAuthorEmail(e.target.value)} /></td></tr>
          <tr><th>Afiliasi</th><td><input type="text" name="affiliation" value={affiliation} onChange={(e) => setAffiliation(e.target.value)} /></td></tr>
        </tbody>
      </table>

      {ctx.cfg.escrowRequired && (
        <>
          <h2>APC</h2>
          <p>
            <select name="note" value={noteChoice} onChange={(e) => setNoteChoice(e.target.value)}>
              <option value="">(pilih note)</option>
              {spares.map((n) => <option key={n.secret} value={n.secret}>note {shortHex(n.commitment, 14)}</option>)}
              <option value="baru">beli note baru sekarang</option>
            </select>
            {" "}<Link href="/author/apc">kelola note</Link>
          </p>
        </>
      )}

      <p><button onClick={submit} disabled={busy}>{busy ? "Memproses..." : "Ajukan"}</button></p>
      <Steps items={steps} />
      {result && (
        <p>
          <Link href={`/author/sessions/${result.intake.sessionId}`}>Buka halaman sesi</Link>
          {result.advance && <> | status sekarang: <b>{result.advance.status}</b></>}
        </p>
      )}
    </div>
  );
}

export default function SubmitPage() {
  return <AuthorGate>{(ctx) => <Submit ctx={ctx} />}</AuthorGate>;
}
