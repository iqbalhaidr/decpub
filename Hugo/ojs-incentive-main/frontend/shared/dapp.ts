// Shared dApp helpers for the Sepolia role pages (no ethers import here so pages
// that only READ or sign off-chain stay lightweight; author.ts imports ethers itself).

export interface DappConfig {
  network: string;
  chainId: number;
  incentiveEngine: string | null;
  reputationSBT: string | null;
  engineAbi: string[];
  demoReviewers?: string[];
  deadlineDays?: number;
  bwmPresets?: Array<{ key: string; label: string; best: string; worst: string; interpretation: string }>;
}

const EXPLORERS: Record<number, string> = {
  11155111: "https://sepolia.etherscan.io",
  1: "https://etherscan.io",
};

export async function loadConfig(): Promise<DappConfig> {
  return await (await fetch("/api/onchain/config")).json();
}
export function explorerFor(chainId: number): string { return EXPLORERS[chainId] || ""; }
export function txLink(ex: string, h: string): string {
  return ex ? `<a href="${ex}/tx/${h}" target="_blank" rel="noopener">${h.slice(0, 18)}…</a>` : h;
}
export function addrLink(ex: string, a: string): string {
  return ex ? `<a href="${ex}/address/${a}" target="_blank" rel="noopener">${a.slice(0, 10)}…${a.slice(-4)}</a>` : a;
}
export function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

// Connect MetaMask (returns the selected address) and nudge to the right chain.
// Memaksa pemilih akun (wallet_requestPermissions) agar pengguna dapat memilih
// akun/peran yang tepat — bukan sekadar akun yang sudah diizinkan sebelumnya.
export async function connectAddress(cfg: DappConfig): Promise<string> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("MetaMask tidak terdeteksi");
  try { await eth.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] }); } catch {}
  const accts = await eth.request({ method: "eth_requestAccounts" });
  const want = "0x" + Number(cfg.chainId).toString(16);
  const cur = await eth.request({ method: "eth_chainId" });
  if (cur !== want) { try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: want }] }); } catch {} }
  return accts[0];
}

export async function postJson(url: string, body: any): Promise<any> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || "Gagal");
  return d;
}
