/**
 * Konteks bersama skenario S1-S6 (M12). Skenario berbicara dengan sistem seperti browser: lewat HTTP (`Api`, `Member`) dan
 * `packages/shared`, ditambah pembacaan chain publik untuk memeriksa hasil. Konteks ini juga mengumpulkan semua nilai
 * pribadi yang lahir selama demo, sebagai masukan `audit-anonymity`.
 */
import { createHash } from "node:crypto";
import { createPublicClient, defineChain, getContract, http, type Address, type Hex, type PublicClient } from "viem";
import {
  DOITokenAbi,
  EscrowPoolAbi,
  HttpStorageProvider,
  IncentiveEngineAbi,
  PublicationRecordsAbi,
  Recommendation,
  ReputationSBTAbi,
  Role,
  ZkProveError,
  deriveEphemeral,
  identityCommitment,
  noteCommitment,
  permanentAccountAddress,
  reputationId,
  type RecommendationValue,
  type RoleValue,
} from "@decpub/shared";
import { contractAddress, type Deployments } from "@decpub/shared/node";
import type { AuditInput } from "../audit-anonymity.ts";
import { Api, ApiError } from "../lib/api.ts";
import { ClientChain } from "../lib/client-chain.ts";
import { auditTrail, findEditorSeat, findReviewerSeats, statusPath, type Seat, type TrailEntry } from "../lib/flow.ts";
import { Member } from "../lib/member.ts";

export const DAY = 86_400;
export const eqHex = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export const sha256 = (b: Uint8Array) => `0x${createHash("sha256").update(b).digest("hex")}` as Hex;
export const eth = (v: bigint) => (Number(v) / 1e18).toFixed(6);
export const ipfsCid = (uri: string) => uri.replace("ipfs://", "");

export const ABSTRACT = "Penelitian ini mengusulkan mekanisme telaah buta ganda berbasis blockchain dengan skema commit reveal untuk mengurangi bias identitas pada publikasi ilmiah.";

/** Persona penelaah: kualitas (isi) dan kecepatan (jeda commit). Dipakai skenario yang memeriksa urutan imbalan. */
export const PERSONA = [
  { name: "R1 (baik, cepat)", delayDays: 0, text: "Bagian 3 belum menjelaskan skema commit reveal secara rinci. Sebaiknya tambahkan perbandingan dengan telaah buta ganda konvensional pada Tabel 2. Perlu diperjelas definisi bias identitas di halaman 4. Tambahkan analisis ancaman pada mekanisme blockchain." },
  { name: "R2 (sedang)", delayDays: 1, text: "Skema commit reveal dan telaah buta ganda perlu dijelaskan lebih rinci. Sebaiknya tambahkan evaluasi bias identitas pada publikasi ilmiah. Bagian penutup sudah baik." },
  { name: "R3 (generik, lambat)", delayDays: 5, text: "Naskah ini bagus. Saya suka topiknya. Semoga berhasil dan terus berkarya." },
];

export interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

export interface SessionRecord {
  label: string;
  sessionId: Hex;
  /** Jejak status dari event on-chain, dengan hash transaksi tiap perubahan. */
  transitions: { status: string; txHash: Hex; block: number }[];
  events: number;
  finalStatus: string;
  doi: string | null;
  links: { label: string; url: string }[];
}

/** Catatan satu skenario: pemeriksaan, sesi, transaksi penting, dan tautan untuk laporan. */
export class ScenarioLog {
  readonly checks: Check[] = [];
  readonly sessions: { label: string; sessionId: Hex }[] = [];
  records: SessionRecord[] = [];
  readonly txs: { label: string; hash: string }[] = [];
  readonly notes: string[] = [];
  error: string | null = null;
  ms = 0;

  constructor(
    readonly id: string,
    readonly title: string,
    readonly proves: string,
  ) {}

  check(label: string, ok: boolean, detail = "") {
    this.checks.push({ label, ok, detail });
    console.log(`${ok ? "OK   " : "GAGAL"} [${this.id}] ${label}${detail ? `  (${detail})` : ""}`);
  }

  /** Aksi harus ditolak, dan penolakannya harus sesuai `test`. */
  async rejected(label: string, fn: () => Promise<unknown>, test: (e: ApiError | ZkProveError) => boolean) {
    try {
      await fn();
      this.check(label, false, "seharusnya ditolak, tetapi berhasil");
    } catch (e) {
      if (!(e instanceof ApiError) && !(e instanceof ZkProveError)) return this.check(label, false, `galat tak terduga: ${(e as Error).message}`);
      const what = e instanceof ApiError ? `${e.status} ${(e.body as { error?: string })?.error ?? e.revert ?? ""}`.trim() : `zk-sim ${e.code}`;
      this.check(label, test(e), `ditolak: ${what}`);
    }
  }

  session(label: string, sessionId: Hex) {
    this.sessions.push({ label, sessionId });
  }

  tx(label: string, hash: string) {
    this.txs.push({ label, hash });
  }

  note(text: string) {
    this.notes.push(text);
    console.log(`     [${this.id}] ${text}`);
  }

  get failed() {
    return this.error !== null || this.checks.some((c) => !c.ok);
  }
}

export const apiError = (e: ApiError | ZkProveError) => (e instanceof ApiError ? (e.body as { error?: string })?.error : undefined);

export interface Identity {
  name: string;
  email: string;
  affiliation: string;
}

export interface Author {
  m: Member;
  who: Identity;
  form: (title: string) => { journalId: number; title: string; abstract: string; keywords: string; authorName: string; authorEmail: string; affiliation: string };
}

export interface ContextOptions {
  urls: { storage: string; zk: string; server: string; web: string };
  rpcUrl: string;
  deployments: Deployments;
}

export class Context {
  readonly api: Api;
  readonly storage: HttpStorageProvider;
  readonly client: PublicClient;
  readonly engine;
  readonly pool;
  readonly sbt;
  readonly records;
  readonly doi;
  /** Isi semua permintaan klien, untuk memeriksa apa yang benar-benar dikirim ke server. */
  readonly sent: { path: string; body: string }[] = [];

  admin!: Member;
  editors: Member[] = [];
  /** Akun penelaah seed yang sudah login; hanya yang identitasnya terdaftar menjadi kandidat seleksi. */
  private readonly reviewerPool: Member[] = [];
  private readonly registered = new Set<Member>();
  private readonly passwords = new Map<Member, string>();
  private cc!: ClientChain;

  // Bahan audit
  private readonly members: Member[] = [];
  private readonly disclosed = new Set<Member>();
  private readonly minted = new Set<Member>();
  private readonly inviteSalts = new Set<Hex>();
  private readonly pseudonymKeys = new Set<Hex>();
  private readonly reviewerPseudonyms = new Set<Address>();
  private readonly sessions = new Set<Hex>();
  private readonly recipients = new Set<Address>();
  private readonly texts = new Map<string, string>();

  constructor(readonly opts: ContextOptions) {
    const { urls, rpcUrl, deployments } = opts;
    this.api = new Api(urls.server);
    this.storage = new HttpStorageProvider({ apiUrl: urls.storage, gatewayUrl: urls.storage });
    const chain = defineChain({ id: deployments.chainId, name: deployments.network, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });
    this.client = createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient;
    const c = { client: this.client };
    this.engine = getContract({ address: contractAddress(deployments, "IncentiveEngine"), abi: IncentiveEngineAbi, ...c });
    this.pool = getContract({ address: contractAddress(deployments, "EscrowPool"), abi: EscrowPoolAbi, ...c });
    this.sbt = getContract({ address: contractAddress(deployments, "ReputationSBT"), abi: ReputationSBTAbi, ...c });
    this.records = getContract({ address: contractAddress(deployments, "PublicationRecords"), abi: PublicationRecordsAbi, ...c });
    this.doi = getContract({ address: contractAddress(deployments, "DOIToken"), abi: DOITokenAbi, ...c });
  }

  get chain(): ClientChain {
    return this.cc;
  }
  get web() {
    return this.opts.urls.web;
  }
  get apc() {
    return this.cc.apc;
  }

  private login(email: string, password: string) {
    return Member.login(this.api, email, password, this.opts.urls.zk, this.opts.deployments.chainId, contractAddress(this.opts.deployments, "ActionGateway"));
  }

  private track(m: Member, password: string) {
    this.members.push(m);
    this.passwords.set(m, password);
    return m;
  }

  private async register(m: Member) {
    if (this.registered.has(m)) return;
    await m.registerIdentity();
    this.registered.add(m);
  }

  /**
   * Masuk dengan akun seed. Identitas penelaah didaftarkan bertahap lewat `reviewers(n)`, karena hanya yang terdaftar menjadi
   * kandidat seleksi: mengatur jumlahnya berarti mengatur ukuran pool tiap skenario tanpa jalur khusus di server.
   */
  async setup() {
    this.cc = await ClientChain.connect();
    Member.chain = this.cc;
    Api.trace = (e) => this.sent.push({ path: e.path, body: e.body });
    this.admin = this.track(await this.login("admin@desci.local", "admin123"), "admin123");
    for (const email of ["editor.ai@desci.local", "editor@desci.local"]) {
      const e = this.track(await this.login(email, "editor123"), "editor123");
      await this.register(e);
      this.editors.push(e);
    }
    for (let i = 1; i <= 6; i++) this.reviewerPool.push(this.track(await this.login(`rev${i}@mail.com`, `rev${i}`), `rev${i}`));
  }

  /** `n` penelaah pertama, dipastikan terdaftar. Pool seleksi = penelaah terdaftar. */
  async reviewers(n: number): Promise<Member[]> {
    const list = this.reviewerPool.slice(0, n);
    for (const m of list) await this.register(m);
    return list;
  }

  /** Penelaah yang sudah terdaftar saat ini. */
  get activeReviewers() {
    return this.reviewerPool.filter((m) => this.registered.has(m));
  }

  /** Penulis baru untuk satu skenario: akun, identitas terdaftar, dan identitas pengajuan yang menjadi nilai rahasia audit. */
  async newAuthor(tag: string, who: Identity): Promise<Author> {
    const password = `penulis-${tag}`;
    const m = await Member.register(
      this.api,
      { email: `penulis.${tag}@demo.local`, password, role: "author" },
      this.opts.urls.zk,
      this.opts.deployments.chainId,
      contractAddress(this.opts.deployments, "ActionGateway"),
    );
    this.track(m, password);
    await this.register(m);
    this.texts.set(`nama penulis ${tag}`, who.name);
    this.texts.set(`surel pengajuan ${tag}`, who.email);
    this.texts.set(`afiliasi penulis ${tag}`, who.affiliation);
    const journal = (await this.api.get("/journals")).journals.find((j: { name: string }) => j.name === "Journal of Applied AI");
    return {
      m,
      who,
      form: (title) => ({ journalId: journal.id, title, abstract: ABSTRACT, keywords: "telaah buta, blockchain, bias identitas", authorName: who.name, authorEmail: who.email, affiliation: who.affiliation }),
    };
  }

  clean(seed: string) {
    return this.api.bytes(`/manuscripts/samples/clean?seed=${encodeURIComponent(seed)}&title=${encodeURIComponent("Naskah " + seed)}`);
  }
  sample(kind: string, seed: string) {
    return this.api.bytes(`/manuscripts/samples/${kind}?seed=${encodeURIComponent(seed)}&title=${encodeURIComponent("Naskah " + seed)}`);
  }

  pub(sid: Hex) {
    return this.api.get(`/public/sessions/${sid}`);
  }
  incentive(sid: Hex) {
    return this.api.get(`/incentive/${sid}`);
  }
  escrow(sid: Hex) {
    return this.api.get(`/escrow/${sid}`);
  }
  progress(sid: Hex) {
    return this.api.post(`/system/sessions/${sid}/progress`);
  }

  /** Alamat yang belum pernah dipakai, sebagai tujuan klaim dan refund. Dicatat untuk audit. */
  freshAddress(): Address {
    const b = new Uint8Array(20);
    crypto.getRandomValues(b);
    const a = `0x${Buffer.from(b).toString("hex")}` as Address;
    this.recipients.add(a);
    return a;
  }

  /** Alamat acak untuk percobaan yang harus ditolak: tidak pernah muncul di chain, jadi tidak ikut kontrol positif audit. */
  freshAddressUntracked(): Address {
    const b = new Uint8Array(20);
    crypto.getRandomValues(b);
    return `0x${Buffer.from(b).toString("hex")}` as Address;
  }

  private noteKey(m: Member, sid: Hex, role: RoleValue, slot: number) {
    const d = deriveEphemeral(m.secret, sid, role, slot);
    this.pseudonymKeys.add(d.privateKey);
    return d;
  }

  /** Mencatat sesi dan pseudonim Author untuk audit. */
  trackSession(sid: Hex, author: Member) {
    this.sessions.add(sid);
    this.noteKey(author, sid, Role.Author, 0);
  }

  async editorSeat(sid: Hex): Promise<Seat> {
    const seat = await findEditorSeat(this.editors, sid);
    this.inviteSalts.add(seat.invite.inviteSalt);
    this.noteKey(seat.m, sid, Role.Editor, 0);
    return seat;
  }

  /** Undangan penelaah sebuah batch, dicari di semua penelaah terdaftar. */
  async reviewerSeats(sid: Hex, slot: number): Promise<Seat[]> {
    const seats = await findReviewerSeats(this.activeReviewers, sid, slot);
    for (const s of seats) {
      this.inviteSalts.add(s.invite.inviteSalt);
      this.reviewerPseudonyms.add(this.noteKey(s.m, sid, Role.Reviewer, slot).pseudonym);
    }
    return seats;
  }

  /** Commit berjeda per persona (urutan `seats`), lalu semua reveal. q1 dihitung dari timestamp on-chain. */
  async commitByPersona(seats: Seat[], tag: string, recommendation: RecommendationValue = Recommendation.AcceptAsIs) {
    let waited = 0;
    for (let i = 0; i < seats.length; i++) {
      const p = PERSONA[i];
      if (p.delayDays > waited) {
        await this.cc.increaseTime((p.delayDays - waited) * DAY);
        waited = p.delayDays;
      }
      await seats[i].m.commitReview(seats[i].invite, recommendation, `[${tag}] ${p.text}`);
    }
    for (const s of seats) await s.m.revealReview(s.invite);
  }

  markDisclosed(m: Member) {
    this.disclosed.add(m);
  }
  markMinted(m: Member) {
    this.minted.add(m);
  }

  private trail(sid: Hex): Promise<TrailEntry[]> {
    return auditTrail(this.api, sid);
  }

  /** Jejak status sebuah sesi dari event on-chain. */
  async statusPathOf(sid: Hex): Promise<string[]> {
    return statusPath(await this.trail(sid));
  }

  /** Mengisi catatan sesi skenario untuk laporan: jejak status, hash transaksi, dan tautan halaman. */
  async fillRecords(log: ScenarioLog) {
    log.records = [];
    for (const { label, sessionId } of log.sessions) {
      const trail = await this.trail(sessionId);
      const transitions = trail
        .filter((e) => e.event === "PublicationStatusUpdated")
        .map((e) => ({ status: e.summary.split("→")[1]!.trim(), txHash: e.txHash, block: e.blockNumber }));
      const pub = await this.pub(sessionId);
      const web = this.web;
      const links = [
        { label: "pelacak", url: `${web}/tracker/${sessionId}` },
        { label: "insentif", url: `${web}/incentive/${sessionId}` },
      ];
      if (pub.publication?.doi) links.unshift({ label: "artikel", url: `${web}/articles/${sessionId}` });
      if (pub.session.anonymizedManuscriptURI) links.push({ label: "naskah anonim", url: `${this.opts.urls.storage}/ipfs/${ipfsCid(pub.session.anonymizedManuscriptURI)}` });
      log.records.push({ label, sessionId, transitions, events: trail.length, finalStatus: pub.session.status, doi: pub.publication?.doi ?? null, links });
    }
  }

  /** Masukan audit: semua nilai pribadi yang lahir selama demo. */
  auditInput(deployer: Address, operator: Address): AuditInput {
    return {
      deployer,
      operator,
      contracts: this.opts.deployments.contracts as Record<string, Address>,
      members: this.members.map((m) => ({
        email: m.email,
        secret: m.secret,
        identityCommitment: identityCommitment(m.secret),
        permanentAccount: permanentAccountAddress(m.secret),
        reputationId: reputationId(m.secret),
        disclosed: this.disclosed.has(m),
        registered: this.registered.has(m),
        minted: this.minted.has(m),
      })),
      notes: this.members.flatMap((m) => m.notes.map((n) => ({ secret: n.secret, commitment: noteCommitment(n.secret), payer: n.payer }))),
      inviteSalts: [...this.inviteSalts],
      pseudonymKeys: [...this.pseudonymKeys],
      reviewerPseudonyms: [...this.reviewerPseudonyms],
      sessions: [...this.sessions],
      recipients: [...this.recipients],
      texts: [...this.texts].map(([label, value]) => ({ label, value })),
    };
  }

  /** Akun demo beserta secret, supaya hasil demo bisa dilanjutkan di browser (impor di /profile). Hanya data lokal. */
  actors() {
    return this.members.map((m) => ({
      email: m.email,
      password: this.passwords.get(m),
      secret: this.registered.has(m) ? m.secret : null,
      notes: m.notes.map((n) => n.secret),
    }));
  }
}

export interface Scenario {
  id: string;
  title: string;
  proves: string;
  run(ctx: Context, log: ScenarioLog): Promise<void>;
}
