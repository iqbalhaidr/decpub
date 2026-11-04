// Author role: connect MetaMask, upload PDF (abstract extracted server-side for q2),
// set reviewer addresses + escrow, then createBatch (atomic, MetaMask-signed) and
// persist the paper to the server store so reviewers can review it.
import { parseEther, BrowserProvider, Contract } from "ethers";
import { loadConfig, connectAddress, explorerFor, txLink, postJson, DappConfig } from "./shared/dapp";

let cfg: DappConfig; let account: string | null = null; let ex = "";
let paperAbstract = ""; let paperTitle = "";

const $ = (id: string) => document.getElementById(id) as HTMLElement;
function log(m: string, c = "info") { const e = $("log"); e.innerHTML += `<div class="${c}">${m}</div>`; e.scrollTop = e.scrollHeight; }

async function init() {
  try {
    cfg = await loadConfig(); ex = explorerFor(cfg.chainId);
    $("cfg").innerHTML = `Network: <b>${cfg.network}</b> · IncentiveEngine: ${cfg.incentiveEngine ? "<code>" + cfg.incentiveEngine.slice(0, 12) + "…</code>" : "<i>belum ter-deploy</i>"}`;
    const ta = $("reviewers") as HTMLTextAreaElement;
    if (cfg.demoReviewers && cfg.demoReviewers.length && !ta.value.trim()) ta.value = cfg.demoReviewers.join("\n");
  } catch (e: any) { $("cfg").textContent = "Gagal memuat config: " + e.message; }
}
async function connect() {
  try { account = await connectAddress(cfg); $("acct").innerHTML = `Wallet: <b>${account}</b>`; log("Terhubung: " + account, "ok"); }
  catch (e: any) { log("Connect gagal: " + e.message, "err"); }
}
async function onPdf() {
  const f = ($("pdf") as HTMLInputElement).files?.[0]; if (!f) return;
  log("Membaca PDF…");
  try {
    const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
    const r = await postJson("/api/paper", { pdfBase64: b64 });
    paperAbstract = r.abstract || ""; paperTitle = r.title || f.name;
    $("paperInfo").innerHTML = `<b>Judul:</b> ${paperTitle}<br><b>Abstrak (${paperAbstract.length} char, dipakai untuk relevansi q2):</b> ${(paperAbstract || "").slice(0, 240)}…`;
    log("PDF terbaca, abstrak diekstrak.", "ok");
  } catch (e: any) { log("Baca PDF gagal: " + e.message, "err"); }
}
async function submit() {
  if (!account) { log("Connect MetaMask dulu.", "err"); return; }
  if (!cfg.incentiveEngine) { log("Kontrak belum ter-deploy.", "err"); return; }
  const journal = ($("journal") as HTMLInputElement).value || "(tanpa nama)";
  const escrow = ($("escrow") as HTMLInputElement).value || "0.01";
  const reviewers = ($("reviewers") as HTMLTextAreaElement).value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (reviewers.length < 1 || reviewers.length > 10) { log("Reviewer harus 1–10 alamat.", "err"); return; }
  if (!paperAbstract) { log("Unggah PDF dulu (abstrak diperlukan untuk q2).", "warn"); }
  try {
    const provider = new BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const engine = new Contract(cfg.incentiveEngine, cfg.engineAbi, signer);
    log(`createBatch: ${reviewers.length} reviewer, escrow ${escrow} ETH — konfirmasi di MetaMask…`);
    const tx = await engine.createBatch(reviewers, journal, { value: parseEther(escrow) });
    log("Tx dikirim: " + txLink(ex, tx.hash));
    await tx.wait();
    const batchId = Number(await engine.nextBatchId()) - 1;
    await postJson("/api/submission", { batchId, journalName: journal, paperTitle, paperText: paperAbstract, reviewers });
    log(`Sukses! Batch #${batchId} dibuat, escrow ${escrow} ETH terkunci. Reviewer terdaftar kini bisa mereview.`, "ok");
  } catch (e: any) { log("Submit gagal: " + (e.shortMessage || e.message), "err"); }
}
window.addEventListener("DOMContentLoaded", () => {
  ($("connectBtn") as HTMLButtonElement).addEventListener("click", connect);
  ($("pdf") as HTMLInputElement).addEventListener("change", onPdf);
  ($("submitBtn") as HTMLButtonElement).addEventListener("click", submit);
  init();
});
