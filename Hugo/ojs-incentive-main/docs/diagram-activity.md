
flowchart TD
  A[Author Deposit Escrow] --> B[Editor Assign Reviewers]
  B --> C{Semua Reviewer Submit?}
  C -->|Belum| D[Tunggu Review]
  D --> C
  C -->|Ya| E[Editor Set Accuracy q3]
  E --> F[System: Build QoS Matrix]
  F --> G[System: Normalize]
  G --> H[System: Compute BWM + ECWM]
  H --> I[System: Fuse Weights]
  I --> J[System: TOPSIS Ranking]
  J --> K[System: Sigmoid Distribution]
  K --> L[Smart Contract: Transfer ETH]
  L --> M[Smart Contract: Mint SBT]
  M --> N[Emit Events]
  N --> O[End: Batch Complete]

