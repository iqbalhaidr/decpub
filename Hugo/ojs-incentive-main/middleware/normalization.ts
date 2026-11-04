/**
 * Min-Max Linear Normalization (Fase 1)
 *
 * Thesis ref: III.2.3.1 — Keputusan Teknis: Normalisasi Linear
 *
 * Benefit criteria: r_ij = (x_ij - x_min) / (x_max - x_min)
 * Cost criteria:    r_ij = (x_max - x_ij) / (x_max - x_min)
 *
 * Output range: [0, 1] where 1 = best in batch, 0 = worst in batch
 */

export type CriterionType = "benefit" | "cost";

/**
 * Normalize a decision matrix using min-max linear scaling.
 *
 * @param matrix - n×m matrix where matrix[i][j] = raw value of alternative i on criterion j
 * @param types  - array of m criterion types ("benefit" | "cost")
 * @returns normalized n×m matrix with values in [0, 1]
 */
export function normalize(
  matrix: number[][],
  types: CriterionType[]
): number[][] {
  const n = matrix.length;
  if (n === 0) return [];
  const m = matrix[0].length;

  if (types.length !== m) {
    throw new Error(`Expected ${m} criterion types, got ${types.length}`);
  }

  // Compute min/max per criterion (column)
  const mins: number[] = new Array(m);
  const maxs: number[] = new Array(m);
  for (let j = 0; j < m; j++) {
    mins[j] = matrix[0][j];
    maxs[j] = matrix[0][j];
    for (let i = 1; i < n; i++) {
      if (matrix[i][j] < mins[j]) mins[j] = matrix[i][j];
      if (matrix[i][j] > maxs[j]) maxs[j] = matrix[i][j];
    }
  }

  // Normalize
  const result: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = new Array(m);
    for (let j = 0; j < m; j++) {
      const range = maxs[j] - mins[j];
      if (range === 0) {
        // All alternatives have the same value — assign 0.5 (neutral)
        row[j] = 0.5;
      } else if (types[j] === "benefit") {
        row[j] = (matrix[i][j] - mins[j]) / range;
      } else {
        // cost: invert direction
        row[j] = (maxs[j] - matrix[i][j]) / range;
      }
    }
    result.push(row);
  }

  return result;
}
