/**
 * Data benchmark skripsi Hugo (Bab IV), disalin dari `frontend/config/eval-datasets.ts`.
 * q1 = hari (cost), q2 relevansi dan q3 actionability di [0,1], q4 = saldo SBT.
 * q2/q3 berasal dari ulasan nyata PeerRead (ICLR 2017). JANGAN diubah tangan.
 */
export type Matrix = number[][];

/** D1: contoh kerja, n = 5. Dipakai Lampiran A dan B. */
export const D1: Matrix = [[2,0.71,0.55,110],[3,0.82,0.33,95],[4,0.5,0.2,80],[5,0.59,0.64,70],[7,0.68,0.41,45]];
export const D1_LABELS = ["R1", "R2", "R3", "R4", "R5"];
/** D2: free-riding, n = 8. */
export const D2: Matrix = [[3,0.76,0.67,100],[4,0.75,0.58,95],[3,0.71,0.7,90],[4,0.67,0.43,80],[3,0.66,0.42,75],[4,0.67,0.4,70],[2,0.5,0.13,40],[3,0.56,0.15,35]];
/** D3: Sybil, n = 8. */
export const D3: Matrix = [[3,0.71,0.56,95],[3,0.76,0.63,90],[4,0.8,0.6,85],[3,0.68,0.42,92],[4,0.64,0.46,80],[4,0.56,0.17,0],[4,0.46,0.1,0],[4,0.53,0.2,0]];
