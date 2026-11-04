# Implementation Planning — Full System Evaluation & Deployment

## Context

Tugas Akhir: **Hybrid Adaptive Incentive Mechanism for Peer Review**  
Thesis Architecture: OJS (Application) → Middleware (off-chain) → Blockchain (on-chain)

This document defines the complete implementation plan covering:
1. Off-chain middleware pipeline (Fase 1-2)
2. On-chain smart contracts (Fase 3-4)
3. Evaluation framework (scenarios, baselines, multi-cycle)
4. Web API + Interactive UI for analysis
5. On-chain deployment & verification

---

## Current State

| Component | Status |
|-----------|--------|
| Normalization (Fase 1) | ✅ Implemented + 5 tests |
| BWM Weighting (Fase 2a) | ✅ Implemented + 6 tests |
| ECWM Weighting (Fase 2b) | ✅ Implemented + 10 tests |
| Fusion (Fase 2c) | ✅ Implemented + 6 tests |
| TOPSIS Ranking (Fase 3) | ✅ Implemented + 4 tests |
| Sigmoid Distribution (Fase 4) | ✅ Implemented |
| Pipeline Integration | ✅ 21 tests passing |
| Smart Contracts | ✅ Deployed + 21 on-chain tests passing |
| Scenario Evaluation | ✅ 5 scenarios (S1-S5) |
| Baseline Comparison | ✅ 5 baselines (B1-B5) |
| Multi-Cycle Simulation | ✅ 10-cycle with reputation dynamics |
| Express API Server | ✅ REST endpoints for all operations |
| Interactive Web UI | ✅ 5-tab dashboard with charts |
| On-Chain Testing | ✅ Contract deployment + execution + comparison |

---

## Design Principles

1. **Thesis-grounded** — Every scenario maps to a masalah (M1-M4) or kebutuhan (FR/NFR)
2. **Quantitative** — All outputs produce numbers that can become thesis tables/figures
3. **Reproducible** — Fixed seeds, deterministic randomness where needed
4. **Comparable** — Same input data fed to all baselines for fair comparison
5. **End-to-end verifiable** — On-chain + off-chain produce correlated results

---

## Phase 1: Scenario Evaluation

### Purpose
Demonstrate the system produces "fair" and "correct" results under realistic conditions.

### Scenarios (mapped to thesis problems)

| ID | Name | Thesis Ref | What It Tests |
|----|------|-----------|---------------|
| S1 | Normal Distribution | Baseline | 5 reviewers with varied but reasonable performance |
| S2 | Free-Rider Detection | M1, M3 | 1 reviewer submits minimal effort (high q1/low q2) |
| S3 | Cold-Start | M4 | New reviewer (q4=0) vs established reviewer |
| S4 | Sybil Resistance | M4 | Reviewer with inflated q3 (self-accept) but low reputation |
| S5 | Clustered Performance | M1 | All reviewers similar — tests differentiation capability |

### Metrics per Scenario

- **TOPSIS scores** (S_i) — individual performance measure
- **Reward distribution** (ETH) — proportional fairness
- **Gini coefficient** — inequality measure (0=equal, 1=one takes all)
- **Differentiation ratio** — max_reward / min_reward (higher = more differential)
- **Rank correctness** — does the "expected best" rank #1?

---

## Phase 2: Baseline Comparison

### Purpose
Prove TOPSIS+Sigmoid+Hybrid outperforms simpler alternatives.

### Baselines

| ID | Method | Description | What It Lacks |
|----|--------|-------------|---------------|
| B1 | Equal Split | pool / n | No differentiation at all |
| B2 | Linear Proportional | score_i / Σscores × pool | No non-linear amplification |
| B3 | BWM-only TOPSIS | λ=1.0 (pure editor weight) | No data-driven correction |
| B4 | ECWM-only TOPSIS | λ=0.0 (pure data weight) | No expert judgment |
| B5 | WSM (Weighted Sum) | Σ(w_j × r_ij) instead of TOPSIS | No dual-reference (PIS/NIS) |

### Comparison Metrics

- **Gini coefficient** — Is distribution appropriate? (not too equal, not too extreme)
- **Differentiation ratio** — Can the method separate performers?
- **Manipulation resistance** — If reviewer inflates q2 by 20%, how much does reward change?
- **Rank correlation (Spearman)** — Do methods agree on ranking? (convergent validity)

### Evaluation Logic

For each scenario (S1-S5):
1. Run full hybrid pipeline → get results
2. Run each baseline (B1-B5) → get results
3. Compare metrics side-by-side

---

## Phase 3: Multi-Cycle Simulation

### Purpose
Analyze **reputation dynamics** over time — does the system converge, diverge, or create monopoly?

### Design

- **10 cycles** (representing 10 peer review rounds)
- **5 reviewers** with different behavioral patterns
- Each cycle: previous SBT balance feeds into q4 for the next cycle
- Decay applied between cycles (configurable days of inactivity)

### Reviewer Behavioral Profiles (Fixed Across Cycles)

| Reviewer | Pattern | q1 (days) | q2 (depth) | q3 (accuracy) | Activity |
|----------|---------|-----------|------------|----------------|----------|
| Alice | Consistent High | 2-3 | 8-9 | 0.85-0.95 | Every cycle |
| Bob | Average Steady | 5-7 | 5-6 | 0.60-0.70 | Every cycle |
| Charlie | Improving | 7→3 | 4→8 | 0.50→0.85 | Every cycle |
| Diana | Declining | 3→8 | 8→4 | 0.90→0.55 | Every cycle |
| Eve | Sporadic | 4-5 | 6-7 | 0.70 | Skips cycle 3,6,9 (decay) |

### Key Questions Answered

1. **Convergence**: Do scores stabilize or diverge over cycles?
2. **Rich-get-richer**: Does Alice's early lead create permanent monopoly?
3. **Recovery**: Can Charlie (improver) eventually overtake Alice?
4. **Decay effectiveness**: Does Eve's inactivity correctly reduce her influence?
5. **Fairness over time**: Is cumulative reward distribution reasonable?

### Outputs

- Score trajectory (S_i per cycle) — line chart
- Cumulative reward (Σreward per cycle) — stacked area
- SBT balance over time (with decay visible) — line chart
- Gini coefficient per cycle — single line (trend)

---

## Implementation Files

```
ojs-incentive/
├── contracts/
│   ├── IncentiveEngine.sol    — On-chain TOPSIS + Sigmoid + Escrow
│   ├── ReviewToken.sol        — ERC-20 reward token
│   └── ReputationSBT.sol      — Soulbound reputation with decay
├── middleware/
│   ├── index.ts               — Barrel exports
│   ├── normalization.ts       — Min-max linear (Fase 1)
│   ├── topsis.ts              — Off-chain TOPSIS reference (Fase 3)
│   ├── sigmoid.ts             — Sigmoid distribution (Fase 4)
│   └── weighting/
│       ├── bwm.ts             — Best-Worst Method (Fase 2a)
│       ├── ecwm.ts            — Entropy-CRITIC (Fase 2b)
│       ├── fusion.ts          — Linear combination (Fase 2c)
│       └── index.ts           — Barrel exports
├── server/
│   └── index.ts               — Express API server (all endpoints)
├── public/
│   └── index.html             — Comprehensive 5-tab web dashboard
├── scripts/
│   ├── evaluate.ts            — Terminal evaluation (Phase 1-3)
│   ├── simulate.ts            — Quick terminal simulation
│   └── dashboard.ts           — Legacy dashboard generator
├── test/
│   ├── middleware/            — 53 unit + integration tests
│   │   ├── normalization.test.ts
│   │   ├── bwm.test.ts
│   │   ├── ecwm.test.ts
│   │   ├── fusion.test.ts
│   │   ├── topsis.test.ts
│   │   └── pipeline.test.ts
│   └── contracts/             — 21 on-chain integration tests
│       └── IncentiveEngine.test.ts
└── output/
    ├── evaluation-results.json
    └── evaluation-report.txt
```

---

## System Architecture

### Three-Layer Separation of Concerns

```
┌──────────────────────────────────────────────────────┐
│  APPLICATION LAYER (OJS)                              │
│  Collects: q1(timeliness), q2(depth), q3(accuracy)   │
│  Source: review submission metadata                   │
└───────────────────┬──────────────────────────────────┘
                    │ Raw QoS data (4 criteria × n reviewers)
                    ▼
┌──────────────────────────────────────────────────────┐
│  MIDDLEWARE LAYER (TypeScript, off-chain)             │
│  Fase 1: Min-max normalization                       │
│  Fase 2: BWM + ECWM + Linear Fusion                 │
│  Output: normalized matrix + fused weights           │
└───────────────────┬──────────────────────────────────┘
                    │ uint256[][] matrix + uint256[4] weights
                    │ (via executeDistribution tx)
                    ▼
┌──────────────────────────────────────────────────────┐
│  BLOCKCHAIN LAYER (Solidity, on-chain)               │
│  Fase 3: TOPSIS ranking (verifiable)                 │
│  Fase 4: Sigmoid distribution + SBT minting         │
│  Escrow: ETH held until distribution                 │
│  Decay: Exponential reputation decay                 │
└──────────────────────────────────────────────────────┘
```

### API Server Architecture

```
Express Server (port 3000)
├── GET  /                    → Serves public/index.html (dashboard)
├── POST /api/pipeline        → Run single middleware execution
├── POST /api/scenarios       → Run 5 scenario evaluations
├── POST /api/baselines       → Run baseline comparison
├── POST /api/multicycle      → Run multi-cycle simulation
├── POST /api/onchain/deploy  → Deploy contracts to Hardhat network
└── POST /api/onchain/execute → Execute on-chain + compare with off-chain
```

---

## Parameter Configuration

All parameters match thesis decisions:

```typescript
// BWM (Editor: q3 best, q4 worst)
bestIndex: 2, worstIndex: 3
bestToOthers: [3, 2, 1, 5]   // q3 > q2 > q1 > q4
othersToWorst: [3, 4, 5, 1]

// Fusion
lambda: 0.6    // 60% editor authority (thesis default)
gamma: 0.5     // ECWM: equal Entropy + CRITIC

// Sigmoid
k: 10          // moderate steepness
x0: 0.5        // centered inflection

// Pool
escrowPool: 2.0 // ETH per batch

// Decay
decayRate: 0.02 // 2% per day (matches ReputationSBT.sol)
```

---

## Expected Thesis Outputs

### Tables for Bab Evaluasi

1. **Tabel: Hasil Evaluasi per Skenario** (S1-S5 × metrics)
2. **Tabel: Perbandingan Metode** (Hybrid vs B1-B5 × metrics)
3. **Tabel: Dinamika Reputasi 10 Siklus** (cycle × reviewer × score/reward/SBT)

### Figures for Bab Evaluasi

1. **Grafik: Score Trajectory** (multi-cycle line chart)
2. **Grafik: Cumulative Reward** (stacked area)
3. **Grafik: Gini Coefficient Trend** (single line over cycles)
4. **Grafik: Baseline Comparison Bar Chart** (grouped bars per metric)

---

## Execution

```bash
# Run all middleware tests (53 tests)
npm run test:middleware

# Run on-chain integration tests (21 tests)
npm run test:contracts

# Run ALL tests (74 total)
npm run test:all

# Run terminal evaluation (scenarios + baselines + multi-cycle)
npm run evaluate

# Start web server with interactive dashboard
npm run server
# Then open: http://localhost:3000

# Generate legacy static dashboard
npm run dashboard
```

---

## On-Chain Integration

### Smart Contracts

| Contract | Purpose | Key Functions |
|----------|---------|---------------|
| `IncentiveEngine.sol` | Core orchestrator | `createBatch()`, `executeDistribution()` |
| `ReviewToken.sol` | ERC-20 reward token | `mint()` (onlyOwner) |
| `ReputationSBT.sol` | Soulbound reputation | `mint()`, `effectiveBalance()`, `triggerDecay()` |

### On-Chain TOPSIS vs Off-Chain Comparison

The system deliberately duplicates TOPSIS in both layers:
- **Off-chain (middleware)**: Full floating-point precision, used for simulation/testing
- **On-chain (IncentiveEngine)**: Fixed-point (uint256 × 1e18), used for verifiable execution

The on-chain test suite verifies:
1. **Ranking correlation** ≥ 0.8 (Spearman ρ between off-chain and on-chain)
2. **Top-1 match**: Best reviewer is the same in both
3. **Reward share difference** < 15% per reviewer (due to sigmoid approximation)
4. **Total distribution** ≈ escrow amount (< 0.001 ETH dust)

### Why On-Chain TOPSIS?

From thesis (NFR-01, NFR-02):
- **Verifiability**: Anyone can verify the ranking computation
- **Determinism**: Same input always produces same output (no floating-point)
- **Transparency**: No "black box" — the algorithm is public on the blockchain

### Sigmoid Approximation (On-Chain vs Off-Chain)

Off-chain: `f(S) = 1 / (1 + e^(-k*(S - x0)))` (exact)
On-chain: `f(S) = 0.5 + 0.5 * (x / (x + 1))` for x≥0 (piecewise, gas-efficient)

This approximation introduces ≈5-15% share deviation but preserves ranking order.

---

## Web Dashboard (Interactive UI)

### 5-Tab Dashboard (public/index.html)

| Tab | Purpose | Features |
|-----|---------|----------|
| **Scenarios** | Phase 1 evaluation | Run S1-S5, view tables + Gini chart |
| **Baselines** | Phase 2 comparison | Adjustable params, reward bar chart, radar |
| **Multi-Cycle** | Phase 3 simulation | Score trajectory, cumulative rewards, SBT, Gini |
| **On-Chain** | Contract interaction | Deploy, execute, compare off/on-chain |
| **Pipeline** | Custom execution | Edit matrix, run pipeline, see all intermediate steps |

### Technology

- **Frontend**: Vanilla HTML/JS + Chart.js 4.4.7 (no framework, self-contained)
- **Backend**: Express.js serving static files + REST API
- **Charts**: Line, bar, radar, doughnut (all interactive with tooltips)
- **Design**: Dark theme, responsive grid, real-time parameter adjustment

---
