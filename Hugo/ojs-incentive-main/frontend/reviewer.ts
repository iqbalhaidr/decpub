// Reviewer role: connect MetaMask (identity only), list papers where this address
// is a registered reviewer, read the abstract, submit a review. The AI scores
// (q2/q3) are computed server-side and intentionally NOT shown (anti-gaming).
import { loadConfig, connectAddress, escapeHtml, postJson, DappConfig } from "./shared/dapp";

let cfg: DappConfig; let account: string | null = null; let current: number | null = null;
const $ = (id: string) => document.getElementById(id) as HTMLElement;
function log(m: string, c = "info") { const e = $("log"); e.innerHTML += `<div class="${c}">${m}</div>`; e.scrollTop = e.scrollHeight; }

async function connect() {
  try {
    cfg = cfg || (await loadConfig());
    account = await connectAddress(cfg);
    $("acct").innerHTML = `Wallet: <b>${account}</b>`;
    log("Terhubung: " + account, "ok");
    await loadPapers();
  } catch (e: any) { log("Connect gagal: " + e.message, "err"); }
}
async function loadPapers() {
  if (!account) return;
  const r = await (await fetch("/api/reviews/pending?address=" + account)).json();
  if (!r.papers || !r.papers.length) { $("papers").innerHTML = "<i>Tidak ada paper yang ditugaskan ke alamat ini.</i>"; return; }
  let html = "<table><thead><tr><th>Batch</th><th>Jurnal</th><th>Judul</th><th>Status</th><th></th></tr></thead><tbody>";
  for (const p of r.papers) {
    html += `<tr><td>#${p.batchId}</td><td>${escapeHtml(p.journalName)}</td><td>${escapeHtml(p.paperTitle || "-")}</td>` +
      `<td>${p.done ? '<span class="badge done">sudah</span>' : '<span class="badge pending">belum</span>'}</td>` +
      `<td>${p.done ? "" : `<button data-id="${p.batchId}" class="rvbtn">Review</button>`}</td></tr>`;
  }
  html += "</tbody></table>";
  $("papers").innerHTML = html;
  document.querySelectorAll(".rvbtn").forEach((b) => b.addEventListener("click", () => openReview(Number((b as HTMLElement).dataset.id))));
}
async function openReview(batchId: number) {
  current = batchId;
  const r = await (await fetch("/api/submission?batchId=" + batchId)).json();
  if (!r.submission) { log("Paper tidak ditemukan.", "err"); return; }
  $("rvTitle").textContent = `Batch #${batchId} — ${r.submission.paperTitle || r.submission.journalName}`;
  $("rvAbstract").innerHTML = `<b>Abstrak:</b> ${escapeHtml(r.submission.paperText || "(tidak ada)")}`;
  $("reviewBox").style.display = "block";
  ($("reviewText") as HTMLTextAreaElement).value = "";
  ($("daysElapsed") as HTMLInputElement).value = "";
  $("reviewBox").scrollIntoView({ behavior: "smooth" });
}
async function submit() {
  if (current === null || !account) return;
  const reviewText = ($("reviewText") as HTMLTextAreaElement).value.trim();
  if (!reviewText) { log("Ulasan kosong.", "err"); return; }
  const daysRaw = ($("daysElapsed") as HTMLInputElement).value.trim();
  const daysElapsed = daysRaw === "" ? undefined : Number(daysRaw);
  try {
    await postJson("/api/review", { batchId: current, reviewer: account, reviewText, daysElapsed });
    log(`Ulasan untuk batch #${current} terkirim. Skor dievaluasi di belakang layar.`, "ok");
    $("reviewBox").style.display = "none";
    await loadPapers();
  } catch (e: any) { log("Kirim gagal: " + e.message, "err"); }
}
// Contoh ulasan bervariasi kualitas -> q2/q3 berbeda -> diferensiasi terlihat di demo.
const SAMPLE_REVIEWS: string[] = [
  "Pada Bagian 3.2, ukuran sampel n=10 terlalu kecil untuk uji entropy; pertimbangkan n>=30. Persamaan 4 kehilangan suku normalisasi. Sumbu Gambar 2 belum berlabel. Metodologi solid, tetapi baseline pembanding perlu ditambahkan agar klaim lebih kuat.",
  "Kontribusi utama menarik, namun klaim pada abstrak melebihi bukti yang disajikan. Tambahkan analisis sensitivitas terhadap parameter k, bandingkan dengan metode X (2022), dan perjelas kompleksitas algoritma pada Bagian 4.",
  "Paper cukup jelas. Terdapat beberapa typo di Bagian 2. Sebaiknya tambahkan penjelasan notasi pada Persamaan 5 dan satu contoh numerik agar lebih mudah diikuti.",
  "Struktur tulisan rapi, tetapi related work kurang mutakhir. Tambahkan pembahasan keterbatasan dan ancaman validitas. Hasil eksperimen sebaiknya disertai interval kepercayaan.",
  "Paper ini cukup baik dan layak diterbitkan.",
  "Menurut saya oke, tidak ada masalah besar.",
];
function fillRandom() {
  const t = SAMPLE_REVIEWS[Math.floor(Math.random() * SAMPLE_REVIEWS.length)];
  ($("reviewText") as HTMLTextAreaElement).value = t;
}

async function init() {
  try {
    cfg = await loadConfig();
    const sel = $("actAs") as HTMLSelectElement;
    (cfg.demoReviewers || []).forEach((a) => { const o = document.createElement("option"); o.value = a; o.textContent = a; sel.appendChild(o); });
    if (cfg.deadlineDays) $("deadlineNote").textContent = `Deadline default: ${cfg.deadlineDays} hari.`;
  } catch (e: any) { log("Gagal memuat config: " + e.message, "err"); }
}
function actAs(addr: string) {
  if (!addr) return;
  account = addr;
  $("acct").innerHTML = `Reviewer (demo): <b>${addr}</b>`;
  log("Bertindak sebagai reviewer demo: " + addr, "ok");
  loadPapers();
}
window.addEventListener("DOMContentLoaded", () => {
  ($("connectBtn") as HTMLButtonElement).addEventListener("click", connect);
  ($("submitBtn") as HTMLButtonElement).addEventListener("click", submit);
  ($("randomBtn") as HTMLButtonElement).addEventListener("click", fillRandom);
  ($("actAs") as HTMLSelectElement).addEventListener("change", (e) => actAs((e.target as HTMLSelectElement).value));
  init();
});
