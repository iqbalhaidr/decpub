/**
 * QoS (q1-q4) untuk insentif. Antarmuka `QoSProvider` sama dengan Hugo (`middleware/qos/types.ts:25-32`),
 * tidak diubah, sehingga `LocalModelProvider` Hugo (model bahasa) bisa dipasang kemudian tanpa mengubah
 * pemanggil.
 *
 *   q1 kecepatan   REAL     dari timestamp on-chain (dihitung server, bukan di sini)
 *   q2 relevansi   SIMULASI kosinus frekuensi kata antara teks telaah dan abstrak naskah anonim
 *   q3 actionability SIMULASI proporsi kalimat yang memuat saran atau rujukan lokasi
 *   q4 reputasi    saldo REAL, bukti SIMULASI; tingkat 0..4 (`reputationTier` di @decpub/shared)
 *
 * `SimulatedQoSProvider` = `HeuristicProvider` Hugo (deterministik, tanpa jaringan dan tanpa model) ditambah
 * penanda bahasa Indonesia (keputusan D4). Tanpa penanda itu, ulasan berbahasa Indonesia mendapat q3 = 0
 * karena regex Hugo hanya mengenal kata Inggris. Ini BUKAN model bahasa, dan label itu dicatat di laporan QoS.
 */

export interface QoSProvider {
  readonly name: string;
  /** q2: relevansi teks telaah terhadap naskah, di [0,1]. */
  relevance(reviewText: string, paperText: string): Promise<number>;
  /** q3: proporsi kalimat yang konkret dan dapat ditindaklanjuti, di [0,1]. */
  actionability(reviewText: string): Promise<number>;
}

const STOPWORDS = new Set([
  // Inggris (dari Hugo)
  "the", "a", "an", "is", "are", "of", "to", "and", "in", "on", "for", "this", "that", "it", "be", "as", "with",
  "by", "or", "at", "from", "but", "not",
  // Indonesia
  "yang", "dan", "di", "ke", "dari", "ini", "itu", "dengan", "untuk", "pada", "adalah", "atau", "dalam", "juga",
  "akan", "sudah", "belum", "karena", "oleh", "agar", "serta", "sebagai", "para", "bisa", "dapat", "telah", "lebih",
  "namun", "tetapi", "tidak", "ada", "saya", "kami", "kita", "mereka", "hal", "secara", "setelah", "sebelum",
]);

const ACTION_MARKERS_EN =
  "should|consider|recommend|suggest|add|revise|clarify|provide|include|fix|improve|missing|increase|reduce|replace|specify|define|expand|remove|rephrase|justify|address|correct";
// Penanda saran dalam bahasa Indonesia (kata dasar dan bentuk imperatif umum dalam telaah).
const ACTION_MARKERS_ID =
  "sebaiknya|disarankan|saran|menyarankan|perlu|harus|hendaknya|tambahkan|menambahkan|perbaiki|memperbaiki|jelaskan|menjelaskan|" +
  "sertakan|menyertakan|ganti|mengganti|hapus|menghapus|ringkas|perjelas|memperjelas|lengkapi|melengkapi|pertimbangkan|" +
  "mempertimbangkan|sebutkan|rinci|merinci|bandingkan|membandingkan|tinjau|ulangi|revisi|merevisi|kurang|belum\\s+ada|tidak\\s+ada";

const ACTION_MARKERS = new RegExp(`\\b(${ACTION_MARKERS_EN}|${ACTION_MARKERS_ID})\\b`, "i");
const REFERENCE_MARKERS = /\b(section|sec|figure|fig|table|tab|equation|eq|line|page|paragraph|bagian|bab|gambar|tabel|persamaan|baris|halaman|paragraf|subbab)s?\.?\s*\d/i;

export class SimulatedQoSProvider implements QoSProvider {
  readonly name = "simulated-qos (heuristik deterministik, tanpa model bahasa) [SIMULASI]";

  async relevance(reviewText: string, paperText: string): Promise<number> {
    return cosineTF(termFreq(reviewText), termFreq(paperText));
  }

  async actionability(reviewText: string): Promise<number> {
    const sentences = splitSentences(reviewText);
    if (sentences.length === 0) return 0;
    return sentences.filter((s) => ACTION_MARKERS.test(s) || REFERENCE_MARKERS.test(s)).length / sentences.length;
  }
}

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z]+/g);
  if (!matches) return [];
  return matches.filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function termFreq(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokenize(text)) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function cosineTF(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (w) dot += v * w;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
