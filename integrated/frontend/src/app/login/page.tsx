"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Err from "@/components/Err";
import { errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.push("/profile");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>Masuk</h1>
      <form onSubmit={submit}>
        <p>Surel: <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></p>
        <p>Password: <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></p>
        <p><button type="submit" disabled={busy}>Masuk</button></p>
      </form>
      <Err message={error} />
      <p>Belum punya akun? <Link href="/register">Daftar</Link>.</p>
      <h2>Akun demo lokal</h2>
      <p>Hanya ada bila server berjalan di jaringan lokal (<code>SEED_DEMO_ACCOUNTS</code>). Password ini publik.</p>
      <table>
        <thead><tr><th>Peran</th><th>Surel</th><th>Password</th></tr></thead>
        <tbody>
          <tr><td>admin</td><td>admin@desci.local</td><td>admin123</td></tr>
          <tr><td>editor (semua bidang)</td><td>editor@desci.local</td><td>editor123</td></tr>
          <tr><td>editor (ai)</td><td>editor.ai@desci.local</td><td>editor123</td></tr>
          <tr><td>penelaah 1-6</td><td>rev1@mail.com ... rev6@mail.com</td><td>rev1 ... rev6</td></tr>
          <tr><td>penulis 1-3</td><td>author1@mail.com ... author3@mail.com</td><td>author1 ... author3</td></tr>
        </tbody>
      </table>
    </div>
  );
}
