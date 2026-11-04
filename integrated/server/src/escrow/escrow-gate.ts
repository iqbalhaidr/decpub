/**
 * Gerbang escrow untuk langkah sistem: apakah sesi boleh dimajukan.
 *
 *   ESCROW_REQUIRED, belum ada APC terikat  -> berhenti (menunggu `POST /escrow/bind`); tidak ada dana di risiko
 *   APC sudah di-refund                      -> berhenti (sesi dihentikan, lihat `ProgressService.closeAfterRefund`)
 *   selainnya                                -> lanjut
 *
 * Dibaca dari chain setiap kali, jadi tidak ada state di server.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Hex } from "viem";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { EscrowState, IncentiveReader } from "../chain/incentive-reader.service.js";

export type GateVerdict = { proceed: true; state: number } | { proceed: false; state: number; reason: string; refunded: boolean };

@Injectable()
export class EscrowGate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly reader: IncentiveReader,
  ) {}

  async check(sessionId: Hex): Promise<GateVerdict> {
    const e = await this.reader.escrow(sessionId);
    if (e.stateValue === EscrowState.Refunded) {
      return { proceed: false, state: e.stateValue, refunded: true, reason: "APC sudah di-refund; sesi dihentikan" };
    }
    if (this.config.escrowRequired && e.stateValue === EscrowState.None) {
      return { proceed: false, state: e.stateValue, refunded: false, reason: "Menunggu pengikatan APC (POST /escrow/bind)" };
    }
    return { proceed: true, state: e.stateValue };
  }
}
