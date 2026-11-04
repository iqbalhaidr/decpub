/**
 * Perilaku sisi klien (browser) untuk skrip: memegang secret, mendaftarkan identitas,
 * membuat pseudonim dengan bukti, menandatangani aksi. Memakai `packages/shared` yang sama
 * dengan frontend, jadi alur skrip = alur browser. Secret TIDAK PERNAH dikirim ke server;
 * hanya ke zk-sim (witness, bagian dari simulasi).
 */
import type { Address, Hex } from "viem";
import {
  DeskDecision,
  claimableReputation,
  generateNoteSecret,
  noteBindNullifier,
  noteRefundNullifier,
  reputationBucketNullifier,
  reputationClaimNullifier,
  reputationId,
  reputationTier,
  signClaimReward,
  HttpZkProver,
  attributesHash,
  disclosureSignals,
  Role,
  ZkKind,
  computeCommitHash,
  createStorageProvider,
  deriveEphemeral,
  editorialReportDocuments,
  editorialReportHashes,
  generateSecret,
  gatewayDomain,
  identityCommitment,
  permanentAccountAddress,
  reviewDocument,
  signCommit,
  signCreateSession,
  signReveal,
  signRevision,
  signScreening,
  signals,
  type DisclosableRole,
  type DisclosureAttributes,
  type RecommendationValue,
  type RoleValue,
  type StorageProvider,
} from "@decpub/shared";
import { keccak256 } from "viem";
import { randomBytes } from "node:crypto";
import { Api } from "./api.js";
import type { ClientChain } from "./client-chain.js";

export interface Credentials {
  identityCommitment: Hex;
  roles: Record<string, Hex>;
  fields: Record<string, Hex>;
}

export interface NoteInfo {
  secret: Hex;
  depositTx: Hex;
  payer: Address;
}

export class Member {
  /**
   * Akses chain sisi klien (dompet penyetor, saldo reputasi). Diisi sekali oleh demo/skenario. Bila terisi, pengajuan
   * naskah otomatis membeli dan mengikat note APC bila server mewajibkan escrow, dan penerimaan undangan penelaah
   * menyatakan tingkat reputasi. Tanpa ini, perilaku klien sama seperti M3-M5 (tanpa escrow).
   */
  static chain?: ClientChain;
  readonly secret: Hex = generateSecret();
  /** Note yang dimiliki, belum dan sudah terikat. Rahasia note hanya di klien (arsitektur A2). */
  readonly notes: NoteInfo[] = [];
  private readonly noteOfSession = new Map<string, NoteInfo>();
  api: Api;
  credentials?: Credentials;

  private constructor(
    readonly email: string,
    api: Api,
    readonly prover: HttpZkProver,
    readonly chainId: number,
    readonly gateway: Address,
  ) {
    this.api = api;
  }

  /** Login akun yang sudah ada (mis. seed) dan siapkan secret baru di sisi klien. */
  static async login(base: Api, email: string, password: string, zkUrl: string, chainId: number, gateway: Address): Promise<Member> {
    const { accessToken } = await base.post<{ accessToken: string }>("/auth/login", { email, password });
    return new Member(email, base.as(accessToken), new HttpZkProver(zkUrl), chainId, gateway);
  }

  static async register(
    base: Api,
    input: { email: string; password: string; role?: "author" | "reviewer"; specialities?: string[] },
    zkUrl: string,
    chainId: number,
    gateway: Address,
  ): Promise<Member> {
    await base.post("/auth/register", input);
    return Member.login(base, input.email, input.password, zkUrl, chainId, gateway);
  }

  /** P01: commitment didaftarkan on-chain. Alamat akun permanen = dompet dev turunan secret. */
  async registerIdentity() {
    return this.api.post("/me/identity", {
      identityCommitment: identityCommitment(this.secret),
      permanentAddress: permanentAccountAddress(this.secret),
    });
  }

  async loadCredentials(): Promise<Credentials> {
    this.credentials = await this.api.get<Credentials>("/me/credentials");
    return this.credentials;
  }

  /** Membuat pseudonim di sebuah sesi: bukti dari zk-sim, lalu diteruskan relayer (tanpa JWT). */
  async createPseudonym(sessionId: Hex, role: RoleValue, slot = 0) {
    const cred = this.credentials ?? (await this.loadCredentials());
    const roleName = ["Author", "Reviewer", "Editor"][role];
    const d = deriveEphemeral(this.secret, sessionId, role, slot);
    const publicSignals = signals.ephemeral(sessionId, role, d.pseudonym, d.sessionCommitment, d.nullifier);
    const proof = await this.prover.prove(ZkKind.Ephemeral, { secret: this.secret, credential: cred.roles[roleName], slot }, publicSignals);
    const anon = new Api(this.api.base); // tanpa token: relayer tidak boleh bisa menautkan pseudonim ke akun
    const tx = await anon.post("/flows/ephemeral-account", {
      sessionId,
      role,
      pseudonym: d.pseudonym,
      sessionCommitment: d.sessionCommitment,
      nullifier: d.nullifier,
      proof: proof.proof,
    });
    return { ...d, tx, proof };
  }

  private storageProvider?: StorageProvider;

  /** Storage publik, dibangun dari `/config` server seperti yang akan dilakukan browser. */
  async storage(): Promise<StorageProvider> {
    if (!this.storageProvider) {
      const cfg = await new Api(this.api.base).get<{ storage: { apiUrl: string; gatewayUrl: string } }>("/config");
      this.storageProvider = createStorageProvider(cfg.storage);
    }
    return this.storageProvider;
  }

  private anon(): Api {
    return new Api(this.api.base); // tanpa token: aksi pseudonim tidak boleh tertaut ke akun
  }

  private async nonceOf(pseudonym: Address): Promise<bigint> {
    return BigInt((await this.anon().get<{ nonce: string }>(`/flows/nonce/${pseudonym}`)).nonce);
  }

  private signer(privateKey: Hex) {
    return { privateKey, chainId: this.chainId, gateway: this.gateway };
  }

  // ------------------------------------------------------------ P05-P07 (editor dan penelaah)

  /** Kotak masuk undangan akun ini (JWT). */
  inbox(): Promise<Invite[]> {
    return this.api.get<Invite[]>("/invitations");
  }

  /** Membuktikan kepemilikan undangan untuk pseudonim `ps` (witness: salt undangan). */
  private async ownershipProof(invite: Invite, pseudonym: Address) {
    return this.prover.prove(
      ZkKind.AssignmentOwnership,
      { inviteSalt: invite.inviteSalt },
      signals.assignmentOwnership(invite.sessionId, invite.assignmentCommitment, pseudonym),
    );
  }

  /** Editor menerima undangan: pseudonim Editor, bukti kepemilikan, lalu penugasan. */
  async acceptEditorInvite(invite: Invite) {
    const ps = await this.createPseudonym(invite.sessionId, Role.Editor, 0);
    const proof = await this.ownershipProof(invite, ps.pseudonym);
    const accepted = await this.anon().post("/flows/assignments/editor", {
      sessionId: invite.sessionId,
      assignmentCommitment: invite.assignmentCommitment,
      pseudonym: ps.pseudonym,
      proof: proof.proof,
    });
    return { pseudonym: ps, accepted };
  }

  /**
   * Penelaah menerima undangan: pseudonim Reviewer (slot = nomor batch), bukti, lalu pengikatan.
   * Dengan `Member.chain`, tingkat reputasi (q4) dinyatakan SEBELUM pengikatan: pengikatan terakhir bisa memicu
   * langkah sistem berikutnya (membuka fase Commit), dan tingkat tidak bisa lagi dinyatakan setelah distribusi.
   */
  async acceptReviewerInvite(invite: Invite) {
    const ps = await this.createPseudonym(invite.sessionId, Role.Reviewer, invite.slot);
    const proof = await this.ownershipProof(invite, ps.pseudonym);
    const tier = Member.chain ? await this.declareReputationTier(invite) : undefined;
    const bound = await this.anon().post("/flows/assignments/bind", {
      sessionId: invite.sessionId,
      assignmentCommitment: invite.assignmentCommitment,
      pseudonym: ps.pseudonym,
      proof: proof.proof,
    });
    return { pseudonym: ps, bound, tier };
  }

  /** Editor mengirim putusan penyaringan bertanda tangan pseudonim Editor. */
  async screen(
    sessionId: Hex,
    r: { decision: number; comments: string; reviewerFields: string[]; privateNotes?: string },
    opts: { tamper?: (body: Record<string, any>) => void } = {},
  ) {
    const ps = deriveEphemeral(this.secret, sessionId, Role.Editor, 0);
    const storage = await this.storage();
    const sess = await new Api(this.api.base).get<{ session: { revisionCount: number } }>(`/public/sessions/${sessionId}`);
    const input = { sessionId, revision: sess.session.revisionCount, ...r };
    const { publicBytes } = editorialReportDocuments(input);
    const hashes = editorialReportHashes(input);
    const nonce = await this.nonceOf(ps.pseudonym);
    const action = {
      sessionId,
      pseudonym: ps.pseudonym,
      ...hashes,
      anonymousEditorialReportURI: `ipfs://${await storage.cidOf(publicBytes)}`,
      decision: r.decision,
      nonce,
    };
    const signature = await signScreening(this.signer(ps.privateKey), action);
    const body: Record<string, any> = {
      action: { ...action, nonce: nonce.toString() },
      signature,
      report: { decision: r.decision, comments: r.comments, reviewerFields: r.reviewerFields, privateNotes: r.privateNotes },
    };
    opts.tamper?.(body);
    return this.anon().post("/flows/editorial-screening", body);
  }

  /**
   * Data commit yang hanya ada di klien sampai reveal. Kuncinya sesi + slot (nomor batch): satu orang
   * bisa punya beberapa ronde di sesi yang sama (revisi, zona abu-abu), tiap ronde dengan pseudonim sendiri.
   */
  private pendingReviews = new Map<string, PendingReview>();
  private pendingKey = (invite: Invite) => `${invite.sessionId.toLowerCase()}#${invite.slot}`;

  /**
   * Penelaah membuat commit: dokumen telaah, hash/CID, nonce acak, dan `commitHash` dihitung di
   * KLIEN. Yang dikirim ke server hanya `commitHash` bertanda tangan.
   */
  async commitReview(invite: Invite, recommendation: RecommendationValue, text: string) {
    const ps = deriveEphemeral(this.secret, invite.sessionId, Role.Reviewer, invite.slot);
    const storage = await this.storage();
    const bytes = reviewDocument(invite.sessionId, text);
    const reviewHash = keccak256(bytes);
    const reviewURI = `ipfs://${await storage.cidOf(bytes)}`;
    const reviewNonce = ("0x" + randomBytes(32).toString("hex")) as Hex;
    const commitHash = computeCommitHash({ sessionId: invite.sessionId, pseudonym: ps.pseudonym, recommendation, reviewHash, reviewURI, nonce: reviewNonce });
    const nonce = await this.nonceOf(ps.pseudonym);
    const action = { sessionId: invite.sessionId, pseudonym: ps.pseudonym, assignmentCommitment: invite.assignmentCommitment, commitHash, nonce };
    const signature = await signCommit(this.signer(ps.privateKey), action);
    const res = await this.anon().post("/flows/reviews/commit", { action: { ...action, nonce: nonce.toString() }, signature });
    // Data pembukaan disimpan hanya bila commit diterima: commit yang ditolak tidak boleh menimpa yang sah.
    this.pendingReviews.set(this.pendingKey(invite), { invite, recommendation, text, reviewHash, reviewURI, reviewNonce });
    return res;
  }

  /** Penelaah membuka commit-nya; isi telaah dikirim bersama pembukaan. */
  async revealReview(invite: Invite) {
    const p = this.pendingReviews.get(this.pendingKey(invite));
    if (!p) throw new Error("Tidak ada commit tertunda untuk sesi ini (data commit hanya di klien)");
    const ps = deriveEphemeral(this.secret, invite.sessionId, Role.Reviewer, invite.slot);
    const nonce = await this.nonceOf(ps.pseudonym);
    const action = {
      sessionId: invite.sessionId,
      pseudonym: ps.pseudonym,
      assignmentCommitment: invite.assignmentCommitment,
      recommendation: p.recommendation,
      reviewHash: p.reviewHash,
      reviewURI: p.reviewURI,
      reviewNonce: p.reviewNonce,
      nonce,
    };
    const signature = await signReveal(this.signer(ps.privateKey), action);
    return this.anon().post("/flows/reviews/reveal", { action: { ...action, nonce: nonce.toString() }, signature, text: p.text });
  }

  /** Data commit tertunda sebuah undangan (hanya untuk uji yang sengaja menyimpang). */
  pendingFor(invite: Invite): PendingReview | undefined {
    return this.pendingReviews.get(this.pendingKey(invite));
  }

  /** Pseudonim penelaah untuk sebuah undangan (diturunkan dari secret). */
  reviewerPseudonym(invite: Invite) {
    return deriveEphemeral(this.secret, invite.sessionId, Role.Reviewer, invite.slot);
  }

  /** Menandatangani `CreateSession` untuk hasil intake. */
  async signCreateSession(intake: IntakeResult, pseudonymKey: Hex, pseudonym: Address) {
    const nonce = BigInt((await this.api.get<{ nonce: string }>(`/flows/nonce/${pseudonym}`)).nonce);
    const action = {
      sessionId: intake.sessionId,
      pseudonym,
      originalManuscriptHash: intake.originalManuscriptHash,
      anonymizedManuscriptHash: intake.anonymizedManuscriptHash,
      metadataHash: intake.metadataHash,
      anonymizedManuscriptURI: intake.anonymizedManuscriptURI,
      metadataURI: intake.metadataURI,
      nonce,
    };
    const signature = await signCreateSession({ privateKey: pseudonymKey, chainId: this.chainId, gateway: this.gateway }, action);
    return { action: { ...action, nonce: nonce.toString() }, signature };
  }

  /** Unggah naskah (P02 sisi server). */
  async intake(pdf: Uint8Array, f: { journalId: number; title: string; authorName: string; authorEmail: string; affiliation?: string; abstract?: string; keywords?: string }, filename = "manuscript.pdf") {
    const form = new FormData();
    form.append("file", new Blob([pdf as BlobPart], { type: "application/pdf" }), filename);
    for (const [k, v] of Object.entries(f)) if (v !== undefined) form.append(k, String(v));
    return this.api.postForm<IntakeResult>("/manuscripts/intake", form);
  }

  /** Revisi, langkah 1: unggah PDF revisi. Server menganonimkan dan mengembalikan nilai yang harus ditandatangani. */
  async intakeRevision(manuscriptId: string, pdf: Uint8Array, f: { title?: string; abstract?: string; keywords?: string } = {}, filename = "revision.pdf") {
    const form = new FormData();
    form.append("file", new Blob([pdf as BlobPart], { type: "application/pdf" }), filename);
    for (const [k, v] of Object.entries(f)) if (v !== undefined) form.append(k, String(v));
    return this.api.postForm<RevisionIntakeResult>(`/manuscripts/${manuscriptId}/revisions/intake`, form);
  }

  /** Revisi, langkah 2: tanda tangan `RecordRevision` dengan pseudonim Author (diturunkan dari secret), lalu kirim. */
  async submitRevision(
    manuscriptId: string,
    intake: RevisionIntakeResult,
    opts: { signAs?: Member; tamper?: (body: Record<string, any>) => void } = {},
  ) {
    const author = deriveEphemeral(this.secret, intake.sessionId, Role.Author, 0);
    const signerKey = deriveEphemeral((opts.signAs ?? this).secret, intake.sessionId, Role.Author, 0).privateKey;
    const nonce = await this.nonceOf(author.pseudonym);
    const action = {
      sessionId: intake.sessionId,
      pseudonym: author.pseudonym,
      newOriginalManuscriptHash: intake.newOriginalManuscriptHash,
      newAnonymizedManuscriptHash: intake.newAnonymizedManuscriptHash,
      newMetadataHash: intake.newMetadataHash,
      newAnonymizedManuscriptURI: intake.newAnonymizedManuscriptURI,
      newMetadataURI: intake.newMetadataURI,
      nonce,
    };
    const signature = await signRevision(this.signer(signerKey), action);
    const body: Record<string, any> = { manuscriptId, action: { ...action, nonce: nonce.toString() }, signature };
    opts.tamper?.(body);
    return this.api.post<RevisionResult>("/flows/revision", body);
  }

  /**
   * Alur penulis lengkap: intake -> pseudonim -> tanda tangan -> pengajuan. Bila server mewajibkan escrow dan
   * `Member.chain` tersedia, APC diikat setelahnya dan balasan `advance` berasal dari langkah sistem yang menunggu APC.
   */
  async submitManuscript(pdf: Uint8Array, f: Parameters<Member["intake"]>[1]) {
    const intake = await this.intake(pdf, f);
    const ps = await this.createPseudonym(intake.sessionId, Role.Author);
    const signed = await this.signCreateSession(intake, ps.privateKey, ps.pseudonym);
    const submission = await this.api.post<SubmissionResult>("/flows/submission", { manuscriptId: intake.manuscriptId, ...signed });
    let bound: { tx: { txHash: Hex }; advance?: SubmissionResult["advance"] } | undefined;
    if (Member.chain && (await this.escrowRequired())) {
      bound = await this.bindNote(intake.sessionId);
      if (bound.advance && "steps" in bound.advance) submission.advance = bound.advance;
    }
    return { intake, pseudonym: ps, signed, submission, bound };
  }

  // ------------------------------------------------------------ pasca-publikasi (P08, M8)

  /**
   * Selective disclosure: bukti dari zk-sim (witness = secret, peran, atribut terpilih, salt), lalu `POST /flows/disclosure`.
   * `role` 0 = penulis, 2 = editor. `opts.secret` memalsukan pemilik (uji negatif); `opts.account` mengganti akun permanen.
   */
  async disclose(
    sessionId: Hex,
    role: DisclosableRole,
    attributes: DisclosureAttributes,
    opts: { includeManuscript?: boolean; secret?: Hex; account?: Address; salt?: Hex; postAs?: Member; tamper?: (body: Record<string, any>) => void } = {},
  ) {
    const secret = opts.secret ?? this.secret;
    const account = opts.account ?? permanentAccountAddress(this.secret);
    const salt = opts.salt ?? (`0x${randomBytes(32).toString("hex")}` as Hex);
    const pseudonym = deriveEphemeral(secret, sessionId, role, 0).pseudonym;
    const hash = attributesHash(sessionId, role, attributes, salt);
    const proof = await this.prover.prove(
      ZkKind.SelectiveDisclosure,
      { secret, role, attributes, salt },
      disclosureSignals(sessionId, pseudonym, account, hash),
    );
    const body: Record<string, any> = {
      sessionId,
      role,
      permanentAccount: account,
      attributes,
      salt,
      includeManuscript: opts.includeManuscript ?? false,
      proof: proof.proof,
    };
    opts.tamper?.(body);
    return (opts.postAs ?? this).api.post<{ sessionId: Hex; role: number; attributes: DisclosureAttributes; attributesHash: Hex; txHash: Hex; originalManuscript: { cid: string; sha256: Hex; uploaded: boolean } | null }>(
      "/flows/disclosure",
      body,
    );
  }

  /** Komentar pembaca pada artikel terbit (login apa pun). */
  comment(sessionId: Hex, text: string) {
    return this.api.post(`/articles/${sessionId}/comments`, { text });
  }

  // ------------------------------------------------------------ escrow APC (Hugo, M7)

  private async serverConfig() {
    return new Api(this.api.base).get<{ escrowRequired: boolean; contracts: Record<string, string>; chainId: number }>("/config");
  }

  async escrowRequired(): Promise<boolean> {
    return (await this.serverConfig()).escrowRequired;
  }

  /** P01: membeli satu note APC dari dompet penyetor (rahasia note disimpan di sini, tidak dikirim ke server). */
  async buyNote(): Promise<NoteInfo> {
    if (!Member.chain) throw new Error("Member.chain belum diisi");
    const secret = generateNoteSecret();
    const dep = await Member.chain.deposit(secret);
    const note = { secret, depositTx: dep.txHash, payer: dep.payer };
    this.notes.push(note);
    return note;
  }

  /** Note yang belum terikat ke sesi mana pun; membeli satu bila tidak ada. */
  private async spareNote(): Promise<NoteInfo> {
    const bound = new Set([...this.noteOfSession.values()]);
    return this.notes.find((n) => !bound.has(n)) ?? (await this.buyNote());
  }

  /** P02: mengikat note ke sesi. Yang dikirim ke server hanya sesi, nullifier, dan bukti (note tidak disebut). */
  async bindNote(sessionId: Hex, note?: NoteInfo) {
    const n = note ?? (await this.spareNote());
    const nullifier = noteBindNullifier(n.secret);
    const proof = await this.prover.prove(ZkKind.NoteBind, { noteSecret: n.secret }, signals.noteBind(sessionId, nullifier));
    const res = await this.anon().post<{ tx: { txHash: Hex }; advance?: SubmissionResult["advance"] }>("/escrow/bind", { sessionId, nullifier, proof: proof.proof });
    this.noteOfSession.set(sessionId.toLowerCase(), n);
    return res;
  }

  /** Refund penuh ke alamat baru (belum pernah dipakai). Penerima terikat pada bukti. */
  async refund(sessionId: Hex, recipient: Address, opts: { signAs?: Member } = {}) {
    const owner = opts.signAs ?? this;
    const note = owner.noteOfSession.get(sessionId.toLowerCase());
    if (!note) throw new Error("Tidak ada note terikat ke sesi ini pada anggota ini");
    const nullifier = noteRefundNullifier(note.secret, sessionId);
    const proof = await this.prover.prove(ZkKind.NoteRefund, { noteSecret: note.secret }, signals.noteRefund(sessionId, recipient, nullifier));
    return this.anon().post<{ tx: { txHash: Hex }; closed: string[] }>("/escrow/refund", { sessionId, recipient, nullifier, proof: proof.proof });
  }

  // --------------------------------------------------------- reputasi dan imbalan (Hugo, M7)

  /**
   * P06: menyatakan tingkat reputasi (q4) untuk pseudonim penelaah di sebuah undangan. Tingkat dibaca dari saldo
   * SBT publik di klien; server hanya menerima pseudonim dan tingkat, bukan `reputationId`.
   */
  async declareReputationTier(invite: Invite, opts: { tierOverride?: number } = {}) {
    if (!Member.chain) throw new Error("Member.chain belum diisi");
    const tier = opts.tierOverride ?? reputationTier(await Member.chain.effectiveBalance(reputationId(this.secret)));
    const ps = this.reviewerPseudonym(invite);
    const nullifier = reputationBucketNullifier(this.secret, invite.sessionId, invite.slot);
    const proof = await this.prover.prove(ZkKind.ReputationBucket, { secret: this.secret, slot: invite.slot }, signals.reputationBucket(invite.sessionId, ps.pseudonym, tier, nullifier));
    const res = await this.anon().post("/flows/reviews/reputation-tier", { sessionId: invite.sessionId, pseudonym: ps.pseudonym, tier, nullifier, proof: proof.proof });
    return { tier, res };
  }

  /** P08: klaim imbalan ETH ke alamat baru, ditandatangani pseudonim penelaah. */
  async claimReward(sessionId: Hex, slot: number, recipient: Address, opts: { signAs?: Member } = {}) {
    const cfg = await this.serverConfig();
    const signerKey = deriveEphemeral((opts.signAs ?? this).secret, sessionId, Role.Reviewer, slot).privateKey;
    const ps = deriveEphemeral(this.secret, sessionId, Role.Reviewer, slot);
    const signature = await signClaimReward({ privateKey: signerKey, chainId: cfg.chainId, escrowPool: cfg.contracts.EscrowPool as Address }, { sessionId, recipient });
    return this.anon().post<{ tx: { txHash: Hex }; amountWei: string }>("/incentive/claim-reward", { sessionId, pseudonym: ps.pseudonym, recipient, signature });
  }

  /**
   * P08: mengajukan klaim reputasi atas kredit pseudonim sesi ini. Jumlah = kredit sigmoid publik (laporan QoS)
   * dibulatkan ke bawah ke kelipatan 0,25. Permintaan tidak memuat sesi dan pseudonim.
   * Mengembalikan null bila kredit di bawah satu langkah.
   */
  async claimReputation(sessionId: Hex, slot: number) {
    const ps = deriveEphemeral(this.secret, sessionId, Role.Reviewer, slot);
    const view = await new Api(this.api.base).get(`/incentive/${sessionId}`);
    const row = view.distribution?.rows.find((r: { pseudonym: string }) => r.pseudonym.toLowerCase() === ps.pseudonym.toLowerCase());
    if (!row) throw new Error("Pseudonim ini tidak ada di laporan QoS sesi tersebut");
    const amount = claimableReputation(BigInt(row.sigmoid));
    if (amount === 0n) return null;
    const nullifier = reputationClaimNullifier(this.secret, sessionId, slot);
    const rid = reputationId(this.secret);
    const proof = await this.prover.prove(ZkKind.ReputationClaim, { secret: this.secret, sessionId, slot }, signals.reputationClaim(rid, amount, nullifier));
    const body = { reputationId: rid, amount: amount.toString(), nullifier, proof: proof.proof };
    return { amount, res: await this.anon().post("/incentive/reputation-claims", body), body };
  }
}

export interface Invite {
  id: string;
  role: "editor" | "reviewer";
  sessionId: Hex;
  slot: number;
  inviteSalt: Hex;
  assignmentCommitment: Hex;
  criteria: { fields: string[]; hash: Hex };
  proofUri: string;
  accepted: boolean;
  voided?: boolean;
  sessionStatus: string;
  journal: { id: number; name: string; category: string } | null;
  anonymizedManuscriptUrl: string | null;
}

export interface RevisionIntakeResult {
  manuscriptId: string;
  sessionId: Hex;
  revision: number;
  nextStatus: "AssigningReviewers" | "UnderEditorialScreening";
  newOriginalManuscriptHash: Hex;
  newAnonymizedManuscriptHash: Hex;
  newMetadataHash: Hex;
  newAnonymizedManuscriptURI: string;
  newMetadataURI: string;
  warnings: string[];
}

export interface RevisionResult {
  revision: number;
  tx: { txHash: Hex; blockNumber: number };
  status: string;
  progress?: { status: string; actions: string[]; blocked: string | null };
  notes?: string[];
}

export interface PendingReview {
  invite: Invite;
  recommendation: RecommendationValue;
  text: string;
  reviewHash: Hex;
  reviewURI: string;
  reviewNonce: Hex;
}

export { DeskDecision };

export interface IntakeResult {
  manuscriptId: string;
  sessionId: Hex;
  originalManuscriptHash: Hex;
  anonymizedManuscriptHash: Hex;
  metadataHash: Hex;
  anonymizedManuscriptURI: string;
  metadataURI: string;
  warnings: string[];
}

export interface SubmissionResult {
  tx: { txHash: Hex; blockNumber: number };
  advance?: {
    sessionId: Hex;
    status: string;
    steps: Array<{ step: "P03" | "P04"; result?: string; plagiarismScore?: number; warnings?: string[]; anonymizedCid?: string }>;
  };
}

export { gatewayDomain };
