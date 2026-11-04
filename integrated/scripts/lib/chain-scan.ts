/**
 * Pemindai kebocoran: mencari nilai terlarang (commitment permanen, alamat dompet, surel, nama,
 * secret) di calldata dan log semua transaksi sejak blok tertentu. Menutup celah tes berbasis
 * mock Ciko yang hanya mengukur proyeksi API (arsitektur bagian 14 butir 1).
 */
import { pad, type Hex, type PublicClient } from "viem";

export interface Needle {
  label: string;
  /** Hex (32 byte / alamat) atau teks biasa. */
  value: string;
}

export interface ScanResult {
  blocksScanned: number;
  txsScanned: number;
  hits: { label: string; txHash: string; where: "input" | "log" }[];
}

const toHexNoPrefix = (s: string) => Buffer.from(s, "utf8").toString("hex");

function variants(n: Needle): string[] {
  const v = n.value;
  if (/^0x[0-9a-fA-F]{40}$/.test(v)) return [pad(v as Hex, { size: 32 }).slice(2).toLowerCase(), v.slice(2).toLowerCase()];
  if (/^0x[0-9a-fA-F]+$/.test(v)) return [v.slice(2).toLowerCase()];
  return [toHexNoPrefix(v).toLowerCase(), toHexNoPrefix(v.toLowerCase()).toLowerCase()];
}

export async function scanChain(
  client: PublicClient,
  fromBlock: bigint,
  needles: Needle[],
  skipTx: Set<string> = new Set(),
): Promise<ScanResult> {
  const latest = await client.getBlockNumber({ cacheTime: 0 }); // cacheTime 0: lihat catatan M2 (cache jebakan)
  const result: ScanResult = { blocksScanned: 0, txsScanned: 0, hits: [] };
  const prepared = needles.map((n) => ({ ...n, forms: variants(n) }));
  for (let b = fromBlock; b <= latest; b++) {
    const block = await client.getBlock({ blockNumber: b, includeTransactions: true });
    result.blocksScanned++;
    for (const tx of block.transactions) {
      if (skipTx.has(tx.hash.toLowerCase())) continue;
      result.txsScanned++;
      const input = tx.input.slice(2).toLowerCase();
      const receipt = await client.getTransactionReceipt({ hash: tx.hash });
      const logs = receipt.logs.map((l) => (l.data + l.topics.join("")).replace(/0x/g, "").toLowerCase()).join("");
      for (const n of prepared) {
        for (const f of n.forms) {
          if (input.includes(f)) result.hits.push({ label: n.label, txHash: tx.hash, where: "input" });
          if (logs.includes(f)) result.hits.push({ label: n.label, txHash: tx.hash, where: "log" });
        }
      }
    }
  }
  return result;
}
