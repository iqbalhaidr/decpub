/**
 * Data awal demo: kategori, jurnal, dan akun contoh. Idempoten: tidak menimpa akun atau
 * kebijakan yang sudah ada. Akun seed memakai password publik di README dan HANYA untuk
 * demo lokal (`SEED_DEMO_ACCOUNTS`, bawaan menyala hanya di jaringan lokal).
 *
 * Katalog dan editor mengikuti Roihan (`013_journals.up.sql`). Wallet seed penelaah milik
 * pengembang Roihan (`008_seed_reviewers.up.sql`) TIDAK dipakai: akun di sini tanpa wallet,
 * identitasnya didaftarkan oleh pemiliknya (atau skrip demo) lewat `POST /me/identity`.
 */
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { FIELD_SLUGS } from "@decpub/shared";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { hashPassword } from "../auth/password.js";
import type { AccountRole } from "../common/auth.js";
import { JournalsRepository, DEFAULT_WEIGHT_POLICY, type WeightPolicy } from "../journals/journals.repository.js";
import { UsersRepository } from "../users/users.repository.js";

export const CATEGORY_LABELS: Record<string, string> = {
  ai: "AI",
  "computer-security": "Computer Security",
  blockchain: "Blockchain",
  "cloud-computing": "Cloud Computing",
  "data-science": "Data Science",
};

/** APC 0,01 ETH (keputusan D6). */
export const APC_WEI = "10000000000000000";

const JOURNALS: { name: string; category: string; policy?: WeightPolicy }[] = [
  { name: "Journal of Applied AI", category: "ai" },
  { name: "Journal of Machine Intelligence", category: "ai", policy: { preset: "Actionability-First", lambda: 0.6 } },
  { name: "Journal of Blockchain Systems", category: "blockchain" },
  { name: "Ledger and Trust Review", category: "blockchain" },
  { name: "Journal of Computer Security", category: "computer-security" },
  { name: "Cloud Infrastructure Journal", category: "cloud-computing" },
  { name: "Journal of Data Science", category: "data-science" },
];

export interface SeedAccount {
  email: string;
  password: string;
  role: AccountRole;
  fields?: string[];
}

const ALL = [...FIELD_SLUGS];

export const DEMO_ACCOUNTS: SeedAccount[] = [
  { email: "admin@desci.local", password: "admin123", role: "admin" },
  { email: "editor@desci.local", password: "editor123", role: "editor", fields: ALL },
  { email: "editor.ai@desci.local", password: "editor123", role: "editor", fields: ["ai"] },
  { email: "editor.chain@desci.local", password: "editor123", role: "editor", fields: ["blockchain", "computer-security"] },
  { email: "editor.data@desci.local", password: "editor123", role: "editor", fields: ["data-science", "cloud-computing"] },
  ...[1, 2, 3, 4, 5, 6].map((i): SeedAccount => ({ email: `rev${i}@mail.com`, password: `rev${i}`, role: "reviewer", fields: ALL })),
  ...[1, 2, 3].map((i): SeedAccount => ({ email: `author${i}@mail.com`, password: `author${i}`, role: "author" })),
];

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly log = new Logger(SeedService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly users: UsersRepository,
    private readonly journals: JournalsRepository,
  ) {}

  onModuleInit(): void {
    // Katalog selalu ada; akun demo hanya bila diminta.
    this.seedCatalog();
    if (this.config.seedDemoAccounts) this.seedAccounts();
  }

  seedCatalog(): void {
    for (const [slug, label] of Object.entries(CATEGORY_LABELS)) this.journals.upsertCategory(slug, label);
    for (const j of JOURNALS) {
      this.journals.insertIfAbsent({
        name: j.name,
        categorySlug: j.category,
        apcWei: APC_WEI,
        weightPolicy: j.policy ?? DEFAULT_WEIGHT_POLICY,
      });
    }
  }

  seedAccounts(): void {
    let created = 0;
    for (const a of DEMO_ACCOUNTS) {
      if (this.users.findByEmail(a.email)) continue;
      this.users.create({
        email: a.email,
        passwordHash: hashPassword(a.password),
        role: a.role,
        specialities: a.role === "reviewer" ? a.fields : [],
        verifiedFields: a.fields,
      });
      created++;
    }
    if (created) this.log.log(`${created} akun demo dibuat (password publik, hanya untuk demo lokal)`);
  }
}
