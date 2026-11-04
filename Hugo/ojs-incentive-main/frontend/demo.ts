// frontend/demo.ts — standalone sidang demo for the HYBRID testnet flow:
//   1) Author connects MetaMask and calls createBatch (deposit escrow)  [author-signed, live]
//   2) Operator runs executeDistribution via the server                 [server-signed]
//   3) Show ETH rewards + SBT reputation + Etherscan links.
//
// Bundled by `npm run build:web` -> public/js/demo.js, loaded by public/demo.html.
// Server must run bound to the target network, e.g.:
//   HARDHAT_NETWORK=sepolia npx ts-node server/index.ts

import { BrowserProvider, Contract, parseEther, Wallet } from "ethers";
import { post } from "./shared/api";

// Demo dataset (columns match server CRITERIA_TYPES): [q1 timeliness(cost), q2, q3, q4]
const DEMO_MATRIX: number[][] = [
  [2, 0.85, 0.80, 0.7],
  [1, 0.60, 0.55, 0.5],
  [3, 0.75, 0.70, 0.6],
  [5, 0.30, 0.20, 0.2], // free-rider
];
const DEMO_LABELS = ["Honest-A", "Honest-B", "Honest-C", "Free-rider"];
const EXPLORERS: Record<number, string> = { 11155111: "https://sepolia.etherscan.io", 1: "https://etherscan.io" };

let cfg: any = null;
let account: string | null = null;
let recipients: string[] = [];
let lastBatchId: number | null = null;

const $ = (id: string) => document.getElementById(id) as HTMLElement;
function log(msg: string, cls = "info") {
  const el = $("log");
  el.innerHTML += `<div class="${cls}">${msg}</div>`;
  el.scrollTop = el.scrollHeight;
}
const explorer = () => (cfg && EXPLORERS[cfg.chainId]) || "";
const txLink = (h: string) => (explorer() ? `<a href="${explorer()}/tx/${h}" target="_blank" rel="noopener">${h.slice(0, 20)}…</a>` : h);
const addrLink = (a: string) => (explorer() ? `<a href="${explorer()}/address/${a}" target="_blank" rel="noopener">${a}</a>` : a);

async function init() {
  try {
    cfg = await (await fetch("/api/onchain/config")).json();
  } catch (e: any) { log("Gagal memuat config: " + e.message, "err"); return; }
  $("cfg").innerHTML =
    `Network: <b>${cfg.network}</b> (chainId ${cfg.chainId})<br>` +
    `IncentiveEngine: ${cfg.incentiveEngine ? addrLink(cfg.incentiveEngine) : "<i>belum ada — jalankan npm run deploy:sepolia:persist</i>"}<br>` +
    `ReputationSBT: ${cfg.reputationSBT ? addrLink(cfg.reputationSBT) : "-"}`;
  // Attach the server operator to the deployed contracts.
  try { await post("/api/onchain/attach"); log("Server operator attached ke kontrak.", "ok"); }
  catch (e: any) { log("Attach operator gagal: " + e.message + " (jalankan server dengan HARDHAT_NETWORK=sepolia)", "warn"); }
}

async function connect() {
  const eth = (window as any).ethereum;
  if (!eth) { log("MetaMask tidak terdeteksi. Pasang ekstensi MetaMask.", "err"); return; }
  try {
    const accts = await eth.request({ method: "eth_requestAccounts" });
    account = accts[0];
    const wantHex = "0x" + Number(cfg.chainId).toString(16);
    const cur = await eth.request({ method: "eth_chainId" });
    if (cur !== wantHex) {
      try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: wantHex }] }); }
      catch { log("Pindahkan jaringan MetaMask ke chainId " + cfg.chainId + " secara manual.", "warn"); }
    }
    $("acct").innerHTML = `Author wallet: <b>${account}</b>`;
    ($("depositBtn") as HTMLButtonElement).disabled = false;
    log("MetaMask terhubung: " + account, "ok");
  } catch (e: any) { log("Connect gagal: " + (e.shortMessage || e.message), "err"); }
}

async function deposit() {
  if (!cfg?.incentiveEngine) { log("Kontrak belum ter-deploy/attach.", "err"); return; }
  const escrow = ($("escrow") as HTMLInputElement).value || "0.01";
  try {
    const provider = new BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const engine = new Contract(cfg.incentiveEngine, cfg.engineAbi, signer);
    recipients = DEMO_MATRIX.map(() => Wallet.createRandom().address);
    log(`createBatch: escrow ${escrow} ETH, ${recipients.length} reviewer — konfirmasi di MetaMask…`, "info");
    const tx = await engine.createBatch(recipients, "Sidang Demo (Sepolia)", { value: parseEther(escrow) });
    log("Tx createBatch dikirim: " + txLink(tx.hash), "info");
    await tx.wait();
    lastBatchId = Number(await engine.nextBatchId()) - 1;
    log(`Escrow terkunci. batchId = ${lastBatchId}.`, "ok");
    ($("distBtn") as HTMLButtonElement).disabled = false;
  } catch (e: any) { log("Deposit gagal: " + (e.shortMessage || e.message), "err"); }
}

async function distribute() {
  if (lastBatchId === null) return;
  try {
    log("Operator menjalankan executeDistribution (server-signed)…", "info");
    const r = await post("/api/onchain/distribute", { batchId: lastBatchId, matrix: DEMO_MATRIX });
    log(`Distribusi selesai. gas = ${r.gasUsed}. Tx: ${txLink(r.txHash)}`, "ok");
    renderResults(r);
  } catch (e: any) { log("Distribusi gagal: " + e.message, "err"); }
}

function renderResults(r: any) {
  const ex = explorer();
  const sc = r.onChain?.scores ?? [];
  let html =
    `<div class="note"><b>Transparansi on-chain (NFR-01).</b> Bobot dihitung <i>off-chain</i> di ` +
    `middleware, sedangkan <b>perangkingan (TOPSIS) dan distribusi dieksekusi on-chain</b>. ` +
    `Nilai di bawah dibaca langsung dari <b>event kontrak</b> (<code>BatchDistributed</code> untuk skor, ` +
    `<code>RewardDistributed</code> untuk imbalan) pada transaksi <code>executeDistribution</code> --- ` +
    `tercatat permanen di blockchain dan dapat diaudit siapa pun, bukan angka dari server.` +
    (ex ? `<br><a href="${ex}/tx/${r.txHash}" target="_blank" rel="noopener">🔎 Verifikasi transaksi &amp; event di Etherscan</a> (gas ${r.gasUsed})` : "") +
    `</div>`;
  html += "<table><thead><tr><th>Reviewer</th><th>Alamat penerima</th><th>Skor TOPSIS<br>(on-chain)</th><th>ETH</th><th>Reputasi (SBT)</th></tr></thead><tbody>";
  for (let i = 0; i < DEMO_MATRIX.length; i++) {
    html +=
      `<tr><td>${DEMO_LABELS[i]}</td><td>${addrLink(recipients[i] || "-")}</td>` +
      `<td>${(sc[i] ?? 0).toFixed(4)}</td>` +
      `<td>${(r.onChain?.rewards?.[i] ?? 0).toFixed(4)}</td>` +
      `<td>${(r.onChain?.reputation?.[i] ?? 0).toFixed(4)}</td></tr>`;
  }
  html += "</tbody></table>";
  $("results").innerHTML = html;
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

// Baca & tampilkan seluruh riwayat distribusi dari on-chain.
async function loadHistory() {
  $("history").innerHTML = "Memuat dari blockchain…";
  try {
    const r = await (await fetch("/api/onchain/history")).json();
    if (!r.success) throw new Error(r.error || "gagal");
    if (!r.history.length) { $("history").innerHTML = "<i>Belum ada batch distribusi.</i>"; return; }
    const ex = explorer();
    let html = "";
    for (const b of r.history) {
      const badge = b.distributed
        ? '<span class="badge done">terdistribusi</span>'
        : '<span class="badge pending">belum</span>';
      html += `<div class="batch"><div class="bhead"><b>Batch #${b.batchId}</b> — ${escapeHtml(b.journalName || "(tanpa nama)")} ${badge}</div>`;
      html += `<div class="bmeta">Author: ${addrLink(b.author)} &middot; Escrow: <b>${b.escrow.toFixed(4)} ETH</b> &middot; Reviewer: ${b.reviewerCount}`;
      if (ex && b.createTx) html += ` &middot; <a href="${ex}/tx/${b.createTx}" target="_blank" rel="noopener">createBatch</a>`;
      if (ex && b.distributeTx) html += ` &middot; <a href="${ex}/tx/${b.distributeTx}" target="_blank" rel="noopener">executeDistribution</a>`;
      html += `</div>`;
      if (b.rewards && b.rewards.length) {
        html += `<table><thead><tr><th>#</th><th>Alamat penerima</th><th>Skor TOPSIS</th><th>ETH</th><th>Reputasi</th></tr></thead><tbody>`;
        b.rewards.forEach((rw: any, i: number) => {
          html += `<tr><td>${i + 1}</td><td>${addrLink(rw.reviewer)}</td><td>${(b.scores?.[i] ?? 0).toFixed(4)}</td><td>${rw.eth.toFixed(4)}</td><td>${rw.reputation.toFixed(4)}</td></tr>`;
        });
        html += `</tbody></table>`;
      }
      html += `</div>`;
    }
    $("history").innerHTML = html;
  } catch (e: any) { $("history").innerHTML = "Gagal memuat riwayat: " + e.message; }
}

window.addEventListener("DOMContentLoaded", () => {
  ($("connectBtn") as HTMLButtonElement).addEventListener("click", connect);
  ($("depositBtn") as HTMLButtonElement).addEventListener("click", deposit);
  ($("distBtn") as HTMLButtonElement).addEventListener("click", distribute);
  ($("historyBtn") as HTMLButtonElement).addEventListener("click", loadHistory);
  init();
});
