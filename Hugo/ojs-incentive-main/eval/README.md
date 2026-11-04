# Evaluation Harness — Thesis Bab IV

Headless, deterministic regeneration of every number in the evaluation chapter,
produced by the **real production engine** (`../middleware`) and the **deployed
contracts** (`../contracts`) — not a re-implementation. This is the single
source of truth for the figures and tables in Bab IV.

## Reproduce everything

```bash
npm install
npm run eval        # IV.3 + IV.4 middleware-derived numbers -> eval-output/eval-results.json
npm run eval:gas    # IV.5 on-chain gas scaling (Hardhat EVM)
# or both:
npm run eval:all
```

`npm run eval:verify` prints the six demo tables in a human-readable form for a
quick eyeball against the thesis.

## What produces each table/figure

| Thesis ref | Table/Figure | Script | Notes |
|---|---|---|---|
| IV.3.1 | CR per preset | `core.runPipeline` (in `run-all.ts`) | CR = 0 by construction |
| IV.3.2 | Spearman vs hybrid | `core.runBaselines` | WSM ρ=0.90, ECWM-only ρ=0.90 |
| IV.3.3 | λ sensitivity | `core.runPipeline` sweep | winner R4 stable |
| IV.3.4 | ECWM adaptif (Batch 1/2/3) | `ecwm-adaptive.ts` | uniform criterion → weight 0 |
| IV.4.1 | Free-riding sigmoid vs linear | `core.runBaselines` (D2) | ratio 2.86× vs 1.76× |
| IV.4.2 | Sybil | `core.runPipeline` (D3) | ROI ≈ 0.03× |
| IV.4.3 | Decay multicycle | `core.runMulticycle` | Eve 0.628 → 0.738 |
| IV.4.4 | Sensitivity sweep k/x₀/λ_decay | `sensitivity.ts` | monotonic effects |
| IV.4.5 | Robustness 500 batch | `robustness.ts` | seeded; FR smallest 500/500 |
| IV.5 | Gas scaling n=2..10 | `test/contracts/gas.test.ts` | ~106k gas/reviewer |

## Determinism

- Datasets D1/D2/D3 and BWM presets are fixed in
  `../frontend/config/eval-datasets.ts`.
- The robustness sweep uses a **seeded** PRNG (`mulberry32`, seed `0xc0ffee`)
  with q-ranges centered on the D2 profiles — see `robustness.ts`. Change the
  seed or ranges only intentionally; doing so re-derives IV.4.5.
- Gas is deterministic on the EVM and independent of hardware.

## Shared core

`core.ts` holds the evaluation orchestration (`runPipeline`, `runBaselines`,
`runMulticycle`) and metric helpers (Gini, Spearman, WSM). The Express server
(`../server/index.ts`) and this harness both import from it, so the interactive
demo (`public/evaluation.html`) and the committed numbers cannot drift apart.
