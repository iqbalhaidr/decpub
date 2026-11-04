/**
 * Express API Server — OJS Incentive Mechanism
 *
 * Endpoints:
 *   POST /api/pipeline       - Run single middleware pipeline
 *   POST /api/scenarios      - Run all scenario evaluations
 *   POST /api/baselines      - Run baseline comparison
 *   POST /api/multicycle     - Run multi-cycle simulation
 *   POST /api/onchain/deploy - Deploy contracts to local network
 *   POST /api/onchain/execute - Execute on-chain distribution
 *   GET  /                   - Serve dashboard UI
 *
 * Run: npx ts-node server/index.ts
 */

import "dotenv/config"; // muat .env sebelum membaca process.env (mis. DEMO_REVIEWERS)
import express from "express";
import cors from "cors";
import path from "path";

import {
  normalize,
  CriterionType,
  computeBWM,
  computeECWM,
  computeECWMDetail,
  fuseWeights,
  topsis,
  distribute,
  BWMInput,
  SigmoidParams,
  createProvider,
  buildQoSMatrix,
  extractAbstract,
  extractTitle,
  QoSProvider,
  ReviewerSubmission,
} from "../middleware";
import {
  CRITERIA_TYPES,
  DEFAULT_BWM,
  giniCoefficient,
  differentiationRatio,
  rankArray,
  spearmanCorrelation,
  runPipeline,
  runBaselines,
  runMulticycle,
} from "../eval/core";

// Pilih jaringan on-chain tanpa perlu set env var manual:
//   npm run server:sepolia   -> Sepolia (testnet publik)
//   npm run server           -> Hardhat lokal (in-process)
// (hardhat di-require secara lazy di endpoint, jadi menetapkan env di sini sudah cukup)
if (!process.env.HARDHAT_NETWORK && (process.argv.includes("--sepolia") || process.env.NETWORK === "sepolia")) {
  process.env.HARDHAT_NETWORK = "sepolia";
}
console.log(`[server] jaringan on-chain: ${process.env.HARDHAT_NETWORK || "hardhat (lokal in-process)"}`);

// Reviewer demo tetap (memudahkan demo: author tinggal pakai daftar ini, reviewer
// bisa "act as" tanpa perlu 4 akun MetaMask). Override via .env DEMO_REVIEWERS.
const DEMO_REVIEWERS: string[] = (process.env.DEMO_REVIEWERS ||
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8,0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,0x90F79bf6EB2c4f870365E785982E1f101E93b906,0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"
).split(",").map((s) => s.trim()).filter(Boolean);

// Deadline default review (hari) — kebijakan jurnal/editorial (konteks q1 timeliness).
// Enforcement (refund/no-show) di luar lingkup riset; di demo dipakai sebagai default.
const DEFAULT_DEADLINE_DAYS = Number(process.env.DEFAULT_DEADLINE_DAYS || 14);

// Preset BWM (strategi editorial) — sesuai Tabel "Preset Konfigurasi BWM" di skripsi.
// Kriteria berurut [q1 timeliness, q2 relevansi, q3 actionability, q4 reputasi].
// Vektor Best-to-Others & Others-to-Worst disusun konsisten (a_Bj·a_jW = a_BW -> CR≈0).
const BWM_PRESETS: Record<string, {
  key: string; label: string; best: string; worst: string; interpretation: string;
  bestIndex: number; worstIndex: number; bestToOthers: number[]; othersToWorst: number[];
}> = {
  balanced:      { key: "balanced",      label: "Balanced",            best: "q3", worst: "q4", interpretation: "Distribusi bobot relatif merata; actionability sedikit diprioritaskan.", bestIndex: 2, worstIndex: 3, bestToOthers: [2, 2, 1, 4], othersToWorst: [2, 2, 4, 1] },
  actionability: { key: "actionability", label: "Actionability-First", best: "q3", worst: "q1", interpretation: "Keterterapan saran menjadi kriteria dominan; kecepatan paling rendah.", bestIndex: 2, worstIndex: 0, bestToOthers: [8, 4, 1, 2], othersToWorst: [1, 2, 8, 4] },
  speed:         { key: "speed",         label: "Speed-First",         best: "q1", worst: "q4", interpretation: "Respons cepat diprioritaskan; sesuai jurnal fast-track.", bestIndex: 0, worstIndex: 3, bestToOthers: [1, 3, 3, 6], othersToWorst: [6, 2, 2, 1] },
  depth:         { key: "depth",         label: "Depth-First",         best: "q2", worst: "q1", interpretation: "Kedalaman telaah sebagai prioritas utama; kecepatan paling rendah.", bestIndex: 1, worstIndex: 0, bestToOthers: [8, 1, 2, 4], othersToWorst: [1, 8, 4, 2] },
  reputation:    { key: "reputation",    label: "Reputation-First",    best: "q4", worst: "q1", interpretation: "Rekam jejak historis mendominasi; mendorong konsistensi jangka panjang.", bestIndex: 3, worstIndex: 0, bestToOthers: [8, 4, 2, 1], othersToWorst: [1, 2, 4, 8] },
};

// Tentukan input BWM dari request: bwm manual (lanjutan) > preset > default Balanced.
function resolveBwm(body: any): { input: BWMInput; presetKey: string | null } {
  if (body?.bwm && Array.isArray(body.bwm.bestToOthers) && Array.isArray(body.bwm.othersToWorst)) {
    return { input: body.bwm, presetKey: null };
  }
  const p = BWM_PRESETS[body?.preset] || BWM_PRESETS.balanced;
  return { input: { bestIndex: p.bestIndex, worstIndex: p.worstIndex, bestToOthers: p.bestToOthers, othersToWorst: p.othersToWorst }, presetKey: p.key };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" })); // allow PDF uploads (base64) for paper ingestion
app.use(express.static(path.join(__dirname, "..", "public")));

// ================================================================
// SHARED TYPES & HELPERS
// ================================================================

// Evaluation orchestration + metric helpers (CRITERIA_TYPES, giniCoefficient,
// differentiationRatio, rankArray, spearmanCorrelation, runPipeline,
// runBaselines, runMulticycle) now live in ../eval/core so the server and the
// headless evaluation harness share exactly one implementation.

// ================================================================
// QoS PRE-PROCESSING ENDPOINT (Fase 1a — AI model for q2, q3)
// ================================================================
//
// Derives q2 (relevance) and q3 (actionability) from raw review/paper TEXT
// using a pre-trained language model (inference-only). q1 (days-to-submit) and
// q4 (SBT balance) are non-textual and pass through unchanged. The resulting
// matrix is the input to /api/pipeline.

// Provider is created once and reused across requests (avoids re-loading the model).
let qosProviderPromise: Promise<QoSProvider> | null = null;
function getQosProvider(): Promise<QoSProvider> {
  if (!qosProviderPromise) qosProviderPromise = createProvider();
  return qosProviderPromise;
}

// Paper ingestion: accept submitted paper text (or a PDF as base64) and extract
// the abstract deterministically. The abstract becomes the paperText for q2.
app.post("/api/paper", async (req, res) => {
  try {
    let { text, pdfBase64 } = req.body as { text?: string; pdfBase64?: string };
    let usedPdf = false;

    if ((!text || !text.trim()) && typeof pdfBase64 === "string" && pdfBase64.length > 0) {
      // Optional dependency, lazily imported via an indirect specifier.
      const moduleId = "pdf-parse";
      let pdfParse: (buf: Buffer) => Promise<{ text: string }>;
      try {
        const mod: any = await import(moduleId);
        pdfParse = mod.default ?? mod;
      } catch {
        res.status(400).json({
          error:
            "PDF parsing requires the optional dependency 'pdf-parse' (npm install pdf-parse). Paste the paper text instead.",
        });
        return;
      }
      const base64 = pdfBase64.replace(/^data:.*;base64,/, "");
      const parsed = await pdfParse(Buffer.from(base64, "base64"));
      text = parsed.text;
      usedPdf = true;
    }

    if (typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "Provide paper text or a PDF (pdfBase64)." });
      return;
    }

    const abstract = extractAbstract(text);
    const title = extractTitle(text);
    res.json({ abstract, title, fullTextChars: text.length, usedPdf });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/qos", async (req, res) => {
  try {
    const { paperText, submissions } = req.body;
    if (typeof paperText !== "string" || !Array.isArray(submissions)) {
      res.status(400).json({ error: "Expected { paperText: string, submissions: [...] }" });
      return;
    }
    const subs: ReviewerSubmission[] = submissions.map((s: any) => ({
      reviewer: String(s.reviewer ?? ""),
      reviewText: String(s.reviewText ?? ""),
      daysToSubmit: Number(s.daysToSubmit ?? 0),
      sbtBalance: Number(s.sbtBalance ?? 0),
    }));
    const provider = await getQosProvider();
    const { matrix, rows } = await buildQoSMatrix(subs, paperText, provider);
    res.json({ provider: provider.name, matrix, rows });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ================================================================
// PIPELINE ENDPOINT
// ================================================================

app.post("/api/pipeline", (req, res) => {
  try {
    const { matrix, ...opts } = req.body;
    res.json(runPipeline(matrix, opts));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ================================================================
// SCENARIOS ENDPOINT
// ================================================================

const SCENARIOS = [
  {
    id: "S1", name: "Normal Distribution",
    description: "5 reviewers with varied but reasonable performance",
    thesisRef: "Baseline",
    reviewers: ["Alice", "Bob", "Charlie", "Diana", "Eve"],
    matrix: [[3,8.5,0.90,5],[7,5.0,0.65,3],[5,6.5,0.75,4],[2,9.0,0.85,6],[4,7.0,0.80,2]],
  },
  {
    id: "S2", name: "Free-Rider Detection",
    description: "1 free-rider (fast but shallow) among 4 normal reviewers",
    thesisRef: "M1, M3",
    reviewers: ["HighPerf", "FreeRider", "Average1", "Average2", "Average3"],
    matrix: [[2,9.0,0.92,5],[1,1.5,0.50,1],[5,6.0,0.70,3],[6,5.5,0.68,3],[5,6.5,0.72,4]],
  },
  {
    id: "S3", name: "Cold-Start",
    description: "New reviewer (q4=0) with better q1-q3 vs veteran with high q4",
    thesisRef: "M4",
    reviewers: ["Veteran", "Newcomer", "Mid1", "Mid2", "Mid3"],
    matrix: [[4,7.0,0.80,10],[3,8.0,0.88,0],[5,6.0,0.70,5],[6,5.5,0.65,4],[5,6.5,0.72,6]],
  },
  {
    id: "S4", name: "Sybil Resistance",
    description: "Inflated q3 (self-accept) but low depth and no reputation",
    thesisRef: "M4",
    reviewers: ["Honest1", "Honest2", "Sybil", "Honest3", "Honest4"],
    matrix: [[3,8.0,0.82,7],[4,7.5,0.78,6],[2,2.5,0.95,0],[5,7.0,0.75,5],[4,7.5,0.80,6]],
  },
  {
    id: "S5", name: "Clustered Performance",
    description: "All reviewers nearly identical — tests differentiation",
    thesisRef: "M1",
    reviewers: ["R1", "R2", "R3", "R4", "R5"],
    matrix: [[5,6.8,0.74,4],[5,7.0,0.75,4],[4,7.2,0.76,5],[5,6.9,0.73,4],[6,6.7,0.74,4]],
  },
];

app.post("/api/scenarios", (req, res) => {
  try {
    const {
      bwm = { bestIndex: 2, worstIndex: 3, bestToOthers: [2, 2, 1, 4], othersToWorst: [2, 2, 4, 1] },
      lambda = 0.6, gamma = 0.5,
      sigmoid = { k: 10, x0: 0.5 }, pool = 2.0,
    } = req.body || {};

    const results = SCENARIOS.map(scenario => {
      const normalized = normalize(scenario.matrix, CRITERIA_TYPES);
      const bwmResult = computeBWM(bwm);
      const ecwmWeights = computeECWM(normalized, gamma);
      const weights = fuseWeights(bwmResult.weights, ecwmWeights, lambda);
      const topsisResult = topsis(normalized, weights, CRITERIA_TYPES);
      const distResult = distribute(topsisResult.scores, pool, sigmoid);

      return {
        ...scenario,
        normalized,
        weights,
        topsisScores: topsisResult.scores,
        ranking: topsisResult.ranking,
        rewards: distResult.rewards,
        sigmoidValues: distResult.sigmoidValues,
        shares: distResult.shares,
        metrics: {
          gini: giniCoefficient(distResult.rewards),
          diffRatio: differentiationRatio(distResult.rewards),
        },
      };
    });

    res.json({ scenarios: results });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ================================================================
// BASELINES ENDPOINT
// ================================================================

app.post("/api/baselines", (req, res) => {
  try {
    const { matrix, ...opts } = req.body;
    res.json(runBaselines(matrix, opts));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ================================================================
// MULTI-CYCLE ENDPOINT
// ================================================================

app.post("/api/multicycle", (req, res) => {
  try {
    res.json(runMulticycle(req.body || {}));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ================================================================
// ON-CHAIN ENDPOINTS (using Hardhat runtime)
// ================================================================

let deployedContracts: any = null;

function requireDeployed(res: any) {
  if (!deployedContracts) {
    res.status(400).json({ error: "Deploy contracts first (POST /api/onchain/deploy)" });
    return null;
  }
  return deployedContracts;
}

app.post("/api/onchain/deploy", async (req, res) => {
  try {
    const hre = require("hardhat");
    const [deployer] = await hre.ethers.getSigners();

    const ReputationSBTFactory = await hre.ethers.getContractFactory("ReputationSBT");
    const reputationSBT = await ReputationSBTFactory.deploy(hre.ethers.parseEther("0.02"));
    await reputationSBT.waitForDeployment();

    const IncentiveEngineFactory = await hre.ethers.getContractFactory("IncentiveEngine");
    const incentiveEngine = await IncentiveEngineFactory.deploy(
      await reputationSBT.getAddress(),
      hre.ethers.parseEther("10"),
      hre.ethers.parseEther("0.5")
    );
    await incentiveEngine.waitForDeployment();

    const deployTx = incentiveEngine.deploymentTransaction();
    const deployReceipt = deployTx ? await deployTx.wait() : null;
    const deployedAtBlock = deployReceipt?.blockNumber ?? await hre.ethers.provider.getBlockNumber();

    // Transfer SBT ownership so IncentiveEngine can mint reputation tokens
    await reputationSBT.transferOwnership(await incentiveEngine.getAddress());

    deployedContracts = { reputationSBT, incentiveEngine, deployer, deployedAtBlock };

    res.json({
      success: true,
      addresses: {
        reputationSBT: await reputationSBT.getAddress(),
        incentiveEngine: await incentiveEngine.getAddress(),
        deployer: deployer.address,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/onchain/execute", async (req, res) => {
  try {
    const deps = requireDeployed(res);
    if (!deps) return;

    const hre = require("hardhat");
    const { matrix, bwm, lambda = 0.6, gamma = 0.5, pool = 2.0, journalName = "Untitled Journal" } = req.body;
    const { incentiveEngine, deployer } = deps;
    const signers = await hre.ethers.getSigners();
    const reviewerSigners = signers.slice(1, matrix.length + 1);

    // Run off-chain pipeline
    const normalized = normalize(matrix, CRITERIA_TYPES);
    const bwmResult = computeBWM(bwm || { bestIndex: 2, worstIndex: 3, bestToOthers: [2, 2, 1, 4], othersToWorst: [2, 2, 4, 1] });
    const ecwmWeights = computeECWM(normalized, gamma);
    const weights = fuseWeights(bwmResult.weights, ecwmWeights, lambda);
    const offChainTopsis = topsis(normalized, weights, CRITERIA_TYPES);
    const offChainDist = distribute(offChainTopsis.scores, pool, { k: 10, x0: 0.5 });

    // Convert for on-chain
    const onChainMatrix = normalized.map(row =>
      row.map(v => hre.ethers.parseEther(v.toFixed(18)))
    );
    const wSum = weights.reduce((a, b) => a + b, 0);
    const onChainWeights = weights.map(w => hre.ethers.parseEther((w / wSum).toFixed(18)));

    // Create batch
    const addrs = reviewerSigners.map((s: any) => s.address);
    const escrow = hre.ethers.parseEther(pool.toString());
    const tx1 = await incentiveEngine.connect(signers[0]).createBatch(addrs, journalName, { value: escrow });
    await tx1.wait();

    const batchId = Number(await incentiveEngine.nextBatchId()) - 1;

    // Execute distribution (synthetic pipeline: semua baris adalah peserta nyata)
    const participated = onChainMatrix.map(() => true);
    const tx2 = await incentiveEngine.executeDistribution(batchId, onChainMatrix, onChainWeights, participated);
    const receipt = await tx2.wait();
    const gasUsed = receipt.gasUsed.toString();

    // Extract rewards from events
    const iface = incentiveEngine.interface;
    const rewardEvents = receipt.logs
      .filter((log: any) => { try { return iface.parseLog({ topics: log.topics, data: log.data })?.name === "RewardDistributed"; } catch { return false; } })
      .map((log: any) => iface.parseLog({ topics: log.topics, data: log.data }));

    const onChainRewards = rewardEvents.map((e: any) => Number(hre.ethers.formatEther(e.args[2])));
    const onChainReputation = rewardEvents.map((e: any) => Number(hre.ethers.formatEther(e.args[3])));

    res.json({
      success: true,
      batchId,
      gasUsed,
      offChain: { scores: offChainTopsis.scores, rewards: offChainDist.rewards, ranking: offChainTopsis.ranking },
      onChain: { rewards: onChainRewards, reputation: onChainReputation },
      comparison: {
        rankingMatch: JSON.stringify(rankArray(onChainRewards)) === JSON.stringify(rankArray(offChainDist.rewards)),
        rewardCorrelation: spearmanCorrelation(rankArray(onChainRewards), rankArray(offChainDist.rewards)),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// HYBRID / TESTNET SUPPORT (Sepolia): attach to pre-deployed contracts, expose
// config to the frontend (author signs createBatch via MetaMask), and run an
// operator-signed distribution for a batch the author already created.
// Start the server bound to the target network, e.g.:
//   HARDHAT_NETWORK=sepolia npx ts-node server/index.ts
// ---------------------------------------------------------------------------

// Attach to contracts already deployed on the current network
// (deployments/<network>.json). Use this INSTEAD of /deploy for public testnets.
app.post("/api/onchain/attach", async (req, res) => {
  try {
    const hre = require("hardhat");
    const fs = require("fs");
    const file = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
    if (!fs.existsSync(file)) {
      res.status(400).json({ error: `No deployment file for network '${hre.network.name}'. Run: npm run deploy:sepolia:persist` });
      return;
    }
    const dep = JSON.parse(fs.readFileSync(file, "utf8"));
    const [operator] = await hre.ethers.getSigners();
    const reputationSBT = await hre.ethers.getContractAt("ReputationSBT", dep.reputationSBT);
    const incentiveEngine = await hre.ethers.getContractAt("IncentiveEngine", dep.incentiveEngine);
    deployedContracts = { reputationSBT, incentiveEngine, deployer: operator, deployedAtBlock: dep.deployedAtBlock };
    res.json({ success: true, network: hre.network.name, addresses: { reputationSBT: dep.reputationSBT, incentiveEngine: dep.incentiveEngine, operator: operator.address } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Config for the frontend: addresses + chainId + minimal ABI so the AUTHOR can
// call createBatch (deposit escrow) directly via MetaMask.
app.get("/api/onchain/config", async (req, res) => {
  try {
    const hre = require("hardhat");
    const fs = require("fs");
    const file = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
    const dep = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
    const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
    res.json({
      network: hre.network.name,
      chainId,
      demoReviewers: DEMO_REVIEWERS,
      deadlineDays: DEFAULT_DEADLINE_DAYS,
      incentiveEngine: dep?.incentiveEngine ?? null,
      reputationSBT: dep?.reputationSBT ?? null,
      bwmPresets: Object.values(BWM_PRESETS).map((p) => ({ key: p.key, label: p.label, best: p.best, worst: p.worst, interpretation: p.interpretation })),
      engineAbi: [
        "function createBatch(address[] reviewers, string journalName) payable",
        "function nextBatchId() view returns (uint256)",
        "event BatchCreated(uint256 indexed batchId, address author, uint256 amount, uint256 reviewerCount)",
      ],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Parameter SISTEM (read-only) yang di-bake saat deploy: sigmoid (k, x0) & laju
// peluruhan reputasi. Nilai optimal hasil analisis+evaluasi skripsi; bukan knob
// per-batch. Dibaca langsung dari rantai (fixed-point ×1e18).
app.get("/api/onchain/params", async (req, res) => {
  try {
    const deps = requireDeployed(res); if (!deps) return;
    const hre = require("hardhat");
    const { incentiveEngine, reputationSBT } = deps;
    const [k, x0, decay] = await Promise.all([
      incentiveEngine.sigmoidK(),
      incentiveEngine.sigmoidX0(),
      reputationSBT.decayRatePerDay(),
    ]);
    const f = (v: any) => Number(hre.ethers.formatEther(v));
    res.json({ success: true, sigmoidK: f(k), sigmoidX0: f(x0), decayRatePerDay: f(decay), gamma: 0.5 });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Operator-signed distribution for a batch the AUTHOR already created on-chain
// (hybrid demo). Body: { batchId, matrix, bwm?, lambda?, gamma? }.
app.post("/api/onchain/distribute", async (req, res) => {
  try {
    const deps = requireDeployed(res);
    if (!deps) return;
    const hre = require("hardhat");
    const { batchId, matrix, lambda = 0.6, gamma = 0.5, participated } = req.body;
    if (batchId === undefined || !Array.isArray(matrix)) {
      res.status(400).json({ error: "batchId and matrix are required" });
      return;
    }
    // Mask partisipasi opsional; default: semua baris dianggap peserta.
    const partMask: boolean[] = Array.isArray(participated) && participated.length === matrix.length
      ? participated.map((x: any) => !!x) : matrix.map(() => true);
    const { incentiveEngine } = deps;

    const normalized = normalize(matrix, CRITERIA_TYPES);
    const bwmResult = computeBWM(resolveBwm(req.body).input);
    const ecwmWeights = computeECWM(normalized, gamma);
    const weights = fuseWeights(bwmResult.weights, ecwmWeights, lambda);

    const onChainMatrix = normalized.map((row) => row.map((v) => hre.ethers.parseEther(v.toFixed(18))));
    const wSum = weights.reduce((a, b) => a + b, 0);
    const onChainWeights = weights.map((w) => hre.ethers.parseEther((w / wSum).toFixed(18)));

    const tx = await incentiveEngine.executeDistribution(batchId, onChainMatrix, onChainWeights, partMask);
    const receipt = await tx.wait();

    const iface = incentiveEngine.interface;
    const rewardEvents = receipt.logs
      .filter((log: any) => { try { return iface.parseLog({ topics: log.topics, data: log.data })?.name === "RewardDistributed"; } catch { return false; } })
      .map((log: any) => iface.parseLog({ topics: log.topics, data: log.data }));
    const onChainRewards = rewardEvents.map((e: any) => Number(hre.ethers.formatEther(e.args[2])));
    const onChainReputation = rewardEvents.map((e: any) => Number(hre.ethers.formatEther(e.args[3])));
    // TOPSIS scores computed ON-CHAIN, read from the BatchDistributed event (transparency).
    const distEvent = receipt.logs
      .map((log: any) => { try { return iface.parseLog({ topics: log.topics, data: log.data }); } catch { return null; } })
      .find((e: any) => e?.name === "BatchDistributed");
    const onChainScores = distEvent ? distEvent.args[1].map((s: any) => Number(hre.ethers.formatEther(s))) : [];

    invalidateHistory(); // distribusi baru -> history usang
    res.json({
      success: true,
      batchId: Number(batchId),
      txHash: tx.hash,
      gasUsed: receipt.gasUsed.toString(),
      onChain: { scores: onChainScores, rewards: onChainRewards, reputation: onChainReputation },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Riwayat lengkap semua batch distribusi dibaca dari on-chain (state + event).
// Metadata (escrow, nama jurnal, author, status) dari STATE agar bebas dari batas
// eth_getLogs; detail penerima/skor/imbalan dari event (RPC publik untuk rentang
// penuh, dengan fallback ter-chunk 10-blok bila RPC publik gagal).
// Cache in-memory history: hindari round-trip RPC berulang ke Sepolia. Aman karena
// SEMUA mutasi lewat server ini (submission baru + distribusi) meng-invalidate cache;
// TTL pendek sbg jaring pengaman. Paksa segar dengan ?fresh=1.
let historyCache: { at: number; data: any } | null = null;
const HISTORY_TTL_MS = 20000;
function invalidateHistory() { historyCache = null; }

app.get("/api/onchain/history", async (req, res) => {
  try {
    const deps = requireDeployed(res);
    if (!deps) return;
    const fresh = req.query.fresh === "1";
    if (!fresh && historyCache && Date.now() - historyCache.at < HISTORY_TTL_MS) {
      res.json({ ...historyCache.data, cached: true, ageMs: Date.now() - historyCache.at });
      return;
    }
    const hre = require("hardhat");
    const { JsonRpcProvider } = require("ethers");
    const { incentiveEngine } = deps;
    const iface = incentiveEngine.interface;
    const address = await incentiveEngine.getAddress();
    const toEth = (v: any) => Number(hre.ethers.formatEther(v));
    const fromB = deps.deployedAtBlock || 0;

    // Ambil log rentang PENUH via gateway publik yang mendukungnya (Alchemy free
    // membatasi eth_getLogs ke 10 blok; PublicNode kini menolak archive). Tenderly
    // gateway melayani rentang penuh (~0.6s). Fallback terakhir: chunk 10-blok Alchemy.
    const FULL_RANGE_RPCS = [
      "https://sepolia.gateway.tenderly.co",
      "https://ethereum-sepolia-rpc.publicnode.com",
    ];
    const fetchLogs = async (): Promise<any[]> => {
      for (const url of FULL_RANGE_RPCS) {
        try {
          const p = new JsonRpcProvider(url);
          return await p.getLogs({ address, fromBlock: fromB, toBlock: "latest" });
        } catch { /* coba provider berikutnya */ }
      }
      // Fallback: chunk 10-blok via Alchemy, paralel, hanya rentang wajar terakhir.
      const provider = hre.ethers.provider;
      const latest = await provider.getBlockNumber();
      const start0 = Math.max(fromB, latest - 10 * 300);
      const ranges: Array<[number, number]> = [];
      for (let s = start0; s <= latest; s += 10) ranges.push([s, Math.min(s + 9, latest)]);
      const chunks = await Promise.all(ranges.map(([s, e]) =>
        provider.getLogs({ address, fromBlock: s, toBlock: e }).catch(() => [])));
      return chunks.flat();
    };

    // Metadata batch dari STATE + log event dibaca PARALEL (bukan serial per-batch).
    const n = Number(await incentiveEngine.nextBatchId());
    const ids = Array.from({ length: n }, (_, i) => i);
    const [batchStructs, logs] = await Promise.all([
      Promise.all(ids.map((id) => incentiveEngine.batches(id))),
      fetchLogs(),
    ]);

    const byId: Record<number, any> = {};
    ids.forEach((id) => {
      const b = batchStructs[id];
      byId[id] = {
        batchId: id, author: b.author, escrow: toEth(b.escrowAmount),
        journalName: b.journalName, distributed: b.distributed, reviewerCount: 0,
        createTx: null, distributeTx: null, distributedAt: null, distributeBlock: null, scores: [], rewards: [],
      };
    });

    for (const l of logs) {
      let p: any; try { p = iface.parseLog(l); } catch { continue; }
      if (!p) continue;
      const id = Number(p.args.batchId);
      if (byId[id] === undefined) continue;
      if (p.name === "BatchCreated") { byId[id].createTx = l.transactionHash; byId[id].reviewerCount = Number(p.args.reviewerCount); }
      else if (p.name === "BatchDistributed") { byId[id].scores = p.args.scores.map((s: any) => toEth(s)); byId[id].distributeTx = l.transactionHash; byId[id].distributeBlock = Number(l.blockNumber); }
      else if (p.name === "RewardDistributed") byId[id].rewards.push({ reviewer: p.args.reviewer, eth: toEth(p.args.ethReward), reputation: toEth(p.args.reputationAmount) });
    }

    // Waktu distribusi = timestamp block event BatchDistributed. Ambil PARALEL per
    // block unik (banyak batch bisa terdistribusi di block sama) untuk hemat RPC.
    const distBlocks = Array.from(new Set(
      Object.values(byId).map((b: any) => b.distributeBlock).filter((n: any) => n != null)
    )) as number[];
    if (distBlocks.length) {
      const provider = hre.ethers.provider;
      const blocks = await Promise.all(distBlocks.map((bn) =>
        provider.getBlock(bn).then((blk: any) => blk).catch(() => null)));
      const tsByBlock: Record<number, number> = {};
      distBlocks.forEach((bn, i) => { if (blocks[i]) tsByBlock[bn] = Number(blocks[i].timestamp) * 1000; });
      Object.values(byId).forEach((b: any) => {
        if (b.distributeBlock != null && tsByBlock[b.distributeBlock]) b.distributedAt = tsByBlock[b.distributeBlock];
      });
    }

    const history = Object.values(byId).sort((a: any, b: any) => a.batchId - b.batchId);
    const data = { success: true, count: history.length, history };
    historyCache = { at: Date.now(), data };
    res.json({ ...data, cached: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================================
// DEMO ROLE-BASED FLOW: store ringan (submission + review) + endpoint
// Prototipe demonstrasi peran (author/reviewer/editor/public). Bukan
// kontribusi riset; integrasi OJS penuh = future work.
// ===================================================================
const STORE_FILE = path.join(__dirname, "..", "data", "demo-store.json");
function loadStore(): any {
  try { const fs = require("fs"); if (fs.existsSync(STORE_FILE)) { const s = JSON.parse(fs.readFileSync(STORE_FILE, "utf8")); if (!s.distributions) s.distributions = {}; return s; } } catch {}
  return { submissions: {}, reviews: {}, distributions: {} };
}
function saveStore(s: any) { const fs = require("fs"); fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true }); fs.writeFileSync(STORE_FILE, JSON.stringify(s, null, 2)); }
let demoStore: any = loadStore();

// Rakit matriks QoS satu batch dalam urutan reviewer on-chain: submitter pakai
// q1/q2/q3 tersimpan + q4 dari rantai; non-submitter diberi penalti.
async function buildBatchMatrix(hre: any, reputationSBT: any, s: any): Promise<{ reviewers: string[]; matrix: number[][]; reviewed: boolean[] }> {
  const revs = demoStore.reviews[String(s.batchId)] || {};
  // q4 (reputasi SBT) tiap reviewer dibaca PARALEL dari rantai.
  const q4s = await Promise.all(s.reviewers.map(async (addr: string) => {
    try { return Number(hre.ethers.formatEther(await reputationSBT.effectiveBalance(addr))); } catch { return 0; }
  }));
  const matrix: number[][] = [];
  const reviewed: boolean[] = [];
  s.reviewers.forEach((addr: string, i: number) => {
    const r = revs[addr]; const q4 = q4s[i];
    reviewed.push(!!r);
    matrix.push(r ? [r.q1, r.q2, r.q3, q4] : [30, 0, 0, q4]);
  });
  return { reviewers: s.reviewers, matrix, reviewed };
}

// Auto-heal: pastikan setiap batch on-chain punya catatan submission off-chain.
// Melindungi dari kasus POST /api/submission gagal/terlewat (mis. tab ditutup
// sebelum request selesai) yang membuat batch on-chain "yatim" — daftar reviewer
// dan nama jurnal DIPULIHKAN dari rantai (sumber kebenaran) dengan mendekode
// calldata transaksi createBatch. Judul & teks paper tetap kosong (author dapat
// melengkapinya), tetapi penugasan reviewer langsung tampil di halaman reviewer.
let lastReconcileAt = 0;
async function reconstructOrphanBatches(): Promise<void> {
  if (!deployedContracts?.incentiveEngine) return;
  if (Date.now() - lastReconcileAt < 8000) return; // throttle: hindari beban RPC berlebih
  lastReconcileAt = Date.now();
  const hre = require("hardhat");
  const engine = deployedContracts.incentiveEngine;
  const iface = engine.interface;
  let n = 0;
  try { n = Number(await engine.nextBatchId()); } catch { return; }
  const missing: number[] = [];
  for (let id = 0; id < n; id++) if (!demoStore.submissions[String(id)]) missing.push(id);
  if (!missing.length) return;

  // Ambil log BatchCreated (rentang penuh via gateway publik, sama seperti history).
  const { JsonRpcProvider } = require("ethers");
  const address = await engine.getAddress();
  const fromB = deployedContracts.deployedAtBlock || 0;
  let logs: any[] = [];
  for (const url of ["https://sepolia.gateway.tenderly.co", "https://ethereum-sepolia-rpc.publicnode.com"]) {
    try { logs = await new JsonRpcProvider(url).getLogs({ address, fromBlock: fromB, toBlock: "latest" }); break; } catch { /* provider berikutnya */ }
  }
  if (!logs.length) { try { logs = await hre.ethers.provider.getLogs({ address, fromBlock: fromB, toBlock: "latest" }); } catch { return; } }

  const createTxById: Record<number, string> = {};
  for (const l of logs) {
    let p: any; try { p = iface.parseLog(l); } catch { continue; }
    if (p?.name === "BatchCreated") createTxById[Number(p.args.batchId)] = l.transactionHash;
  }

  const provider = hre.ethers.provider;
  let changed = false;
  for (const id of missing) {
    const txHash = createTxById[id]; if (!txHash) continue;
    try {
      const t = await provider.getTransaction(txHash);
      const parsed = iface.parseTransaction({ data: t.data, value: t.value });
      if (parsed?.name !== "createBatch") continue;
      const reviewers: string[] = parsed.args[0].map((a: string) => String(a).toLowerCase());
      const journalName: string = parsed.args[1] || "(tanpa nama)";
      demoStore.submissions[String(id)] = {
        batchId: id, journalName, paperTitle: "", paperText: "",
        reviewers, createdAt: Date.now(), reconstructed: true,
      };
      if (!demoStore.reviews[String(id)]) demoStore.reviews[String(id)] = {};
      changed = true;
    } catch { /* lewati batch ini */ }
  }
  if (changed) { saveStore(demoStore); invalidateHistory(); }
}

// Author menyimpan paper + daftar reviewer SETELAH createBatch (MetaMask) sukses.
app.post("/api/submission", (req, res) => {
  try {
    const { batchId, journalName, paperTitle, paperText, reviewers } = req.body;
    if (batchId === undefined || !Array.isArray(reviewers)) { res.status(400).json({ error: "batchId & reviewers wajib" }); return; }
    demoStore.submissions[String(batchId)] = {
      batchId: Number(batchId), journalName: journalName || "(tanpa nama)", paperTitle: paperTitle || "",
      paperText: paperText || "", reviewers: reviewers.map((r: string) => r.toLowerCase()), createdAt: Date.now(),
    };
    if (!demoStore.reviews[String(batchId)]) demoStore.reviews[String(batchId)] = {};
    saveStore(demoStore);
    invalidateHistory(); // batch baru on-chain -> history usang
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Daftar submisi + status review (editor & public).
app.get("/api/submissions", async (req, res) => {
  try { await reconstructOrphanBatches(); } catch { /* auto-heal best-effort */ }
  const list = Object.values(demoStore.submissions).map((s: any) => {
    const revs = demoStore.reviews[String(s.batchId)] || {};
    return { batchId: s.batchId, journalName: s.journalName, paperTitle: s.paperTitle,
      reviewers: s.reviewers, reviewCount: Object.keys(revs).length, total: s.reviewers.length,
      reviewedBy: Object.keys(revs), createdAt: s.createdAt };
  }).sort((a: any, b: any) => a.batchId - b.batchId);
  res.json({ success: true, submissions: list });
});

// Detail satu submisi (paper untuk dibaca reviewer).
app.get("/api/submission", (req, res) => {
  const s = demoStore.submissions[String(req.query.batchId)];
  if (!s) { res.status(404).json({ error: "not found" }); return; }
  res.json({ success: true, submission: s });
});

// Paper yang menunggu direview oleh alamat tertentu.
app.get("/api/reviews/pending", async (req, res) => {
  const addr = String(req.query.address || "").toLowerCase();
  if (!addr) { res.status(400).json({ error: "address wajib" }); return; }
  try { await reconstructOrphanBatches(); } catch { /* auto-heal best-effort */ }
  const papers = Object.values(demoStore.submissions)
    .filter((s: any) => s.reviewers.includes(addr))
    .map((s: any) => ({ batchId: s.batchId, journalName: s.journalName, paperTitle: s.paperTitle,
      done: !!(demoStore.reviews[String(s.batchId)] || {})[addr] }));
  res.json({ success: true, papers });
});

// Reviewer submit ulasan -> hitung q1/q2/q3 (AI, DISEMBUNYIKAN) -> simpan.
app.post("/api/review", async (req, res) => {
  try {
    const { batchId, reviewer, reviewText, daysElapsed } = req.body;
    const key = String(batchId);
    const s = demoStore.submissions[key];
    if (!s) { res.status(404).json({ error: "batch tidak ditemukan" }); return; }
    const addr = String(reviewer || "").toLowerCase();
    if (!s.reviewers.includes(addr)) { res.status(403).json({ error: "alamat bukan reviewer batch ini" }); return; }
    if (!reviewText || String(reviewText).trim().length < 1) { res.status(400).json({ error: "ulasan kosong" }); return; }
    const provider = await getQosProvider();
    const q2 = await provider.relevance(reviewText, s.paperText || "");
    const q3 = await provider.actionability(reviewText);
    // q1 timeliness (cost): pakai input simulasi bila diberikan (demo tak perlu menunggu
    // berhari-hari), selain itu hitung dari selisih waktu nyata sejak batch dibuat.
    const dOverride = Number(daysElapsed);
    const q1 = Number.isFinite(dOverride) && dOverride >= 0
      ? dOverride
      : Math.max(0, (Date.now() - s.createdAt) / 86400000);
    if (!demoStore.reviews[key]) demoStore.reviews[key] = {};
    demoStore.reviews[key][addr] = { reviewText, q1, q2, q3, submittedAt: Date.now() };
    saveStore(demoStore);
    res.json({ success: true }); // sengaja tidak mengembalikan skor (anti-gaming)
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Editor trigger distribusi: rakit matriks dari store (+ q4 on-chain) -> executeDistribution.
app.post("/api/onchain/distribute-batch", async (req, res) => {
  try {
    const deps = requireDeployed(res);
    if (!deps) return;
    const hre = require("hardhat");
    const { incentiveEngine, reputationSBT } = deps;
    const { batchId, lambda = 0.6, gamma = 0.5 } = req.body;
    const key = String(batchId);
    const s = demoStore.submissions[key];
    if (!s) { res.status(404).json({ error: "batch tidak ada di store" }); return; }
    if (!Array.isArray(s.reviewers) || s.reviewers.length < 2) {
      res.status(400).json({ error: "Perangkingan membutuhkan minimal 2 reviewer (TOPSIS tidak terdefinisi untuk 1 alternatif). Buat batch dengan ≥2 reviewer." });
      return;
    }
    const { matrix, reviewed } = await buildBatchMatrix(hre, reputationSBT, s);

    const normalized = normalize(matrix, CRITERIA_TYPES);
    const { input: bwmInput, presetKey } = resolveBwm(req.body);
    const bwmResult = computeBWM(bwmInput);
    const ecwm = computeECWMDetail(normalized, gamma);
    const weights = fuseWeights(bwmResult.weights, ecwm.weights, lambda);
    // Sanitasi terhadap kasus degenerate (mis. matriks konstan): cegah NaN -> parseEther gagal.
    const safeV = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0.5);
    let w = weights.map((x: number) => (Number.isFinite(x) ? x : 0));
    let wSum = w.reduce((a: number, b: number) => a + b, 0);
    if (!(wSum > 0)) { w = new Array(w.length).fill(1); wSum = w.length; } // fallback: bobot seragam
    const onChainMatrix = normalized.map((row) => row.map((v) => hre.ethers.parseEther(safeV(v).toFixed(18))));
    const onChainWeights = w.map((x: number) => hre.ethers.parseEther((x / wSum).toFixed(18)));

    // Participation gate: reviewer yang tidak menyerahkan ulasan (reviewed=false)
    // dikecualikan dari escrow & reputasi (0 ETH, 0 SBT) langsung di kontrak.
    const tx = await incentiveEngine.executeDistribution(batchId, onChainMatrix, onChainWeights, reviewed);
    const receipt = await tx.wait();
    const iface = incentiveEngine.interface;
    const parse = (name: string) => receipt.logs.map((l: any) => { try { return iface.parseLog({ topics: l.topics, data: l.data }); } catch { return null; } }).filter((e: any) => e && e.name === name);
    const rewardEvents = parse("RewardDistributed");
    const distEvent = parse("BatchDistributed")[0];
    const scores = distEvent ? distEvent.args[1].map((x: any) => Number(hre.ethers.formatEther(x))) : [];
    const rewards = rewardEvents.map((e: any) => Number(hre.ethers.formatEther(e.args[2])));
    const reputation = rewardEvents.map((e: any) => Number(hre.ethers.formatEther(e.args[3])));

    // Snapshot provenance (off-chain): bobot final + derivasi BWM/ECWM + λ/γ/preset +
    // skor & imbalan AKTUAL dari event. Dipakai agar pratinjau batch terdistribusi
    // menampilkan nilai yang benar-benar dipakai (bukan hitung ulang). Bobot final
    // sendiri sudah immutable di calldata transaksi; ini menambah jejak derivasinya.
    if (!demoStore.distributions) demoStore.distributions = {};
    demoStore.distributions[key] = {
      batchId: Number(batchId), reviewers: s.reviewers, reviewed, matrix, normalized,
      preset: presetKey, lambda, gamma,
      bwm: { weights: bwmResult.weights, consistencyRatio: bwmResult.consistencyRatio, bestIndex: bwmInput.bestIndex, worstIndex: bwmInput.worstIndex },
      ecwm: {
        gamma: ecwm.gamma, beta: ecwm.beta, weights: ecwm.weights,
        entropy: { divergence: ecwm.entropy.divergence, weights: ecwm.entropy.weights },
        critic: { sigma: ecwm.critic.sigma, conflict: ecwm.critic.conflict, weights: ecwm.critic.weights },
      },
      weights, topsisScores: scores, rewards, reputation,
      txHash: tx.hash, distributedAt: Date.now(),
    };
    saveStore(demoStore);
    invalidateHistory(); // distribusi baru -> history usang
    res.json({ success: true, batchId: Number(batchId), txHash: tx.hash, gasUsed: receipt.gasUsed.toString(), reviewers: s.reviewers, scores, rewards, reputation });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Pratinjau (off-chain) matriks QoS + bobot + skor TOPSIS untuk membantu editor
// mendapatkan insight dan menyetel lambda SEBELUM mengeksekusi distribusi on-chain.
app.post("/api/preview-batch", async (req, res) => {
  try {
    const deps = requireDeployed(res); if (!deps) return;
    const hre = require("hardhat");
    const { reputationSBT } = deps;
    const { batchId, lambda = 0.6, gamma = 0.5 } = req.body;
    const s = demoStore.submissions[String(batchId)];
    if (!s) { res.status(404).json({ error: "batch tidak ada di store" }); return; }
    // Batch sudah terdistribusi -> kembalikan SNAPSHOT tercatat (nilai yang benar-benar
    // dipakai), bukan hitung ulang dengan λ/preset saat ini.
    const snap = demoStore.distributions?.[String(batchId)];
    if (snap) { res.json({ ...snap, success: true, recorded: true }); return; }
    const { reviewers, matrix, reviewed } = await buildBatchMatrix(hre, reputationSBT, s);
    const normalized = normalize(matrix, CRITERIA_TYPES);

    // Subjektif (BWM) dari preset/manual editor + Consistency Ratio.
    const { input: bwmInput, presetKey } = resolveBwm(req.body);
    const bwmResult = computeBWM(bwmInput);
    // Objektif (ECWM) dengan seluruh langkah antara Entropy + CRITIC untuk transparansi.
    const ecwm = computeECWMDetail(normalized, gamma);
    const weights = fuseWeights(bwmResult.weights, ecwm.weights, lambda);

    let topsisScores: number[] = [];
    if (matrix.length >= 2) { try { topsisScores = topsis(normalized, weights, CRITERIA_TYPES).scores; } catch {} }

    res.json({
      success: true, reviewers, reviewed, matrix, normalized,
      preset: presetKey, lambda, gamma,
      bwm: { weights: bwmResult.weights, consistencyRatio: bwmResult.consistencyRatio, bestIndex: bwmInput.bestIndex, worstIndex: bwmInput.worstIndex },
      ecwm: {
        gamma: ecwm.gamma, beta: ecwm.beta, weights: ecwm.weights,
        entropy: { divergence: ecwm.entropy.divergence, weights: ecwm.entropy.weights },
        critic: { sigma: ecwm.critic.sigma, conflict: ecwm.critic.conflict, weights: ecwm.critic.weights },
      },
      weights, topsisScores,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Read q4 (reputation) from the blockchain — closes the READ side of the
// reputation loop. q4 = ReputationSBT.effectiveBalance() (decayed). Uses the
// same reviewer↔signer mapping as /api/onchain/execute (signers[1..n]).
app.post("/api/onchain/reputation", async (req, res) => {
  try {
    const deps = requireDeployed(res);
    if (!deps) return;

    const hre = require("hardhat");
    const { reputationSBT } = deps;
    const { count, addresses } = req.body || {};

    let addrs: string[];
    if (Array.isArray(addresses) && addresses.length > 0) {
      addrs = addresses;
    } else {
      const n = Number(count) || 0;
      const signers = await hre.ethers.getSigners();
      addrs = signers.slice(1, n + 1).map((s: any) => s.address);
    }

    const toEth = (v: bigint) => Number(hre.ethers.formatEther(v));
    const effective: number[] = [];
    const raw: number[] = [];
    for (const a of addrs) {
      const [eff, rawBal] = await Promise.all([
        reputationSBT.effectiveBalance(a),
        reputationSBT.balanceOf(a),
      ]);
      effective.push(toEth(eff));
      raw.push(toEth(rawBal));
    }

    res.json({ addresses: addrs, effective, raw });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/onchain/audit", async (req, res) => {
  try {
    const deps = requireDeployed(res);
    if (!deps) return;

    const hre = require("hardhat");
    const { incentiveEngine, reputationSBT, deployer, deployedAtBlock } = deps;
    const provider = hre.ethers.provider;

    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();

    const [sigmoidK, sigmoidX0, nextBatchId, decayRatePerDay] = await Promise.all([
      incentiveEngine.sigmoidK(),
      incentiveEngine.sigmoidX0(),
      incentiveEngine.nextBatchId(),
      reputationSBT.decayRatePerDay(),
    ]);

    const fromBlock = deployedAtBlock ?? 0;
    const [createdEvents, distributedEvents, rewardEvents] = await Promise.all([
      incentiveEngine.queryFilter(incentiveEngine.filters.BatchCreated(), fromBlock),
      incentiveEngine.queryFilter(incentiveEngine.filters.BatchDistributed(), fromBlock),
      incentiveEngine.queryFilter(incentiveEngine.filters.RewardDistributed(), fromBlock),
    ]);

    const toEth = (v: bigint) => Number(hre.ethers.formatEther(v));

    const createdByBatch = new Map<number, any>();
    for (const e of createdEvents) {
      createdByBatch.set(Number(e.args.batchId), e);
    }

    const distributedByBatch = new Map<number, any>();
    for (const e of distributedEvents) {
      distributedByBatch.set(Number(e.args.batchId), e);
    }

    const rewardsByBatch = new Map<number, any[]>();
    const reviewerMap = new Map<string, any>();
    for (const e of rewardEvents) {
      const batchId = Number(e.args.batchId);
      const reviewer = e.args.reviewer;
      const item = {
        batchId,
        reviewer,
        ethReward: toEth(e.args.ethReward),
        reputationAmount: toEth(e.args.reputationAmount),
        txHash: e.transactionHash,
        blockNumber: e.blockNumber,
        logIndex: e.index,
      };

      if (!rewardsByBatch.has(batchId)) rewardsByBatch.set(batchId, []);
      rewardsByBatch.get(batchId)!.push(item);

      if (!reviewerMap.has(reviewer)) {
        reviewerMap.set(reviewer, {
          address: reviewer,
          totalEthReward: 0,
          totalReputation: 0,
          history: [],
        });
      }
      const entry = reviewerMap.get(reviewer);
      entry.totalEthReward += item.ethReward;
      entry.totalReputation += item.reputationAmount;
      entry.history.push(item);
    }

    const totalBatches = Number(nextBatchId);
    const batches = await Promise.all(
      Array.from({ length: totalBatches }, async (_, id) => {
        const batch = await incentiveEngine.batches(id);
        const created = createdByBatch.get(id);
        const distributed = distributedByBatch.get(id);
        const rewards = (rewardsByBatch.get(id) || []).sort((a, b) => a.logIndex - b.logIndex);
        const reviewers = rewards.map(r => r.reviewer);
        const scores = distributed?.args?.scores ? distributed.args.scores.map((s: bigint) => toEth(s)) : [];

        return {
          batchId: id,
          author: batch.author,
          escrowAmount: toEth(batch.escrowAmount),
          distributed: batch.distributed,
          journalName: batch.journalName || "",
          reviewerCount: created ? Number(created.args.reviewerCount) : reviewers.length,
          reviewers,
          scores,
          rewards: rewards.map(r => ({
            reviewer: r.reviewer,
            ethReward: r.ethReward,
            reputationAmount: r.reputationAmount,
            txHash: r.txHash,
            blockNumber: r.blockNumber,
          })),
          createdAtBlock: created?.blockNumber ?? null,
          distributedAtBlock: distributed?.blockNumber ?? null,
        };
      })
    );

    const reviewers = await Promise.all(
      Array.from(reviewerMap.values()).map(async (r: any) => {
        const [balance, effective, lastActive] = await Promise.all([
          reputationSBT.balanceOf(r.address),
          reputationSBT.effectiveBalance(r.address),
          reputationSBT.lastActive(r.address),
        ]);
        const lastActiveNum = Number(lastActive);
        return {
          address: r.address,
          totalEthReward: r.totalEthReward,
          totalReputation: r.totalReputation,
          reputationBalance: toEth(balance),
          effectiveReputation: toEth(effective),
          lastActive: lastActiveNum,
          lastActiveIso: lastActiveNum > 0 ? new Date(lastActiveNum * 1000).toISOString() : null,
          history: r.history.map((h: any) => ({
            batchId: h.batchId,
            ethReward: h.ethReward,
            reputationAmount: h.reputationAmount,
            txHash: h.txHash,
            blockNumber: h.blockNumber,
          })),
        };
      })
    );

    res.json({
      success: true,
      network: { chainId: Number(network.chainId), blockNumber },
      contracts: {
        incentiveEngine: await incentiveEngine.getAddress(),
        reputationSBT: await reputationSBT.getAddress(),
        deployer: deployer.address,
        deployedAtBlock: deployedAtBlock ?? null,
      },
      params: {
        sigmoidK: toEth(sigmoidK),
        sigmoidX0: toEth(sigmoidX0),
        decayRatePerDay: toEth(decayRatePerDay),
        nextBatchId: totalBatches,
      },
      batches,
      reviewers,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ================================================================
// START SERVER
// ================================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  ┌─────────────────────────────────────────────────┐`);
  console.log(`  │  OJS Incentive — API Server                      │`);
  console.log(`  │  Dashboard: http://localhost:${PORT}               │`);
  console.log(`  │  API:       http://localhost:${PORT}/api            │`);
  console.log(`  └─────────────────────────────────────────────────┘\n`);
});
