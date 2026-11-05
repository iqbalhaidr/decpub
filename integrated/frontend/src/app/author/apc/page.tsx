"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatEther, type Hex } from "viem";
import { noteCommitment } from "@decpub/shared";
import AuthorGate from "@/components/AuthorGate";
import Err from "@/components/Err";
import { apcAmount, buyNote, noteOnChain, type AuthorCtx } from "@/lib/author";
import { errorText } from "@/lib/api";
import { shortHex } from "@/lib/format";
import { addNote, loadNotes, type StoredNote } from "@/lib/notes";
import { walletFor } from "@/lib/wallet";
import { chainInfo } from "@/lib/author";

interface Row {
  note: StoredNote;
  chain: { deposited: boolean; used: boolean } | null;
}

function Apc({ ctx }: { ctx: AuthorCtx }) {
  const [apc, setApc] = useState<bigint | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [importText, setImportText] = useState("");
  const walletKind = walletFor(chainInfo(ctx.cfg), ctx.cfg.network).kind;

  const refresh = useCallback(async () => {
    const notes = loadNotes(ctx.userId);
    setRows(await Promise.all(notes.map(async (note) => ({ note, chain: await noteOnChain(ctx.cfg, note.secret).catch(() => null) }))));
  }, [ctx]);

  useEffect(() => {
    apcAmount(ctx.cfg).then(setApc).catch((e) => setError(errorText(e)));
    refresh().catch((e) => setError(errorText(e)));
  }, [ctx, refresh]);

  const act = async (fn: () => Promise<void>) => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      refresh().catch(() => undefined);
    }
  };

  const buy = () =>
    act(async () => {
      const n = await buyNote(ctx);
      setInfo(`Note dibeli. Setor ${shortHex(n.depositTx, 14)} dari ${n.payer}. Rahasia note tersimpan di browser ini: ekspor salinannya.`);
    });

  const doImport = () =>
    act(async () => {
      const lines = importText.split(/\s+/).filter(Boolean);
      if (lines.length === 0 || !lines.every((l) => /^0x[0-9a-fA-F]{64}$/.test(l))) throw new Error("Satu rahasia note per baris, masing-masing 0x diikuti 64 digit heksadesimal");
      for (const secret of lines) addNote(ctx.userId, { secret: secret as Hex, commitment: noteCommitment(secret as Hex), status: "deposited", createdAt: new Date().toISOString() });
      setImportText("");
      setInfo(`${lines.length} note diimpor. Keadaan di chain diperiksa di tabel.`);
    });

  return (
    <div>
      <h1>APC: note di muka</h1>
      <Err message={error} />
      {info && <p>{info}</p>}
      <p>
        Biaya pemrosesan artikel (APC) dibayar di muka ke escrow. Satu note = satu nominal tetap
        ({apc === null ? "..." : `${formatEther(apc)} ETH`}). Dari dompet mana pun Anda menyetor; saat note diikat ke sesi,
        yang tampil di chain hanya nullifier, bukan note maupun dompet penyetor.
      </p>
      <ul>
        <li>Dompet setor: <b>{walletKind === "dev" ? "dompet dev lokal (akun Hardhat terbuka, tanpa MetaMask)" : "MetaMask / dompet browser"}</b></li>
        <li>Saran privasi: beli note jauh sebelum mengajukan. Setor dan pengikatan yang berdekatan waktu bisa dikorelasikan.</li>
        <li><b>Rahasia note hilang berarti APC hilang</b>; tidak ada pemulihan oleh admin. Ekspor di bawah.</li>
      </ul>
      <p><button onClick={buy} disabled={busy || apc === null}>{busy ? "Memproses..." : "Beli satu note"}</button></p>

      <h2>Note saya</h2>
      {rows.length === 0 ? (
        <p>Belum ada.</p>
      ) : (
        <table>
          <thead><tr><th>Commitment</th><th>Status di browser</th><th>Disetor di chain</th><th>Sudah terikat ke sesi</th><th>Sesi (catatan browser ini)</th>{show && <th>Rahasia</th>}</tr></thead>
          <tbody>
            {rows.map(({ note, chain }) => (
              <tr key={note.secret}>
                <td><code>{shortHex(note.commitment, 14)}</code></td>
                <td>{note.status}</td>
                <td>{chain ? (chain.deposited ? "ya" : "tidak") : "?"}</td>
                <td>{chain ? (chain.used ? "ya" : "belum") : "?"}</td>
                <td>{note.boundSession ? <Link href={`/author/sessions/${note.boundSession}`}>{shortHex(note.boundSession, 12)}</Link> : "-"}</td>
                {show && <td><code>{note.secret}</code></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p><button onClick={() => setShow(!show)}>{show ? "Sembunyikan rahasia" : "Tampilkan rahasia untuk diekspor"}</button></p>

      <h2>Impor rahasia note</h2>
      <p>Satu rahasia per baris (mis. dari salinan sebelumnya atau browser lain).</p>
      <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={3} placeholder="0x..." autoComplete="off" />
      <p><button onClick={doImport} disabled={busy}>Impor</button></p>

      <p><Link href="/author/submit">Lanjut: ajukan naskah</Link></p>
    </div>
  );
}

export default function ApcPage() {
  return <AuthorGate>{(ctx) => <Apc ctx={ctx} />}</AuthorGate>;
}
