# Real peer-review data for q2/q3 (PeerRead ICLR 2017)

This folder grounds the QoS metrics q2 (relevance) and q3 (actionability), and the
Bab IV evaluation datasets, in **real peer reviews** instead of hand-crafted numbers.

## Source
- **Dataset:** PeerRead (Kang et al., NAACL 2018), subset `iclr_2017`.
- **Repo:** https://github.com/allenai/PeerRead — `data/iclr_2017/{train,dev,test}/reviews/*.json`
- Each review JSON pairs the paper `abstract` with the full review `comments`, plus
  human labels (`RECOMMENDATION` 1–10, `REVIEWER_CONFIDENCE` 1–5, aspect scores, `accepted`).
- **License note:** PeerRead is a published, citable research dataset (cite Kang et al. 2018).
  We do **not** redistribute the corpus here — only derived numeric values + record IDs.

## Pipeline (reproducible)
1. **Fetch** the 2,636 usable labeled reviews with text (non-meta, comments > 100 chars,
   abstract > 50 chars, RECOMMENDATION present) — to a working file (not committed).
2. **Derive** real q2/q3 with the SAME production model (Xenova/all-MiniLM-L6-v2,
   inference-only) on a deterministic fixed sample of 600:
   ```
   npx ts-node eval/realdata/derive-qos.ts <peerread_full.json> peerread-iclr2017-derived.json 600
   ```
   Output (committed): `peerread-iclr2017-derived.json` — per review: q2_own, q2_random,
   q3, comments_len, and the human labels. NO raw review text.
3. **Validate** (Bab IV):
   ```
   npx ts-node eval/realdata/validate.ts peerread-iclr2017-derived.json
   ```
   - q2 discriminant (own vs random paper): mean 0.596 vs 0.281, Cohen's d = 2.37,
     98.8% of reviews more relevant to their own paper — validates q2 as a relevance metric.
   - q3 distribution: mean 0.38, spread 0–0.93; Spearman(q3, length) = 0.23.
   - Secondary (indicative only; PeerRead labels rate the PAPER, not the review):
     q2/q3 vs confidence/recommendation ≈ 0.14 / −0.10.
4. **Curate** the fixed evaluation datasets D1/D2/D3 (real q2/q3; q1/q4 controlled
   parameters per profile; free-riders = fast-but-shallow, low band on q2/q3, not the
   extreme tail; D1 chosen for cross-criteria trade-offs, Spearman TOPSIS-vs-WSM = 0.90):
   ```
   npx ts-node eval/realdata/curate.ts peerread-iclr2017-derived.json
   ```
   Paste the emitted matrices into `frontend/config/eval-datasets.ts` (provenance
   paper_id:review_idx is recorded there in comments).

## Scope
- Only **q2/q3** are derived from real text. **q1** (days) and **q4** (SBT balance) are
  non-textual and remain controlled parameters assigned per profile.
- The datasets are constructed scenarios (to demonstrate specific properties), using
  real q2/q3 values selected by transparent percentile/profile criteria.
