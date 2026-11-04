
flowchart LR
  AU(("Author"))
  ED(("Editor"))
  RV(("Reviewer"))

  SYS["Sistem Insentif\nPeer Review\n(Hybrid Adaptive)"]

  AU -->|"Paper + Escrow ETH"| SYS
  ED -->|"BWM Prefs, lambda, Accuracy Score"| SYS
  RV -->|"Review Text + Timestamp"| SYS

  SYS -->|"Reward ETH (proporsional)"| RV
  SYS -->|"SBT Reputation (non-transferable)"| RV
  SYS -->|"Ranking and Audit Trail"| AU
  SYS -->|"Evaluation Report"| ED

