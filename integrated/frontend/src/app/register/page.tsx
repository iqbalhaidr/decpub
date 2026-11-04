"use client";

import Link from "next/link";
import { useState } from "react";
import { FIELD_SLUGS } from "@decpub/shared";
import Err from "@/components/Err";
import { api, errorText } from "@/lib/api";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"author" | "reviewer">("author");
  const [fields, setFields] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (f: string) => setFields((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api.post("/auth/register", { email, password, role, specialities: role === "reviewer" ? fields : undefined });
      setDone(
        role === "reviewer"
          ? "Akun dibuat. Bidang yang Anda pilih masuk antrian verifikasi admin; kredensial Reviewer terbit setelah disetujui."
          : "Akun dibuat.",
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>Daftar</h1>
      <p>Akun ini hanya untuk operasional (login, antrian, surel). Identitas anonim dibuat terpisah di <Link href="/profile">Profil</Link> dari secret yang hanya ada di browser Anda.</p>
      <form onSubmit={submit}>
        <p>Surel: <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></p>
        <p>Password (min. 4 karakter): <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={4} required /></p>
        <p>
          Peran:{" "}
          <label><input type="radio" name="role" checked={role === "author"} onChange={() => setRole("author")} /> penulis</label>{" "}
          <label><input type="radio" name="role" checked={role === "reviewer"} onChange={() => setRole("reviewer")} /> penelaah</label>
        </p>
        {role === "reviewer" && (
          <p>
            Bidang keahlian (minimal satu):{" "}
            {FIELD_SLUGS.map((f) => (
              <label key={f}><input type="checkbox" checked={fields.includes(f)} onChange={() => toggle(f)} /> {f} </label>
            ))}
          </p>
        )}
        <p>Editor dan admin tidak bisa mendaftar sendiri (hanya lewat seed).</p>
        <p><button type="submit" disabled={busy}>Daftar</button></p>
      </form>
      <Err message={error} />
      {done && (
        <p>
          {done} Silakan <Link href="/login">masuk</Link>.
        </p>
      )}
    </div>
  );
}
