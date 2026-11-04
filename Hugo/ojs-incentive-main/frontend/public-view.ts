// Public role: read-only transparency view. Merges on-chain history (scores,
// rewards, tx) with off-chain submission titles, plus current SBT balances.
import { loadConfig, explorerFor, txLink, addrLink, escapeHtml, postJson, DappConfig } from "./shared/dapp";

let cfg: DappConfig; let ex = "";
const $ = (id: string) => document.getElementById(id) as HTMLElement;

// Waktu distribusi (block timestamp, ms) -> string lokal ringkas.
function fmtWhen(ms: number | null | undefined): string {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString("id-ID", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

async function init() {
  try {
    cfg = await loadConfig(); ex = explorerFor(cfg.chainId);
    try { await postJson("/api/onchain/attach", {}); } catch {}
    await load();
  } catch (e: any) { $("batches").textContent = "Gagal memuat: " + e.message; }
}

async function load() {
  $("batches").innerHTML = "Memuat…"; $("reps").innerHTML = "Memuat…";
  const [histR, subsR] = await Promise.all([
    (await fetch("/api/onchain/history")).json(),
    (await fetch("/api/submissions")).json().catch(() => ({ submissions: [] })),
  ]);
  const titleById: Record<number, string> = {};
  (subsR.submissions || []).forEach((s: any) => { titleById[s.batchId] = s.paperTitle || ""; });
  const hist = histR.history || [];

  // ---- Batches (accordion: user memilih batch mana yang dibuka) ----
  if (!hist.length) { $("batches").innerHTML = "<i>Belum ada batch.</i>"; }
  else {
    // Terbaru di atas agar batch relevan mudah ditemukan.
    const ordered = [...hist].sort((a: any, b: any) => b.batchId - a.batchId);
    let html = "";
    for (const b of ordered) {
      const badge = b.distributed ? '<span class="badge done">terdistribusi</span>' : '<span class="badge pending">belum</span>';
      const when = b.distributed && b.distributedAt ? ` · <span class="muted">${fmtWhen(b.distributedAt)}</span>` : "";
      html += `<details class="panel" style="margin:8px 0"><summary style="cursor:pointer">` +
        `<b>Batch #${b.batchId}</b> — ${escapeHtml(b.journalName || "-")} ${badge}${when}</summary>`;
      html += `<div class="muted" style="margin-top:6px">${escapeHtml(titleById[b.batchId] || "")}` +
        ` · Escrow ${b.escrow.toFixed(4)} ETH · Author ${addrLink(ex, b.author)}` +
        (b.distributeTx ? ` · ${txLink(ex, b.distributeTx)}` : "") + `</div>`;
      if (b.rewards && b.rewards.length) {
        html += "<table><thead><tr><th>#</th><th>Reviewer</th><th>Skor TOPSIS</th><th>ETH</th><th>Reputasi</th></tr></thead><tbody>";
        b.rewards.forEach((rw: any, i: number) => {
          html += `<tr><td>${i + 1}</td><td>${addrLink(ex, rw.reviewer)}</td><td>${(b.scores?.[i] ?? 0).toFixed(4)}</td><td>${rw.eth.toFixed(5)}</td><td>${rw.reputation.toFixed(4)}</td></tr>`;
        });
        html += "</tbody></table>";
      } else {
        html += `<div class="muted" style="margin-top:6px"><i>Belum ada distribusi imbalan pada batch ini.</i></div>`;
      }
      html += "</details>";
    }
    $("batches").innerHTML = html;
  }

  // ---- Reviewer reputation (aggregate unique addresses) ----
  const addrs = Array.from(new Set(hist.flatMap((b: any) => (b.rewards || []).map((r: any) => r.reviewer))));
  if (!addrs.length) { $("reps").innerHTML = "<i>Belum ada reviewer yang menerima reputasi.</i>"; return; }
  try {
    const rep = await postJson("/api/onchain/reputation", { addresses: addrs });
    const list = (rep.addresses || addrs).map((a: string, i: number) => ({
      addr: a,
      effective: Number(rep.effective?.[i] ?? 0),
      raw: Number(rep.raw?.[i] ?? 0),
    }));
    repData = list;
    renderReps();
  } catch (e: any) { $("reps").innerHTML = "Gagal memuat reputasi: " + e.message; }
}

// State sortir tabel reputasi (default: SBT efektif menurun = peringkat teratas).
type RepRow = { addr: string; effective: number; raw: number };
let repData: RepRow[] = [];
let repSort: { key: "effective" | "raw"; dir: 1 | -1 } = { key: "effective", dir: -1 };

function sortReps(key: "effective" | "raw") {
  if (repSort.key === key) repSort.dir = (repSort.dir === 1 ? -1 : 1);
  else repSort = { key, dir: -1 };
  renderReps();
}
(window as any).sortReps = sortReps;

function renderReps() {
  const rows = [...repData].sort((a, b) => (a[repSort.key] - b[repSort.key]) * repSort.dir);
  const caret = (k: string) => repSort.key === k ? (repSort.dir === -1 ? " ▼" : " ▲") : "";
  let t = "<table><thead><tr><th>#</th><th>Reviewer</th>" +
    `<th style="cursor:pointer" onclick="sortReps('effective')">SBT efektif (setelah decay)${caret("effective")}</th>` +
    `<th style="cursor:pointer" onclick="sortReps('raw')">SBT mentah${caret("raw")}</th>` +
    "</tr></thead><tbody>";
  rows.forEach((r, i) => {
    t += `<tr><td>${i + 1}</td><td>${addrLink(ex, r.addr)}</td><td>${r.effective.toFixed(4)}</td><td>${r.raw.toFixed(4)}</td></tr>`;
  });
  t += "</tbody></table>";
  $("reps").innerHTML = t;
}

window.addEventListener("DOMContentLoaded", () => {
  ($("refreshBtn") as HTMLButtonElement).addEventListener("click", load);
  init();
});
