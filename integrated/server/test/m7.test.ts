/**
 * Tes logika M7 (escrow, penyelesaian insentif, reputasi) dengan pengganti dalam memori untuk chain dan storage.
 * Jalur chain nyata, zk-sim nyata, dan storage nyata dicakup `npm run demo:m7`.
 */
import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keccak256, type Address, type Hex } from "viem";
import { MAX_REVIEWERS_PER_SESSION, PublicationStatus, rawCidOf, type StorageProvider } from "@decpub/shared";
import { SimulatedQoSProvider, resolvePolicy } from "@decpub/incentive-core";
import { DatabaseService } from "../src/db/database.service.js";
import { EscrowGate } from "../src/escrow/escrow-gate.js";
import { ProgressService } from "../src/flows/progress.service.js";
import { IncentiveRepository } from "../src/incentive/incentive.repository.js";
import { IncentiveService } from "../src/incentive/incentive.service.js";
import { ReputationService, MINT_CHUNK } from "../src/incentive/reputation.service.js";
import { createQosProvider } from "../src/incentive/qos.provider.js";
import { testConfig } from "./helpers.js";

const SID = ("0x" + "11".repeat(32)) as Hex;
const h = (n: number) => ("0x" + n.toString(16).padStart(2, "0").repeat(32)) as Hex;
const addr = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Address;
const enc = new TextEncoder();
const APC = 10n ** 16n;

// ===================================================================== repositori

describe("IncentiveRepository", () => {
  const repo = () => new IncentiveRepository(new DatabaseService({ dbPath: ":memory:" }));

  it("kebijakan: kunci pertama menang, perubahan sesudahnya tidak menimpa", () => {
    const r = repo();
    const first = r.lockPolicy({ sessionId: SID, journalId: 1, policy: resolvePolicy({ preset: "Balanced", lambda: 0.6 }) });
    const second = r.lockPolicy({ sessionId: SID, journalId: 1, policy: resolvePolicy({ preset: "Speed-First", lambda: 0.1 }) });
    assert.equal(second.preset, "Balanced");
    assert.equal(second.policyHash, first.policyHash);
    assert.equal(r.policyOf(SID.toUpperCase().replace("0X", "0x"))?.lambda, 0.6, "kunci tidak peka huruf besar-kecil");
  });

  it("hash kebijakan = keccak256 dari JSON yang disimpan, dan berbeda bila kebijakan berbeda", () => {
    const r = repo();
    const a = r.lockPolicy({ sessionId: SID, journalId: 1, policy: resolvePolicy({ preset: "Balanced", lambda: 0.6 }) });
    assert.equal(a.policyHash, keccak256(enc.encode(a.policyJson)));
    const b = r.lockPolicy({ sessionId: h(2), journalId: 1, policy: resolvePolicy({ preset: "Balanced", lambda: 0.5 }) });
    assert.notEqual(a.policyHash, b.policyHash);
  });

  it("tingkat reputasi: satu pernyataan per pseudonim", () => {
    const r = repo();
    assert.equal(r.recordTier(SID, addr(1), 2), true);
    assert.equal(r.recordTier(SID, addr(1), 4), false, "tidak bisa dinaikkan setelah dinyatakan");
    assert.equal(r.tierOf(SID, addr(1)), 2);
    assert.equal(r.tierOf(SID, addr(2)), undefined);
  });

  it("antrian klaim: nullifier unik, penanda minted mengeluarkan dari antrian", () => {
    const r = repo();
    const c = (n: number) => ({ reputationId: h(n), amount: 25n * 10n ** 16n, nullifier: h(0x40 + n), proof: "0x00" as Hex });
    assert.equal(r.queueClaim(c(1)), true);
    assert.equal(r.queueClaim(c(1)), false);
    assert.equal(r.queueClaim(c(2)), true);
    const pending = r.pendingClaims();
    assert.equal(pending.length, 2);
    r.markMinted([pending[0].id], h(9));
    assert.equal(r.pendingClaims().length, 1);
  });
});

// ===================================================================== gerbang

describe("EscrowGate", () => {
  const gate = (state: number, required: boolean) =>
    new EscrowGate(testConfig({ escrowRequired: required }), { escrow: async () => ({ stateValue: state }) } as never);

  it("ESCROW_REQUIRED: tanpa APC terikat berhenti; terikat, kredit, dan tak ada escrow ditentukan keadaan", async () => {
    const none = await gate(0, true).check(SID);
    assert.equal(none.proceed, false);
    assert.match((none as { reason: string }).reason, /APC/);
    assert.equal((await gate(1, true).check(SID)).proceed, true);
    assert.equal((await gate(2, true).check(SID)).proceed, true, "sesudah dikreditkan, sesi final boleh terus (publikasi)");
  });

  it("tanpa ESCROW_REQUIRED: sesi tanpa escrow berjalan seperti M3-M5", async () => {
    assert.equal((await gate(0, false).check(SID)).proceed, true);
  });

  it("setelah refund sesi dihentikan di kedua mode", async () => {
    for (const required of [true, false]) {
      const v = await gate(3, required).check(SID);
      assert.equal(v.proceed, false);
      assert.equal((v as { refunded: boolean }).refunded, true);
    }
  });
});

// ============================================================= penyelesaian insentif

interface Reviewer {
  pseudonym: Address;
  slot: number;
  commitAt: number;
  text: string;
}

function memoryStorage(): StorageProvider & { blobs: Map<string, Uint8Array> } {
  const blobs = new Map<string, Uint8Array>();
  return {
    blobs,
    cidOf: async (b: Uint8Array) => rawCidOf(b),
    put: async (b: Uint8Array) => {
      const cid = await rawCidOf(b);
      blobs.set(cid, b);
      return { cid, size: b.length };
    },
    get: async (cid: string) => {
      const b = blobs.get(cid);
      if (!b) throw new Error(`CID ${cid} tidak ada`);
      return b;
    },
    stat: async (cid: string) => (blobs.has(cid) ? { size: blobs.get(cid)!.length } : null),
  } as never;
}

function settleWorld(over: { escrowState?: number; distributable?: boolean; executed?: boolean; count?: number; batchAt?: number } = {}) {
  const db = new DatabaseService({ dbPath: ":memory:" });
  const repo = new IncentiveRepository(db);
  const storage = memoryStorage();
  const writes: { contract: string; fn: string; args: any[] }[] = [];
  const credits = new Map<string, bigint>();
  const count = over.count ?? 3;

  const reviewers: Reviewer[] = Array.from({ length: count }, (_, i) => ({
    pseudonym: addr(0x100 + i),
    slot: 1 + Math.floor(i / 10), // batch baru tiap 10 baris, untuk menguji batas
    commitAt: (over.batchAt ?? 1000) + (i + 1) * 86_400,
    text: i === 0 ? "Sebaiknya tambahkan baseline pada Tabel 2. Perlu diperjelas metrik di halaman 3." : "Naskah ini bagus sekali.",
  }));

  let metaCid = "";
  const ready = (async () => {
    const meta = enc.encode(JSON.stringify({ title: "Judul", abstract: "baseline metrik evaluasi", keywords: ["a"] }));
    metaCid = (await storage.put(meta, "meta.json")).cid;
    for (const r of reviewers) {
      (r as Reviewer & { uri: string }).uri = `ipfs://${(await storage.put(enc.encode(JSON.stringify({ text: r.text })), "review.json")).cid}`;
    }
  })();

  const chain = {
    write: async (_signer: string, contract: string, fn: string, args: any[]) => {
      writes.push({ contract, fn, args });
      if (fn === "executeDistribution") {
        // Meniru kredit kontrak memakai model referensi supaya pemeriksaan silang bisa lolos.
        const { distributeFixed } = await import("@decpub/incentive-core");
        const input = args[0];
        const d = distributeFixed(input.matrix, input.weights, APC);
        input.pseudonyms.forEach((p: Address, i: number) => credits.set(p.toLowerCase(), d.amounts[i]));
      }
      return { txHash: h(0xee), blockNumber: 5 };
    },
  };
  const reader = {
    latestBatchNumber: async () => Math.ceil(count / 10) || 1,
    getSession: async () => ({ metadataURI: `ipfs://${metaCid}` }),
    batch: async (_s: Hex, b: number) => ({ batch: b, recordedAt: over.batchAt ?? 1000 }),
    commitRecord: async (_s: Hex, p: Address) => ({ committedAt: reviewers.find((r) => r.pseudonym === p)!.commitAt }),
    revealRecord: async (_s: Hex, p: Address) => ({ reviewURI: (reviewers.find((r) => r.pseudonym === p) as Reviewer & { uri: string }).uri }),
  };
  const ireader = {
    escrow: async () => ({ stateValue: over.escrowState ?? 1, state: "Bound", amount: APC }),
    distribution: async () => ({ executed: over.executed ?? false }),
    distributable: async () => over.distributable ?? true,
    rewardCredit: async (_s: Hex, p: Address) => credits.get(p.toLowerCase()) ?? 0n,
  };
  const rounds = {
    revealed: async () => reviewers.map((r) => ({ pseudonym: r.pseudonym, invite: { slot: r.slot, userId: "u" } })),
  };
  const journals = { get: () => ({ weightPolicy: { preset: "Balanced", lambda: 0.6 } }) };
  const manuscripts = { bySession: () => ({ journalId: 1 }) };
  const svc = new IncentiveService(
    testConfig(),
    storage,
    new SimulatedQoSProvider(),
    chain as never,
    reader as never,
    ireader as never,
    rounds as never,
    repo,
    journals as never,
    manuscripts as never,
  );
  return { svc, repo, storage, writes, reviewers, ready, credits };
}

describe("IncentiveService.settle", () => {
  it("dilewati: tanpa escrow, sudah dikreditkan, sudah didistribusikan, atau belum memenuhi syarat", async () => {
    for (const [over, why] of [
      [{ escrowState: 0 }, /tidak ada escrow/],
      [{ escrowState: 2 }, /Bound|escrow/],
      [{ executed: true }, /sudah didistribusikan/],
      [{ distributable: false }, /belum memenuhi syarat/],
    ] as const) {
      const w = settleWorld(over);
      await w.ready;
      const r = await w.svc.settle(SID);
      assert.equal(r.outcome, "skipped");
      assert.match((r as { reason: string }).reason, why);
      assert.equal(w.writes.length, 0, "tidak ada transaksi");
    }
  });

  it("mendistribusikan: matriks dan pseudonim dari reveal, hash laporan = hash yang dikirim ke kontrak", async () => {
    const w = settleWorld();
    await w.ready;
    w.repo.lockPolicy({ sessionId: SID, journalId: 1, policy: resolvePolicy({ preset: "Actionability-First", lambda: 0.4 }) });
    const r = await w.svc.settle(SID);
    assert.equal(r.outcome, "distributed");
    const tx = w.writes.find((x) => x.fn === "executeDistribution")!;
    assert.equal(tx.contract, "IncentiveEngine");
    const input = tx.args[0];
    assert.equal(input.pseudonyms.length, 3);
    assert.equal(input.matrix.length, 3);
    assert.equal((input.weights as bigint[]).reduce((a, b) => a + b, 0n), 10n ** 18n);

    const stored = w.storage.blobs.get((r as { reportCid: string }).reportCid)!;
    assert.equal(keccak256(stored), input.qosReportHash, "laporan di storage = hash yang masuk transaksi");
    const report = JSON.parse(new TextDecoder().decode(stored));
    assert.equal(report.policy.preset, "Actionability-First", "memakai kebijakan TERKUNCI, bukan kebijakan jurnal saat ini");
    assert.equal(input.policyHash, w.repo.policyOf(SID)!.policyHash);
    assert.equal((r as { matchesModel: boolean }).matchesModel, true);
    assert.deepEqual(report.onchainInput.pseudonyms, input.pseudonyms);
    assert.equal(report.expected.rewardsWei.reduce((a: bigint, x: string) => a + BigInt(x), 0n), APC);
  });

  it("q1 dari selisih timestamp commit dan pencatatan batch (hari), q4 dari tingkat tersimpan, q3 dari penanda Indonesia", async () => {
    const w = settleWorld();
    await w.ready;
    w.repo.recordTier(SID, w.reviewers[0].pseudonym, 3);
    const r = await w.svc.settle(SID);
    const report = JSON.parse(new TextDecoder().decode(w.storage.blobs.get((r as { reportCid: string }).reportCid)!));
    assert.deepEqual(report.rows.map((x: { q1Days: number }) => x.q1Days), [1, 2, 3]);
    assert.deepEqual(report.rows.map((x: { tier: number }) => x.tier), [3, 0, 0]);
    assert.equal(report.rows[0].q4, 0.75);
    assert.equal(report.rows[0].q3, 1, "dua kalimat saran + rujukan lokasi");
    assert.equal(report.rows[1].q3, 0);
    assert.ok(report.rows[0].q2 > report.rows[1].q2, "ulasan yang menyebut istilah abstrak lebih relevan");
  });

  it("tanpa kebijakan terkunci: kebijakan jurnal dikunci saat penyelesaian dan ditandai terlambat", async () => {
    const w = settleWorld();
    await w.ready;
    const r = await w.svc.settle(SID);
    const report = JSON.parse(new TextDecoder().decode(w.storage.blobs.get((r as { reportCid: string }).reportCid)!));
    assert.equal(w.repo.policyOf(SID)!.lockedLate, true);
    assert.ok(report.notes.some((n: string) => /dikunci saat penyelesaian/.test(n)));
  });

  it("lebih dari 10 pseudonim reveal: 10 terbaru dihitung dan sisanya dicatat di laporan (batas kontrak D2)", async () => {
    const w = settleWorld({ count: 13 });
    await w.ready;
    const r = await w.svc.settle(SID);
    assert.equal((r as { reviewers: number }).reviewers, MAX_REVIEWERS_PER_SESSION);
    const report = JSON.parse(new TextDecoder().decode(w.storage.blobs.get((r as { reportCid: string }).reportCid)!));
    const sent: Address[] = report.onchainInput.pseudonyms;
    assert.ok(!sent.includes(w.reviewers[0].pseudonym), "yang terlama dikecualikan");
    assert.ok(sent.includes(w.reviewers[12].pseudonym));
    assert.ok(report.notes.some((n: string) => n.includes("hanya 10 terbaru")));
  });

  it("satu penelaah yang reveal menerima seluruh escrow", async () => {
    const w = settleWorld({ count: 1 });
    await w.ready;
    const r = await w.svc.settle(SID);
    assert.equal((r as { matchesModel: boolean }).matchesModel, true);
    assert.equal(w.credits.get(w.reviewers[0].pseudonym.toLowerCase()), APC);
  });
});

describe("QoS provider", () => {
  it("hanya 'simulated' yang tersedia", () => {
    assert.ok(createQosProvider({ qosProvider: "simulated" }));
    assert.throws(() => createQosProvider({ qosProvider: "local" }), /belum didukung/);
  });
});

// ================================================================== reputasi

describe("ReputationService", () => {
  function world() {
    const db = new DatabaseService({ dbPath: ":memory:" });
    const repo = new IncentiveRepository(db);
    const writes: { fn: string; args: any[] }[] = [];
    const rejectNullifiers = new Set<string>();
    const chain = {
      write: async (_s: string, _c: string, fn: string, args: any[]) => {
        writes.push({ fn, args });
        const claims = args[0] as { nullifier: Hex }[];
        if (claims.some((c) => rejectNullifiers.has(c.nullifier))) {
          throw Object.assign(new Error("revert"), { response: { revert: "ExceedsUnclaimed" } });
        }
        return { txHash: h(0xa0 + writes.length), blockNumber: 1 };
      },
    };
    let proofOk = true;
    const ephemeral = { exists: true, revoked: false, role: "Reviewer", sessionId: SID };
    const reader = { verifyProof: async () => proofOk, ephemeral: async () => ephemeral };
    const ireader = {
      distribution: async () => ({ executed: false }),
      reputationClaimStep: async () => 25n * 10n ** 16n,
      reputationNullifierUsed: async () => false,
    };
    const svc = new ReputationService(chain as never, reader as never, ireader as never, repo, (items) => [...items].reverse());
    return { svc, repo, writes, rejectNullifiers, setProof: (v: boolean) => (proofOk = v), ephemeral };
  }
  const claim = (n: number, amount = 25n * 10n ** 16n) => ({ reputationId: h(n & 0xff), amount, nullifier: ("0x" + n.toString(16).padStart(64, "0")) as Hex, proof: "0x00" as Hex });

  it("tingkat: hanya Reviewer di sesi yang sama, sekali per pseudonim, bukti harus sah", async () => {
    const w = world();
    const base = { sessionId: SID, pseudonym: addr(7) as Hex, tier: 2, nullifier: h(1), proof: "0x00" as Hex };
    assert.deepEqual(await w.svc.recordTier(base), { sessionId: SID, pseudonym: addr(7), tier: 2, q4: 0.5 });
    await assert.rejects(() => w.svc.recordTier(base), /sudah menyatakan/);
    w.setProof(false);
    await assert.rejects(() => w.svc.recordTier({ ...base, pseudonym: addr(8) as Hex }), /tidak sah/);
    w.setProof(true);
    w.ephemeral.role = "Author";
    await assert.rejects(() => w.svc.recordTier({ ...base, pseudonym: addr(9) as Hex }), /bukan Reviewer/);
    w.ephemeral.role = "Reviewer";
    w.ephemeral.sessionId = h(0x99);
    await assert.rejects(() => w.svc.recordTier({ ...base, pseudonym: addr(9) as Hex }), /bukan Reviewer/);
  });

  it("klaim: jumlah harus kelipatan 0,25, bukti sah, tidak ganda", async () => {
    const w = world();
    await assert.rejects(() => w.svc.queueClaim(claim(1, 10n ** 17n)), /kelipatan/);
    await assert.rejects(() => w.svc.queueClaim(claim(1, 0n)), /kelipatan/);
    w.setProof(false);
    await assert.rejects(() => w.svc.queueClaim(claim(1)), /tidak sah/);
    w.setProof(true);
    assert.deepEqual(await w.svc.queueClaim(claim(1)), { queued: true, pending: 1 });
    await assert.rejects(() => w.svc.queueClaim(claim(1)), /sudah ada di antrian/);
  });

  it("epoch: klaim diacak, dikirim berkelompok per MINT_CHUNK, antrian kosong sesudahnya", async () => {
    const w = world();
    for (let i = 1; i <= MINT_CHUNK * 2 + 5; i++) await w.svc.queueClaim(claim(i));
    const r = await w.svc.flushEpoch();
    assert.equal(r.minted, MINT_CHUNK * 2 + 5);
    assert.equal(r.transactions.length, 3);
    assert.deepEqual(w.writes.map((x) => x.args[0].length), [MINT_CHUNK, MINT_CHUNK, 5]);
    // pengacak uji membalik urutan: klaim terakhir diajukan menjadi yang pertama dikirim
    assert.equal(w.writes[0].args[0][0].nullifier, claim(MINT_CHUNK * 2 + 5).nullifier);
    assert.equal(w.repo.pendingClaims().length, 0);
    await assert.rejects(() => w.svc.flushEpoch(), /Tidak ada klaim/);
  });

  it("epoch: satu klaim buruk tidak menggagalkan yang lain (dicoba satu per satu, yang ditolak dibuang)", async () => {
    const w = world();
    for (let i = 1; i <= 4; i++) await w.svc.queueClaim(claim(i));
    w.rejectNullifiers.add(claim(3).nullifier);
    const r = await w.svc.flushEpoch();
    assert.equal(r.minted, 3);
    assert.deepEqual(r.rejected.map((x) => x.nullifier), [claim(3).nullifier]);
    assert.equal(r.rejected[0].reason, "ExceedsUnclaimed");
    assert.equal(w.repo.pendingClaims().length, 0, "yang ditolak dibuang dari antrian, bukan menggantung");
  });
});

// ======================================================= penutupan sesi setelah refund

describe("ProgressService.closeAfterRefund", () => {
  function setup(status: number) {
    const calls: { fn: string; args: unknown[] }[] = [];
    const gateway = new Proxy({} as Record<string, unknown>, {
      get: (_t, fn: string) => async (...args: unknown[]) => {
        calls.push({ fn, args });
        return { txHash: h(1), blockNumber: 1 };
      },
    }) as never;
    const reader = { getSession: async () => ({ statusValue: status, status: String(status) }) };
    const p = new ProgressService(gateway, reader as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    return { p, calls };
  }
  const S = PublicationStatus;

  it("status yang punya transisi ke Rejected langsung ditutup", async () => {
    for (const st of [S.UnderEditorialScreening, S.UnderReview, S.Incomplete, S.Submitted]) {
      const { p, calls } = setup(st);
      const actions = await p.closeAfterRefund(SID);
      assert.deepEqual(calls.map((c) => c.args[1]), [S.Rejected], `status ${st}`);
      assert.match(actions[0], /ditutup/);
    }
  });

  it("AssigningReviewers lewat UnderReview (kontrak hanya mengizinkan itu)", async () => {
    const { p, calls } = setup(S.AssigningReviewers);
    await p.closeAfterRefund(SID);
    assert.deepEqual(calls.map((c) => c.args[1]), [S.UnderReview, S.Rejected]);
  });

  it("status revisi tidak punya jalur: tidak ada transaksi, dicatat", async () => {
    for (const st of [S.MinorRevisionRequired, S.MajorRevisionRequired]) {
      const { p, calls } = setup(st);
      const actions = await p.closeAfterRefund(SID);
      assert.equal(calls.length, 0);
      assert.match(actions[0], /tidak bisa ditutup/);
    }
  });

  it("status final dibiarkan", async () => {
    for (const st of [S.Rejected, S.Published, S.Accepted]) {
      const { p, calls } = setup(st);
      assert.deepEqual(await p.closeAfterRefund(SID), []);
      assert.equal(calls.length, 0);
    }
  });
});
