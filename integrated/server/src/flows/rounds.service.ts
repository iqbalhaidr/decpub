/**
 * Ronde telaah. Satu ronde = batch-batch penelaah yang keputusannya diagregasi bersama.
 *
 *   batch 1 (3 penelaah) -> zona abu-abu -> batch 2 (+2) -> keputusan atas 5 pseudonim  : satu ronde
 *   batch 1 -> Minor/Major -> revisi -> batch 2 (pseudonim baru)                         : dua ronde
 *   batch 1 -> tidak ada reveal (ditinggalkan) -> batch 2 (pengganti)                    : satu ronde
 *
 * Batch k bergabung ke ronde batch k+1 bila keputusan k adalah zona abu-abu, atau k ditinggalkan
 * (tidak ada keputusan dan semua undangannya voided). Keputusan non-abu-abu menutup ronde.
 * Seluruhnya dihitung dari chain (keputusan) dan DB (undangan), jadi tidak ada state tambahan.
 */
import { Injectable } from "@nestjs/common";
import type { Address, Hex } from "viem";
import { SessionReader } from "../chain/session-reader.service.js";
import { InvitationsRepository, type Invitation } from "../selection/invitations.repository.js";

export interface Participant {
  invite: Invitation;
  pseudonym: Address;
}

@Injectable()
export class RoundService {
  constructor(
    private readonly reader: SessionReader,
    private readonly invitations: InvitationsRepository,
  ) {}

  /** Nomor batch ronde yang berakhir di `upTo`, urut naik. */
  async batchesOfRound(sessionId: Hex, upTo: number): Promise<number[]> {
    const batches = [upTo];
    for (let k = upTo - 1; k >= 1; k--) {
      const d = await this.reader.decision(sessionId, k);
      const abandoned = !d && this.invitations.forBatch(sessionId, k).length === 0 && this.invitations.forBatch(sessionId, k, { includeVoided: true }).length > 0;
      if (d?.grayZone || abandoned) batches.unshift(k);
      else break;
    }
    return batches;
  }

  /** Undangan penelaah di semua batch ronde. `includeVoided` dipakai untuk pengecualian pemilihan. */
  invitesOf(sessionId: Hex, batches: readonly number[], includeVoided = false): Invitation[] {
    return batches.flatMap((b) => this.invitations.forBatch(sessionId, b, { includeVoided }));
  }

  /** Peserta ronde yang sudah mengikat penugasan (punya pseudonim). */
  async bound(sessionId: Hex, batches: readonly number[]): Promise<Participant[]> {
    const out: Participant[] = [];
    for (const invite of this.invitesOf(sessionId, batches)) {
      const pseudonym = await this.reader.assignmentOwner(sessionId, invite.assignmentCommitment as Hex);
      if (pseudonym) out.push({ invite, pseudonym });
    }
    return out;
  }

  /** Peserta ronde yang sudah reveal: hanya merekalah yang dihitung dalam keputusan (D3). */
  async revealed(sessionId: Hex, batches: readonly number[]): Promise<Participant[]> {
    const out: Participant[] = [];
    for (const p of await this.bound(sessionId, batches)) if (await this.reader.hasReveal(sessionId, p.pseudonym)) out.push(p);
    return out;
  }
}
