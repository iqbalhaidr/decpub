/**
 * Lapisan SQLite tipis di atas `node:sqlite` (bawaan Node, tanpa dependensi native).
 * Repositori memakai kelas ini dan tidak menyentuh `DatabaseSync` langsung, sehingga
 * mengganti ke `better-sqlite3` atau Postgres hanya mengubah file ini.
 */
import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { MIGRATIONS } from "./migrations.js";

export type Row = Record<string, unknown>;
export type Param = SQLInputValue;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly db: DatabaseSync;

  /** `path` boleh ":memory:" (tes). */
  constructor(@Inject(APP_CONFIG) config: Pick<AppConfig, "dbPath">) {
    if (config.dbPath !== ":memory:") mkdirSync(dirname(config.dbPath), { recursive: true });
    this.db = new DatabaseSync(config.dbPath);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  run(sql: string, ...params: Param[]): { changes: number; lastInsertRowid: number } {
    const r = this.db.prepare(sql).run(...params);
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }

  get<T extends Row = Row>(sql: string, ...params: Param[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  all<T extends Row = Row>(sql: string, ...params: Param[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  /** Menjalankan `fn` dalam satu transaksi; rollback bila melempar. */
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  private migrate(): void {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    const done = new Set(this.all<{ version: number }>("SELECT version FROM schema_migrations").map((r) => r.version));
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      this.transaction(() => {
        this.db.exec(m.sql);
        this.run("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", m.version, new Date().toISOString());
      });
    }
  }

  onModuleDestroy(): void {
    this.db.close();
  }
}
