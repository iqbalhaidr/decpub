/** Pemformat teks polos. Tidak ada logika bisnis di sini. */
import { formatEther } from "viem";

export const shortHex = (h: string | null | undefined, n = 10): string => (h ? (h.length > n + 6 ? `${h.slice(0, n)}…${h.slice(-4)}` : h) : "-");

export const eth = (wei: string | bigint | number, digits = 6): string => {
  const s = formatEther(BigInt(wei));
  const [i, f = ""] = s.split(".");
  return `${i}.${f.padEnd(digits, "0").slice(0, digits)} ETH`;
};

/** Detik epoch (timestamp blok) ke teks tanggal UTC. */
export const when = (sec: number | null | undefined): string => (sec ? new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "-");

export const yesNo = (v: boolean | null | undefined): string => (v === null || v === undefined ? "-" : v ? "ya" : "tidak");

export const REC_NAMES = ["None", "Reject", "MajorRevision", "MinorRevision", "AcceptAsIs"] as const;
/** Rekomendasi bisa berupa angka atau nama, tergantung titik akhir. */
export const recName = (v: number | string): string => (typeof v === "number" ? (REC_NAMES[v] ?? String(v)) : v);
