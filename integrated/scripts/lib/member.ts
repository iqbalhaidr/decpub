/**
 * Perilaku sisi klien (browser) untuk skrip: memegang secret, mendaftarkan identitas,
 * membuat pseudonim dengan bukti, menandatangani aksi. Memakai `packages/shared` yang sama
 * dengan frontend, jadi alur skrip = alur browser. Secret TIDAK PERNAH dikirim ke server;
 * hanya ke zk-sim (witness, bagian dari simulasi).
 */
import type { Address, Hex } from "viem";
import {
  HttpZkProver,
  Role,
  ZkKind,
  deriveEphemeral,
  generateSecret,
  gatewayDomain,
  identityCommitment,
  permanentAccountAddress,
  signCreateSession,
  signals,
  type RoleValue,
} from "@decpub/shared";
import { Api } from "./api.js";

export interface Credentials {
  identityCommitment: Hex;
  roles: Record<string, Hex>;
  fields: Record<string, Hex>;
}

export class Member {
  readonly secret: Hex = generateSecret();
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

  /** Alur penulis lengkap: intake -> pseudonim -> tanda tangan -> pengajuan. */
  async submitManuscript(pdf: Uint8Array, f: Parameters<Member["intake"]>[1]) {
    const intake = await this.intake(pdf, f);
    const ps = await this.createPseudonym(intake.sessionId, Role.Author);
    const signed = await this.signCreateSession(intake, ps.privateKey, ps.pseudonym);
    const submission = await this.api.post<SubmissionResult>("/flows/submission", { manuscriptId: intake.manuscriptId, ...signed });
    return { intake, pseudonym: ps, signed, submission };
  }
}

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
