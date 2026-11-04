/**
 * Pembungkus bertipe untuk `ActionGateway`: satu-satunya pintu server ke kontrak Ciko.
 * Fungsi sistem dikirim operator; aksi bertanda tangan dan ber-ZK hanya diteruskan (relay),
 * server tidak bisa mengubahnya tanpa membatalkan tanda tangan atau bukti.
 */
import { Injectable } from "@nestjs/common";
import type { Address, Hex } from "viem";
import type { AutomaticCheckResultValue, CreateSessionAction, PublicationStatusValue, RoleValue } from "@decpub/shared";
import { ChainService, type TxReceipt } from "./chain.service.js";

@Injectable()
export class GatewayService {
  constructor(private readonly chain: ChainService) {}

  private send(fn: string, args: readonly unknown[]): Promise<TxReceipt> {
    return this.chain.write("operator", "ActionGateway", fn, args);
  }

  // ---- relay: aksi ber-ZK dan bertanda tangan (siapa saja boleh mengirim, bukti yang mengikat)

  createEphemeralWithProof(p: {
    sessionId: Hex;
    role: RoleValue;
    pseudonym: Address;
    sessionCommitment: Hex;
    nullifier: Hex;
    proof: Hex;
  }): Promise<TxReceipt> {
    return this.send("createEphemeralWithProof", [p.sessionId, p.role, p.pseudonym, p.sessionCommitment, p.nullifier, p.proof]);
  }

  createSessionSigned(action: CreateSessionAction, signature: Hex): Promise<TxReceipt> {
    return this.send("createSessionSigned", [action, signature]);
  }

  // ---- aksi sistem (hanya operator)

  updateStatus(sessionId: Hex, status: PublicationStatusValue): Promise<TxReceipt> {
    return this.send("updateStatus", [sessionId, status]);
  }

  recordAutomaticCheck(p: {
    sessionId: Hex;
    reportHash: Hex;
    flagsHash: Hex;
    reportURI: string;
    result: AutomaticCheckResultValue;
  }): Promise<TxReceipt> {
    return this.send("recordAutomaticCheck", [p.sessionId, p.reportHash, p.flagsHash, p.reportURI, p.result]);
  }

  // ---- baca

  nonceOf(pseudonym: Address): Promise<bigint> {
    return this.chain.read<bigint>("ActionGateway", "nonces", [pseudonym]);
  }
}
