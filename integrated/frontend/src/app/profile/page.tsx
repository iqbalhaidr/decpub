"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Hex } from "viem";
import Err from "@/components/Err";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { shortHex } from "@/lib/format";
import { isSecret, loadSecret, newSecret, publicIdentity, removeSecret, saveSecret } from "@/lib/secret";

interface Credentials {
  identityCommitment: string;
  roles: Record<string, string>;
  fields: Record<string, string>;
}
interface Contributions {
  articlesPublished: number;
  editorialScreenings: number;
  reviewsSubmitted: number;
}

export default function Profile() {
  const { user, loading, refresh } = useAuth();
  const [secret, setSecret] = useState<Hex | null>(null);
  const [show, setShow] = useState(false);
  const [importText, setImportText] = useState("");
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [contrib, setContrib] = useState<Contributions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (user) setSecret(loadSecret(user.id));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    api.get<Contributions>("/me/contributions").then((r) => setContrib(r.data)).catch(() => setContrib(null));
    if (user.identityCommitment) {
      api.get<Credentials>("/me/credentials").then((r) => setCreds(r.data)).catch((e) => setError(errorText(e)));
    } else {
      setCreds(null);
    }
  }, [user]);

  if (loading) return <p>Memuat...</p>;
  if (!user) {
    return (
      <p>
        Profil butuh login. <Link href="/login">Masuk</Link> atau <Link href="/register">daftar</Link>.
      </p>
    );
  }

  const ident = secret ? publicIdentity(secret) : null;
  const mismatch = !!(ident && user.identityCommitment && ident.commitment.toLowerCase() !== user.identityCommitment.toLowerCase());

  const act = async (fn: () => Promise<void>) => {
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const create = () =>
    act(async () => {
      if (secret && !confirm("Menimpa secret yang ada? Pseudonim yang sudah dibuat dari secret lama tidak bisa dipakai lagi.")) return;
      const s = newSecret();
      saveSecret(user.id, s);
      setSecret(s);
      setShow(true);
      setInfo("Secret dibuat dan disimpan di browser ini. Ekspor sekarang: tanpa salinan, kehilangan secret tidak bisa dipulihkan.");
    });

  const doImport = () =>
    act(async () => {
      const v = importText.trim();
      if (!isSecret(v)) throw new Error("Secret harus 0x diikuti 64 digit heksadesimal");
      saveSecret(user.id, v);
      setSecret(v);
      setImportText("");
      setInfo("Secret diimpor.");
    });

  const remove = () =>
    act(async () => {
      if (!confirm("Hapus secret dari browser ini? Tanpa salinan, identitas anonim Anda hilang.")) return;
      removeSecret(user.id);
      setSecret(null);
      setShow(false);
    });

  const register = () =>
    act(async () => {
      if (!ident) return;
      await api.post("/me/identity", { identityCommitment: ident.commitment, permanentAddress: ident.permanentAddress });
      await refresh();
      setInfo("Identitas terdaftar di PermanentAccounts.");
    });

  return (
    <div>
      <h1>Profil</h1>
      <Err message={error} />
      {info && <p>{info}</p>}

      <h2>Akun</h2>
      <table>
        <tbody>
          <tr><th>Surel</th><td>{user.email}</td></tr>
          <tr><th>Peran</th><td>{user.role}</td></tr>
          {user.role === "reviewer" && (
            <>
              <tr><th>Bidang diminati</th><td>{user.specialities.join(", ") || "-"}</td></tr>
              <tr><th>Bidang terverifikasi admin</th><td>{user.verifiedFields.join(", ") || "(belum ada)"}</td></tr>
            </>
          )}
          <tr><th>Identitas terdaftar</th><td>{user.identityCommitment ? `ya, ${user.identityRegisteredAt ?? ""}` : "belum"}</td></tr>
        </tbody>
      </table>

      <h2>Secret identitas</h2>
      <p>
        Secret dibuat dan disimpan hanya di browser ini; server tidak pernah menerimanya. Dari secret diturunkan semua pseudonim sesi, bukti
        kepemilikan, klaim imbalan, dan reputasi. Kehilangan secret berarti kehilangan semuanya: <b>ekspor dan simpan salinannya</b>.
      </p>
      {!secret ? (
        <>
          <p><button onClick={create}>Buat secret baru</button></p>
          <p>
            Atau impor:{" "}
            <input type="password" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="0x..." autoComplete="off" />{" "}
            <button onClick={doImport}>Impor</button>
          </p>
        </>
      ) : (
        <>
          <table>
            <tbody>
              <tr><th>identityCommitment (publik)</th><td><code>{ident!.commitment}</code></td></tr>
              <tr><th>Akun permanen (dompet dev turunan secret)</th><td><code>{ident!.permanentAddress}</code></td></tr>
              <tr>
                <th>Secret</th>
                <td>
                  <code>{show ? secret : "(tersembunyi)"}</code>{" "}
                  <button onClick={() => setShow(!show)}>{show ? "Sembunyikan" : "Tampilkan untuk diekspor"}</button>
                </td>
              </tr>
            </tbody>
          </table>
          {mismatch && <p>PERINGATAN: commitment secret ini berbeda dengan yang terdaftar di akun. Impor secret yang benar, atau secret ini tidak akan dikenali.</p>}
          <p>
            <button onClick={create}>Buat ulang</button> <button onClick={remove}>Hapus dari browser</button>
          </p>
          {!user.identityCommitment && (
            <p>
              Identitas belum didaftarkan. Hanya <code>identityCommitment</code> dan alamat akun permanen yang dikirim.{" "}
              <button onClick={register}>Daftarkan identitas</button>
            </p>
          )}
        </>
      )}

      {creds && (
        <>
          <h2>Kredensial</h2>
          <p>Tanda tangan penerbit atas identitas Anda. Dipakai sebagai witness di browser untuk membuat bukti ZK [SIMULASI]; tidak pernah muncul on-chain.</p>
          <table>
            <thead><tr><th>Jenis</th><th>Nama</th><th>Tanda tangan</th></tr></thead>
            <tbody>
              {Object.entries(creds.roles).map(([r, sig]) => (
                <tr key={`r-${r}`}><td>peran</td><td>{r}</td><td><code>{shortHex(sig, 14)}</code></td></tr>
              ))}
              {Object.entries(creds.fields).map(([f, sig]) => (
                <tr key={`f-${f}`}><td>bidang</td><td>{f}</td><td><code>{shortHex(sig, 14)}</code></td></tr>
              ))}
            </tbody>
          </table>
          {user.role === "reviewer" && Object.keys(creds.fields).length === 0 && <p>Belum ada kredensial bidang: menunggu persetujuan admin.</p>}
        </>
      )}

      {contrib && (
        <>
          <h2>Kontribusi saya</h2>
          <p>Jumlah milik Anda sendiri; tidak ada profil publik per anggota.</p>
          <table>
            <tbody>
              <tr><th>Artikel terbit (sebagai penulis)</th><td>{contrib.articlesPublished}</td></tr>
              <tr><th>Penyaringan editorial</th><td>{contrib.editorialScreenings}</td></tr>
              <tr><th>Telaah terkirim</th><td>{contrib.reviewsSubmitted}</td></tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
