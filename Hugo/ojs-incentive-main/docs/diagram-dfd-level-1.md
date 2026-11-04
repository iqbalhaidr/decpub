---
config:
  layout: dagre
---
flowchart TB
  subgraph External["Entitas Eksternal"]
    AU(("Author"))
    ED(("Editor"))
    RV(("Reviewer"))
  end
  subgraph P1["1.0 Submission and Escrow"]
    P1A["1.1 Terima Paper"]
    P1B["1.2 Deposit Escrow"]
    P1C["1.3 Assign Reviewer"]
  end
  subgraph P2["2.0 Review and QoS Collection"]
    P2A["2.1 Terima Review Text"]
    P2B["2.2 Hitung q1 - Timeliness"]
    P2C["2.3 Hitung q2 - Depth"]
    P2D["2.4 Evaluasi q3 - Accuracy"]
    P2E["2.5 Ambil q4 - Reputation"]
  end
  subgraph P3["3.0 Normalization and Weighting"]
    P3A["3.1 Min-Max Normalization"]
    P3B["3.2 BWM - Bobot Subjektif"]
    P3C["3.3 ECWM - Bobot Objektif"]
    P3D["3.4 Fusi Linear W = lambda x Wsub + (1-lambda) x Wobj"]
  end
  subgraph P4["4.0 Ranking and Distribution"]
    P4A["4.1 TOPSIS Ranking"]
    P4B["4.2 Sigmoid Mapping"]
    P4C["4.3 Distribusi Proporsional"]
    P4D["4.4 Mint SBT Reputasi"]
  end
  subgraph DS["Data Store"]
    D1[("Escrow Pool Smart Contract")]
    D2[("QoS Matrix")]
    D3[("Bobot BWM")]
    D4[("Blockchain SBT Balance")]
  end
  AU -->|"paper + ETH"| P1A
  P1A --> P1B
  P1B -->|"escrow"| D1
  ED -->|"assign list"| P1C
  RV -->|"review text + timestamp"| P2A
  P2A --> P2B
  P2A --> P2C
  ED -->|"acceptance ratio"| P2D
  D4 -->|"SBT balance"| P2E
  P2B --> D2
  P2C --> D2
  P2D --> D2
  P2E --> D2
  D2 -->|"raw matrix"| P3A
  ED -->|"BWM prefs"| P3B
  P3A --> P3C
  P3B --> D3
  P3C --> P3D
  D3 --> P3D
  P3D -->|"fused weights"| P4A
  P3A -->|"normalized matrix"| P4A
  P4A -->|"TOPSIS scores"| P4B
  P4B -->|"sigmoid values"| P4C
  D1 -->|"escrow pool"| P4C
  P4C -->|"ETH rewards"| RV
  P4C --> P4D
  P4D -->|"mint SBT"| D4