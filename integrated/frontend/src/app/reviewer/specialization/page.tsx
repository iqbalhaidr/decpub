"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FIELD_SLUGS } from "@decpub/shared";
import Err from "@/components/Err";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { FieldRequest } from "@/lib/types";

/** Spesialisasi penelaah: minta verifikasi bidang. Admin yang menyetujui (editor tidak melihat surel kandidat). */
export default function Specialization() {
  const { user, loading, refresh } = useAuth();
  const [req, setReq] = useState<FieldRequest | null | undefined>(undefined);
  const [fields, setFields] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setReq((await api.get<FieldRequest | null>("/reviewer/field-requests/me")).data ?? null);
  }, []);
  useEffect(() => {
    if (user?.role === "reviewer") load().catch((e) => setError(errorText(e)));
  }, [user, load]);

  if (loading) return <p>Memuat...</p>;
  if (!user) return <p>Halaman ini butuh login. <Link href="/login">Masuk</Link>.</p>;
  if (user.role !== "reviewer") return <p>Halaman ini untuk penelaah. Akun Anda berperan {user.role}.</p>;

  const submit = async () => {
    setError(null);
    setInfo(null);
    try {
      if (fields.length === 0) throw new Error("Pilih sedikitnya satu bidang");
      await api.post("/reviewer/field-requests", { fields });
      setInfo("Permintaan dikirim. Menunggu persetujuan admin.");
      await load();
      await refresh();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div>
      <h1>Spesialisasi penelaah</h1>
      <Err message={error} />
      {info && <p>{info}</p>}
      <p>
        Hanya penelaah dengan <b>bidang terverifikasi</b> yang menjadi kandidat seleksi. Admin yang menyetujui; setelah itu kredensial bidang terbit
        dan dipakai sebagai witness untuk bukti penugasan [SIMULASI]. Permintaan baru menggantikan yang masih menunggu.
      </p>
      <table>
        <tbody>
          <tr><th>Bidang diminati</th><td>{user.specialities.join(", ") || "-"}</td></tr>
          <tr><th>Bidang terverifikasi</th><td>{user.verifiedFields.join(", ") || "(belum ada)"}</td></tr>
          <tr><th>Permintaan terakhir</th><td>{req === undefined ? "memuat..." : req ? `#${req.id}: ${req.fields.join(", ")} - ${req.status}` : "belum ada"}</td></tr>
        </tbody>
      </table>
      <h2>Minta verifikasi</h2>
      <p>
        {FIELD_SLUGS.map((f) => (
          <label key={f}>
            <input type="checkbox" name={`field-${f}`} checked={fields.includes(f)} onChange={(e) => setFields(e.target.checked ? [...fields, f] : fields.filter((x) => x !== f))} /> {f}{" "}
          </label>
        ))}
      </p>
      <p><button onClick={submit}>Kirim permintaan</button></p>
    </div>
  );
}
