import { Injectable } from "@nestjs/common";
import { DatabaseService, type Row } from "../db/database.service.js";

/**
 * Kebijakan bobot insentif per jurnal (keputusan D1). Dipakai M7; dikunci saat sesi dibuat.
 * `preset` adalah nama preset BWM Hugo, `lambda` bobot subjektif pada fusi (W = λ·Wsub + (1-λ)·Wobj).
 */
export interface WeightPolicy {
  preset: string;
  lambda: number;
}

export const WEIGHT_PRESETS = ["Balanced", "Actionability-First", "Speed-First", "Relevance-First", "Reputation-First"] as const;
export const DEFAULT_WEIGHT_POLICY: WeightPolicy = { preset: "Balanced", lambda: 0.6 };

export interface Journal {
  id: number;
  name: string;
  categorySlug: string;
  categoryLabel: string;
  /** APC dalam wei (string agar tidak kehilangan presisi). */
  apcWei: string;
  weightPolicy: WeightPolicy;
}

export interface Category {
  slug: string;
  label: string;
}

const SELECT = `SELECT j.id, j.name, j.category_slug, c.label AS category_label, j.apc_wei, j.weight_policy
                FROM journals j JOIN categories c ON c.slug = j.category_slug`;

const fromRow = (r: Row): Journal => ({
  id: r.id as number,
  name: r.name as string,
  categorySlug: r.category_slug as string,
  categoryLabel: r.category_label as string,
  apcWei: r.apc_wei as string,
  weightPolicy: JSON.parse(r.weight_policy as string),
});

@Injectable()
export class JournalsRepository {
  constructor(private readonly db: DatabaseService) {}

  list(): Journal[] {
    return this.db.all(`${SELECT} ORDER BY c.label, j.name`).map(fromRow);
  }

  get(id: number): Journal | undefined {
    const r = this.db.get(`${SELECT} WHERE j.id = ?`, id);
    return r && fromRow(r);
  }

  categories(): Category[] {
    return this.db.all("SELECT slug, label FROM categories ORDER BY label") as unknown as Category[];
  }

  upsertCategory(slug: string, label: string): void {
    this.db.run(
      "INSERT INTO categories (slug, label) VALUES (?, ?) ON CONFLICT(slug) DO UPDATE SET label = excluded.label",
      slug,
      label,
    );
  }

  /** Menambah jurnal bila belum ada (kunci: nama). Tidak menimpa kebijakan yang sudah diubah admin. */
  insertIfAbsent(j: { name: string; categorySlug: string; apcWei: string; weightPolicy: WeightPolicy }): void {
    this.db.run(
      `INSERT INTO journals (name, category_slug, apc_wei, weight_policy, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(name) DO NOTHING`,
      j.name,
      j.categorySlug,
      j.apcWei,
      JSON.stringify(j.weightPolicy),
      new Date().toISOString(),
    );
  }

  setWeightPolicy(id: number, policy: WeightPolicy): void {
    this.db.run("UPDATE journals SET weight_policy = ? WHERE id = ?", JSON.stringify(policy), id);
  }
}
