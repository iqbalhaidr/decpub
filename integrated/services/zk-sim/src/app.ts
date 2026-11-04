/**
 * [SIMULASI] zk-sim: attestor bukti ZK.
 *
 *   POST /prove    {kind, witness, publicSignals} -> ZkProof  (422 bila witness tidak memenuhi relasi)
 *   POST /verify   {kind, publicSignals, proof}   -> {valid}  (pemeriksaan di luar chain)
 *   GET  /info     konfigurasi publik (attestor, verifier, chain)
 *   GET  /healthz
 *
 * Witness hanya hidup di memori selama satu permintaan: tidak disimpan, tidak dicatat,
 * tidak ikut pesan galat. Ini simulasi: layanan ini MELIHAT witness, jadi tidak zero-knowledge.
 * Pengganti nyata: prover snarkjs di browser + verifier sirkuit (`ActionGateway.setVerifier`).
 */
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { isHex, recoverMessageAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { proofDigest, signProof, type ZkProof } from "@decpub/shared";
import { SUPPORTED_KINDS, ZkCheckError, checkWitness, isKnownKind, type ChainReader } from "./checks.js";

export interface ZkSimOptions {
  attestorPrivateKey: Hex;
  chainId: number;
  /** Alamat `SimulatedZkVerifier` (bagian dari domain tanda tangan). */
  verifier: Address;
  /** Penerbit kredensial yang dipercaya. */
  issuer: Address;
  chain: ChainReader;
}

const isBytes32 = (v: unknown): v is Hex => typeof v === "string" && isHex(v, { strict: true }) && v.length === 66;

export function createZkApp(opts: ZkSimOptions): Express {
  const attestor = privateKeyToAccount(opts.attestorPrivateKey).address;
  const ctx = { chain: opts.chain, issuer: opts.issuer };

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, service: "zk-sim", scheme: "simulated" });
  });

  app.get("/info", (_req, res) => {
    res.json({
      label: "[SIMULASI] bukan zero-knowledge: attestor melihat witness",
      scheme: "simulated",
      attestor,
      issuer: opts.issuer,
      chainId: opts.chainId,
      verifier: opts.verifier,
      supportedKinds: SUPPORTED_KINDS,
    });
  });

  app.post("/prove", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { kind, witness, publicSignals } = (req.body ?? {}) as Record<string, unknown>;
      if (!isKnownKind(kind)) throw new ZkCheckError("BAD_REQUEST", "kind tidak dikenal", 400);
      if (!Array.isArray(publicSignals) || !publicSignals.every(isBytes32)) {
        throw new ZkCheckError("BAD_REQUEST", "publicSignals harus larik bytes32 hex", 400);
      }
      await checkWitness(kind, witness, publicSignals, ctx);
      const proof: ZkProof = await signProof(opts.attestorPrivateKey, opts.chainId, opts.verifier, kind, publicSignals);
      res.json(proof);
    } catch (e) {
      next(e);
    }
  });

  app.post("/verify", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { kind, publicSignals, proof } = (req.body ?? {}) as Record<string, unknown>;
      if (!isKnownKind(kind)) throw new ZkCheckError("BAD_REQUEST", "kind tidak dikenal", 400);
      if (!Array.isArray(publicSignals) || !publicSignals.every(isBytes32)) {
        throw new ZkCheckError("BAD_REQUEST", "publicSignals harus larik bytes32 hex", 400);
      }
      if (typeof proof !== "string" || !isHex(proof)) throw new ZkCheckError("BAD_REQUEST", "proof harus hex", 400);
      let valid = false;
      try {
        const signer = await recoverMessageAddress({
          message: { raw: proofDigest(opts.chainId, opts.verifier, kind, publicSignals) },
          signature: proof,
        });
        valid = signer.toLowerCase() === attestor.toLowerCase();
      } catch {
        valid = false;
      }
      res.json({ valid });
    } catch (e) {
      next(e);
    }
  });

  // Penangan galat: hanya kode dan pesan aman. Tidak ada isi permintaan yang dicatat.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZkCheckError) {
      res.status(err.status).json({ error: err.code, message: err.message });
      return;
    }
    const type = (err as { type?: string }).type;
    if (type === "entity.parse.failed" || type === "entity.too.large") {
      res.status(400).json({ error: "BAD_REQUEST", message: "badan permintaan bukan JSON sah atau terlalu besar" });
      return;
    }
    console.error("[zk-sim] galat tak terduga:", (err as Error)?.name ?? "Error");
    res.status(500).json({ error: "INTERNAL", message: "galat internal" });
  });

  return app;
}
