// Editor role: set the weight policy (BWM preset / manual + λ = editorial authority)
// and trigger on-chain distribution per batch (operator/server-signed). Also exposes
// full weighting transparency (BWM + Entropy-CRITIC breakdown) via the preview.
import { loadConfig, explorerFor, txLink, escapeHtml, postJson, DappConfig } from "./shared/dapp";

let cfg: DappConfig; let ex = "";
const $ = (id: string) => document.getElementById(id) as HTMLElement;
function log(m: string, c = "info") { const e = $("log"); e.innerHTML += `<div class="${c}">${m}</div>`; e.scrollTop = e.scrollHeight; }
const CRIT = ["q1 timeliness", "q2 relevansi", "q3 actionability", "q4 reputasi"];
const pct = (x: number) => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "–");
const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : "–");

async function init() {
  try {
    cfg = await loadConfig(); ex = explorerFor(cfg.chainId);
    $("cfg").innerHTML = `Network: <b>${cfg.network}</b> · Operator men-eksekusi distribusi (server-signed).`;
    // Preset BWM (strategi editorial) dari config.
    const sel = $("preset") as HTMLSelectElement;
    (cfg.bwmPresets || []).forEach((p) => { const o = document.createElement("option"); o.value = p.key; o.textContent = `${p.label} (Best ${p.best} / Worst ${p.worst})`; sel.appendChild(o); });
    if (sel.options.length) { sel.value = "balanced"; updatePresetInfo(); }
    try { await postJson("/api/onchain/attach", {}); } catch (e: any) { log("Attach operator: " + e.message, "warn"); }
    await Promise.all([refresh(), loadParams()]);
  } catch (e: any) { $("cfg").textContent = "Gagal memuat: " + e.message; }
}

function updatePresetInfo() {
  const key = ($("preset") as HTMLSelectElement).value;
  const p = (cfg.bwmPresets || []).find((x) => x.key === key);
  $("presetInfo").textContent = p ? p.interpretation : "";
}

async function loadParams() {
  try {
    const r = await (await fetch("/api/onchain/params")).json();
    if (!r.success) throw new Error(r.error || "gagal");
    const row = (k: string, v: any) => `<tr><td>${k}</td><td style="text-align:right"><b>${v}</b></td></tr>`;
    $("sysparams").innerHTML = "<table><tbody>" +
      row("Sigmoid k (steepness)", r.sigmoidK) +
      row("Sigmoid x₀ (titik infleksi)", r.sigmoidX0) +
      row("Fusi ECWM γ", r.gamma) +
      row("Peluruhan reputasi λ_decay (/hari)", r.decayRatePerDay) +
      (cfg.deadlineDays ? row("Deadline default (hari)", cfg.deadlineDays) : "") +
      "</tbody></table>";
  } catch (e: any) { $("sysparams").textContent = "Gagal memuat parameter: " + e.message; }
}

// Payload BWM: manual (lanjutan) jika diaktifkan, selain itu pakai preset terpilih.
function bwmPayload(): any {
  if (($("manualToggle") as HTMLInputElement)?.checked) {
    const nums = (id: string) => ($(id) as HTMLInputElement).value.split(",").map((s) => parseFloat(s.trim()));
    return { bwm: {
      bestIndex: parseInt(($("mBest") as HTMLSelectElement).value, 10),
      worstIndex: parseInt(($("mWorst") as HTMLSelectElement).value, 10),
      bestToOthers: nums("mB2O"), othersToWorst: nums("mO2W"),
    } };
  }
  return { preset: ($("preset") as HTMLSelectElement).value };
}

async function refresh() {
  $("list").innerHTML = "Memuat…";
  const [subsR, histR] = await Promise.all([
    (await fetch("/api/submissions")).json(),
    (await fetch("/api/onchain/history")).json().catch(() => ({ history: [] })),
  ]);
  const distributed: Record<number, any> = {};
  (histR.history || []).forEach((h: any) => { if (h.distributed) distributed[h.batchId] = h; });
  const subs = subsR.submissions || [];
  if (!subs.length) { $("list").innerHTML = "<i>Belum ada submisi. Author perlu mengajukan paper dulu.</i>"; return; }
  let html = "<table><thead><tr><th>Batch</th><th>Jurnal / Judul</th><th>Review masuk</th><th>Status</th><th>Aksi</th></tr></thead><tbody>";
  for (const s of subs) {
    const done = !!distributed[s.batchId];
    const ready = s.reviewCount > 0;
    html += `<tr><td>#${s.batchId}</td><td>${escapeHtml(s.journalName)}<br><span class="muted">${escapeHtml(s.paperTitle || "")}</span></td>` +
      `<td>${s.reviewCount} / ${s.total}</td>` +
      `<td>${done ? '<span class="badge done">terdistribusi</span>' : '<span class="badge pending">belum</span>'}</td>` +
      `<td><button data-id="${s.batchId}" class="prevbtn sec">Pratinjau</button> ` +
      `${done ? "" : `<button data-id="${s.batchId}" class="distbtn" ${ready ? "" : "disabled"}>Distribusi</button>`}</td></tr>`;
  }
  html += "</tbody></table>";
  $("list").innerHTML = html;
  document.querySelectorAll(".distbtn").forEach((b) => b.addEventListener("click", () => distribute(Number((b as HTMLElement).dataset.id))));
  document.querySelectorAll(".prevbtn").forEach((b) => b.addEventListener("click", () => preview(Number((b as HTMLElement).dataset.id))));
}

// Pratinjau off-chain: matriks QoS + transparansi bobot penuh (BWM subjektif +
// Entropy-CRITIC objektif + fusi λ) + skor TOPSIS. Memberi editor insight menyetel λ.
async function preview(batchId: number) {
  const box = $("preview");
  if (!box) { log("Panel pratinjau tidak tersedia di halaman.", "err"); return; }
  const lambda = parseFloat(($("lambda") as HTMLInputElement).value);
  box.innerHTML = `Menghitung pratinjau batch #${batchId} (λ=${lambda.toFixed(2)})…`;
  try {
    const r = await postJson("/api/preview-batch", { batchId, lambda, gamma: 0.5, ...bwmPayload() });
    const e = r.ecwm; const b = r.bwm;
    const lam = (r.recorded && typeof r.lambda === "number") ? r.lambda : lambda;
    const src = r.recorded ? "tercatat (actual)" : "simulasi (live)";
    let html = `<p class="muted">Batch #${batchId} · λ=${lam.toFixed(2)} · BWM=${r.preset || "manual"} (CR=${f3(b.consistencyRatio)}) · γ=${e.gamma} · ${src}</p>`;

    // Bobot per kriteria: BWM (subj), Entropy/CRITIC/ECWM (obj), Final. ▲ Best · ▽ Worst.
    html += "<table><thead><tr><th>Kriteria</th><th>BWM</th><th>Entropy</th><th>CRITIC</th><th>ECWM</th><th>Final</th></tr></thead><tbody>";
    CRIT.forEach((c, j) => {
      const mark = j === b.bestIndex ? " ▲" : (j === b.worstIndex ? " ▽" : "");
      html += `<tr><td>${c}${mark}</td><td>${pct(b.weights[j])}</td><td>${pct(e.entropy.weights[j])}</td>` +
        `<td>${pct(e.critic.weights[j])}</td><td>${pct(e.weights[j])}</td><td><b>${pct(r.weights[j])}</b></td></tr>`;
    });
    html += "</tbody></table>";

    // Matriks QoS per reviewer + skor TOPSIS.
    html += "<table style='margin-top:10px'><thead><tr><th>#</th><th>Reviewer</th><th>q1</th><th>q2</th><th>q3</th><th>q4</th><th>TOPSIS</th></tr></thead><tbody>";
    (r.reviewers || []).forEach((a: string, i: number) => {
      const m = r.matrix[i]; const flag = r.reviewed?.[i] ? "" : ' <span class="muted">(no-show)</span>';
      html += `<tr><td>${i + 1}</td><td>${a.slice(0, 10)}…${a.slice(-4)}${flag}</td>` +
        `<td>${m[0].toFixed(1)}</td><td>${m[1].toFixed(3)}</td><td>${m[2].toFixed(3)}</td><td>${m[3].toFixed(3)}</td>` +
        `<td><b>${(r.topsisScores?.[i] ?? 0).toFixed(4)}</b></td></tr>`;
    });
    html += "</tbody></table>";
    if (!r.topsisScores || !r.topsisScores.length) html += `<p class="muted">Skor TOPSIS butuh &ge;2 reviewer.</p>`;
    if ((r.reviewers || []).some((_: string, i: number) => r.reviewed && !r.reviewed[i]))
      html += `<p class="muted">Penelaah <i>no-show</i> dikecualikan dari escrow &amp; reputasi (0 ETH, 0 SBT) oleh <i>participation gate</i>; porsinya mengalir ke penelaah yang mengulas.</p>`;
    box.innerHTML = html;
  } catch (e: any) { box.innerHTML = "Gagal pratinjau: " + e.message; }
}

async function distribute(batchId: number) {
  const lambda = parseFloat(($("lambda") as HTMLInputElement).value);
  try {
    log(`Menjalankan distribusi batch #${batchId} (λ=${lambda})…`);
    const r = await postJson("/api/onchain/distribute-batch", { batchId, lambda, gamma: 0.5, ...bwmPayload() });
    log(`Batch #${batchId} terdistribusi. gas=${r.gasUsed}. Tx: ${txLink(ex, r.txHash)}`, "ok");
    let t = "<table><thead><tr><th>#</th><th>Reviewer</th><th>Skor TOPSIS</th><th>ETH</th><th>Reputasi</th></tr></thead><tbody>";
    (r.reviewers || []).forEach((rev: string, i: number) => {
      t += `<tr><td>${i + 1}</td><td>${rev.slice(0, 10)}…${rev.slice(-4)}</td><td>${(r.scores?.[i] ?? 0).toFixed(4)}</td><td>${(r.rewards?.[i] ?? 0).toFixed(5)}</td><td>${(r.reputation?.[i] ?? 0).toFixed(4)}</td></tr>`;
    });
    t += "</tbody></table>";
    log(t);
    await refresh();
  } catch (e: any) { log("Distribusi gagal: " + e.message, "err"); }
}

window.addEventListener("DOMContentLoaded", () => {
  ($("lambda") as HTMLInputElement).addEventListener("input", (e) => { $("lamVal").textContent = Number((e.target as HTMLInputElement).value).toFixed(2); });
  ($("refreshBtn") as HTMLButtonElement).addEventListener("click", refresh);
  ($("preset") as HTMLSelectElement).addEventListener("change", updatePresetInfo);
  ($("manualToggle") as HTMLInputElement).addEventListener("change", (e) => { $("manualBox").style.display = (e.target as HTMLInputElement).checked ? "block" : "none"; });
  init();
});
