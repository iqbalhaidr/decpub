/**
 * Klien HTTP ke backend. Satu instance dipakai halaman server (Next) dan browser.
 * Token JWT dipasang dari AuthProvider; halaman publik tidak butuh token.
 */
import axios from "axios";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

export const api = axios.create({ baseURL: API_URL, timeout: 30_000 });

/**
 * Klien TANPA token. Aksi pseudonim (membuat pseudonim, nonce, ikat dan refund APC) tidak boleh membawa JWT:
 * server tidak boleh bisa menautkan pseudonim atau note ke akun lewat permintaan itu. `api` di atas diberi
 * header Authorization oleh AuthProvider; instance ini tidak pernah.
 */
export const anonApi = axios.create({ baseURL: API_URL, timeout: 60_000 });

/** GET JSON untuk halaman server. Melempar galat dengan pesan yang bisa ditampilkan apa adanya. */
export async function getJson<T>(path: string): Promise<T> {
  try {
    const { data } = await api.get<T>(path);
    return data;
  } catch (e) {
    throw new Error(errorText(e));
  }
}

/** Pesan galat dari balasan backend (NestJS: message string atau daftar), atau galat jaringan. */
export function errorText(e: unknown): string {
  if (axios.isAxiosError(e)) {
    if (!e.response) return `Tidak bisa menghubungi backend di ${API_URL} (${e.message})`;
    const m = (e.response.data as { message?: string | string[] } | undefined)?.message;
    const text = Array.isArray(m) ? m.join("; ") : m;
    return `${e.response.status} ${text ?? e.response.statusText}`;
  }
  return e instanceof Error ? e.message : String(e);
}
