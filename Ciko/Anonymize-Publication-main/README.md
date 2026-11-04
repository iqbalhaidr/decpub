# Anonymize Publication

Made by NoHaitch (Francisco Trianto)

> [As a Proof of Concept for my Thesis](https://digilib.itb.ac.id/gdl/view_data/mekanisme-anonimitas-berbasis-model-triple-blind-peer-review-untuk-mengurangi-bias-identitas-dalam-sistem-publikasi-ilmiah-terbuka-berbasis-distributed-ledger-technology-13522091)


> Note: The mechanism specification is available at [docs/Spesifikasi Mekanisme Anonimitas Triple-Blind Peer Review.pdf](docs/Spesifikasi%20Mekanisme%20Anonimitas%20Triple-Blind%20Peer%20Review.pdf). This document is written in Bahasa Indonesia.
>
> Demo video: [Watch the demo on YouTube](https://youtu.be/4ynMcOD1jh4) (the dub is in Bahasa Indonesia).
>
> Side note: the current program has evolved slightly from the demo, but the changes are limited to refinements such as cleaner Swagger documentation. There are no actual functionality changes compared to the video.

Anonymize Publication is a proof-of-concept **Triple-Blind Peer Review** system based on Distributed Ledger Technology (DLT). It enforces strict process isolation and identity redaction to reduce confirmation and aggregation biases in academic publishing. The architecture utilizes a NestJS server orchestration layer tightly integrated with 9 dedicated smart contracts.

## Table of Contents

- [1. High-Level Architecture](#1-high-level-architecture)
- [2. Architecture Details](#2-architecture-details)
- [3. Pipeline Flow & Requirements Mapping (P01–P08)](#3-pipeline-flow--requirements-mapping-p01p08)
- [4. Getting Started](#4-getting-started)
- [5. End-to-End Sequence (P01 to P08)](#5-end-to-end-sequence-p01-to-p08)
- [6. Proof-of-Concept Boundaries](#6-proof-of-concept-boundaries)
- [7. Verification and Evaluation](#7-verification-and-evaluation)
- [8. Repository Structure](#8-repository-structure)

## 1. High-Level Architecture

The system operates across two distinct layers to bridge off-chain operational data with on-chain cryptographic auditability:

1. **Server / Backend Layer (NestJS)**: Acts as the main orchestration engine. It handles API endpoints, business workflows, manuscript metadata routing, and serves as an abstraction layer to query the blockchain safely.
2. **Blockchain / Smart Contract Layer (Hardhat/Solidity)**: Serves as the immutable ledger. It does not store actual manuscripts or raw identities; instead, it records cryptographic commitments, pseudonyms, state transitions, and proof references.

The server's endpoints and services map business workflows (F01-F20) into smart contract actions, ensuring a verifiable public projection of the peer-review lifecycle while maintaining structural anonymity (NF01-NF04).

## 2. Architecture Details

### A. Server Layer (NestJS)

Located in `server/src/`:

- **App / Health (`app.*`)**: Core module configuration and basic health checks.
- **Blockchain & Contracts (`blockchain/`, `contracts/`)**: Viem-based client configuration that abstracts Ethereum RPC calls and handles ABI encoding for the 9 smart contracts.
- **Manuscripts Pipeline (`manuscripts/`)**: Handles the off-chain processes including manuscript intake (P01), document-based automatic checks (P03), and rule-based anonymization (P04).
- **Flows / Orchestration (`flows/`)**: Maps HTTP POST actions into complex multi-contract state transitions for the entire P02-P08 pipeline.
- **Query / Projection (`query/`)**: Handles HTTP GET requests to build isolated, pseudonymized views of session data.
- **Evaluation Artifacts (`evaluation/`)**: Proxy-based evaluation suites used to validate structural anonymity.

### B. Smart Contract Layer (Solidity)

Located in `contracts/contracts/`:

1. **PermanentAccounts**: Long-term identity registry.
2. **EphemeralAccounts**: Issues session-scoped pseudonyms.
3. **PublicationSessions**: Core workflow state machine ledger.
4. **AutomaticChecks**: Records automated screening results.
5. **EditorialScreenings**: Logs initial desk review outputs by editors.
6. **AssignmentProofs**: Secures the asymmetric mapping of assigned reviewers/editors.
7. **ReviewerSelections**: Stores audit trails for reviewer selection batches.
8. **ReviewSubmissions**: Facilitates a commit-reveal scheme for peer reviews.
9. **ReviewDecisions**: Aggregates final recommendations and detects gray-zone outcomes.

## 3. Pipeline Flow & Requirements Mapping (P01–P08)

The peer review lifecycle sequentially implements the F01-F20 functional requirements through 8 operational phases (P01-P08):

**P01 – Pre-Submission Infrastructure (Non-DLT)**
The system receives raw manuscript uploads off-chain, stores them in a trusted environment, and performs deterministic hashing in preparation for submission.

- **Function**: (Pre-System Preparation)
- **Endpoints**: `POST /manuscripts/intake`, `GET /manuscripts/:id/manifest`, `GET /manuscripts/demo/sample`
- **Controller/Service**: `ManuscriptsController`, `ManuscriptsService`
- **Smart Contract**: None (Local Storage)

**P02 – Manuscript Submission (F01–F04)**
The author initiates a publication session by submitting the manuscript hash and metadata to the DLT using an ephemeral account. This fulfills submission (F01), metadata encryption (F02), and anonymous identity attribution (F03-F04) requirements.

- **Endpoints**: `POST /flows/submission`
- **Controller/Service**: `FlowsController`, `FlowsService`
- **Smart Contract**: `PublicationSessions`

**P03 – Automatic Completeness Checking (F05–F06)**
The system automatically validates the document structure and records the formal evaluation results to the DLT. This fulfills format validation (F05) and auditability of checking reports (F06).

- **Endpoints**: `POST /manuscripts/automatic-check`, `POST /flows/automatic-checks`
- **Controller/Service**: `ManuscriptsController`, `FlowsController`
- **Smart Contract**: `AutomaticChecks`

**P04 – Identity Redaction (F07–F08)**
The system strips document metadata and redacts sensitive text in the PDF, producing an anonymized version alongside its separation proof on the DLT. This fulfills identity sanitization (F07) and artifact separation validation (F08).

- **Endpoints**: `POST /manuscripts/:id/anonymize`, `POST /flows/anonymization`
- **Controller/Service**: `ManuscriptsController`, `FlowsController`
- **Smart Contract**: `PublicationSessions`

**P05 – Editorial Screening (F09–F11)**
An Editor is assigned and conducts an initial desk review purely from the anonymized document. This fulfills editor assignment (F09), initial screening (F10), and decision auditing (F11).

- **Endpoints**: `POST /flows/assign-editor`, `POST /flows/editorial-screening`
- **Controller/Service**: `FlowsController`, `FlowsService`
- **Smart Contract**: `EditorialScreenings`, `AssignmentProofs`

**P06 – Reviewer Selection (F12–F14)**
A pool of reviewer candidates is selected with obfuscated probability, and assignment proofs are recorded on-chain. This satisfies random selection (F12), list locking (F13), and assignment proof preservation (F14).

- **Endpoints**: `POST /flows/reviewer-selection`, `POST /flows/assignment-proofs/reviewers`
- **Controller/Service**: `FlowsController`, `FlowsService`
- **Smart Contract**: `ReviewerSelections`, `AssignmentProofs`

**P07 – Review & Final Decision (F15–F18)**
Implements a commit-reveal scheme allowing reviewers to assess independently (F15-F16). Value aggregation is performed automatically by the on-chain system (F17-F18).

- **Endpoints**: `POST /flows/reviews/commit`, `POST /flows/reviews/reveal`, `POST /flows/review-decisions/decide`
- **Controller/Service**: `FlowsController`, `FlowsService`
- **Smart Contract**: `ReviewSubmissions`, `ReviewDecisions`

**P08 – Post-Publication (F19–F20)**
After a final decision, the publication status is permanently finalized on the DLT as an absolute reference (Audit Trail), fulfilling finalization (F19) and audit trail availability (F20).

- **Endpoints**: `POST /flows/publication/finalize`
- **Controller/Service**: `FlowsController`, `FlowsService`
- **Smart Contract**: `PublicationSessions`

## 4. Getting Started

### 4.1 Prerequisites

- Node.js (v18+)
- NPM or Bun
- Hardhat (for local blockchain testing)

### 4.2 Installation

```bash
# 1. Install contract dependencies
cd contracts
npm install

# 2. Install server dependencies
cd ../server
npm install
```

### 4.3 Environment Setup

Create a `.env` file in the `server/` directory:

```env
RPC_URL=http://127.0.0.1:8545
PRIVATE_KEY=0xYourPrivateKey...
app.contracts.permanentAccounts=0x...
```

### 4.4 Running the Application

```bash
cd server
npm run start:dev
```

Open Swagger UI at `http://localhost:3000/api` to interact with the endpoints.

## 5. End-to-End Sequence (P01 to P08)

The following example shows how to utilize the PoC pipeline step-by-step using cURL or Swagger UI to satisfy requirements F01-F20.

**Step 0: Generate Dummy Document (Helper P01)**
Generate a ready-to-test dummy PDF file for this scenario:

```bash
# Swagger: GET /manuscripts/demo/sample
npm run generate:sample
# Output: server/sample-files/demo_manuscript.pdf
```

**Step 1: P01 - Intake (Preparation)**
Upload the document to the server. The off-chain system processes and returns the manifest structure along with the hash.

```bash
curl -X POST http://localhost:3000/manuscripts/intake \
  -F "title=Measuring Bias in Open Source Peer Review" \
  -F "authorName=John Doe" \
  -F "authorEmail=john.doe@university.edu" \
  -F "file=@server/sample-files/demo_manuscript.pdf"
```

**Step 2: P02 - Manuscript Submission (Fulfills F01-F04)**
Use `fileHash` and `metadataHash` from P01 to anonymously submit the session to the DLT.

```bash
curl -X POST http://localhost:3000/flows/submission \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "0x...", "authorPseudonym": "0x...", "originalManuscriptHash": "0x...", "anonymizedManuscriptHash": "0x...", "metadataHash": "0x...", "anonymousManuscriptURI": "ipfs://...", "anonymousMetadataURI": "ipfs://..."}'
```

**Step 3: P03 - Automatic Checking (Fulfills F05-F06)**
Run off-chain completeness validation, retrieve `reportHash`, and record the proof to the DLT.

```bash
# Off-chain check
curl -X POST http://localhost:3000/manuscripts/automatic-check \
  -F "manuscriptId=UUID_DARI_P01"

# On-chain anchoring
curl -X POST http://localhost:3000/flows/automatic-checks \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "0x...", "reportHash": "0x...", "flagsHash": "0x...", "reportURI": "ipfs://...", "result": 1}'
```

**Step 4: P04 - Identity Redaction (Fulfills F07-F08)**
Command the server to strip metadata & identities from the PDF (F07), then anchor its validation proof (F08) to the DLT.

```bash
# Off-chain anonymization
curl -X POST http://localhost:3000/manuscripts/UUID_DARI_P01/anonymize

# On-chain anchoring
curl -X POST http://localhost:3000/flows/anonymization \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "0x...", "anonymizedFileHash": "0x...", "anonymizationSummary": "Stripped metadata and redacted sensitive fields."}'
```

**Step 5: P05 - Editorial Screening (Fulfills F09-F11)**
Assign an editor (F09) and execute a desk review of the anonymized document (F10-F11).

```bash
curl -X POST http://localhost:3000/flows/assign-editor \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "0x...", "editorPseudonym": "0x..."}'

curl -X POST http://localhost:3000/flows/editorial-screening \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "0x...", "editorPseudonym": "0x...", "decision": 1, "screeningReportHash": "0x...", "reportURI": "ipfs://..."}'
```

**Step 6: P06 - Reviewer Selection (Fulfills F12-F14)**
Random selection of obfuscated reviewers (F12-F13) and anchoring their proofs (F14).

```bash
curl -X POST http://localhost:3000/flows/reviewer-selection \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "0x...", "selectedReviewerCommitments": ["0x..."], "selectionProofHash": "0x..."}'

curl -X POST http://localhost:3000/flows/assignment-proofs/reviewers \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "0x...", "assignments": [{"reviewerAssignmentCommitment": "0x...", "proofRef": "ipfs://..."}]}'
```

**Step 7: P07 - Review & Final Decision (Fulfills F15-F18)**
Reviewers submit their reviews in a commit-reveal scheme (F15-F16). The system then infers the decision (F17-F18).

```bash
# 1. Commit
curl -X POST http://localhost:3000/flows/reviews/commit \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "0x...", "reviewerPseudonym": "0x...", "reviewContentHash": "0x...", "decisionCommitment": "0x...", "salt": "0x..."}'

# 2. Reveal
curl -X POST http://localhost:3000/flows/reviews/reveal \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "0x...", "reviewerPseudonym": "0x...", "decision": 1, "salt": "0x...", "reviewURI": "ipfs://..."}'

# 3. Decide
curl -X POST http://localhost:3000/flows/review-decisions/decide \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "0x...", "finalDecision": 1, "decisionJustificationHash": "0x...", "justificationURI": "ipfs://..."}'
```

**Step 8: P08 - Post-Publication (Fulfills F19-F20)**
Finalize publication to permanently close the official manuscript status (F19) and ensure its history is auditable (F20).

```bash
curl -X POST http://localhost:3000/flows/publication/finalize \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "0x...", "finalManuscriptURI": "ipfs://...", "finalMetadataURI": "ipfs://..."}'
```

## 6. Proof-of-Concept Boundaries

To maintain strict academic honesty, this prototype establishes specific boundaries ensuring requirements NF01-NF04:

- **Trusted Server Component**: The NestJS server acts as a trusted orchestrator to handle physical PDFs (P01, P03, P04). It enforces isolation deterministically but prevents large bloat on the blockchain.
- **No External Database**: We rely on a local `storage/manuscripts/` filesystem for this PoC. Production uses IPFS.
- **Rule-Based Anonymization**: The P04 module uses deterministic metadata stripping. It does _not_ utilize AI/NLP.
- **On-Chain Minimization**: Smart contracts only store 32-byte cryptographic hashes and commitments. Plaintext documents and real identities never touch the DLT.

## 7. Verification and Evaluation

The repository holds an extensive test suite (124 unit tests, 13+ E2E tests) specifically mapping to the F01-F20 functions and NF01-NF04 constraints.

### 7.1 Running the Full Evaluation Suite

To execute the entire test suite (Unit, E2E, and all Evaluation scenarios) and automatically generate the comprehensive JSON/CSV reporting artifacts:

```bash
cd server
npm run test:all:report
```

_This command runs all tests and clears/rebuilds the `test-results/evaluation/` directory._

### 7.2 Non-Functional Requirements (NF01-NF04)

- **NF01 (Unlinkability) & NF02 (Unobservability)**: Tested via `structural-anonymity.evaluation.spec.ts` and `nf.evaluation.spec.ts` ensuring the absence of _permanent identifiers_ on public objects.
- **NF03 (Unforgeability)**: Validated via contract encapsulation and _role-based access_ in _flows.service.ts_.
- **NF04 (Auditability)**: Proven by the `PublicController` endpoint, which unifies the history without leaking privacy.

### 7.3 Quantitative Formal Metrics (Information Theoretic)

This system utilizes Information Theoretic quantitative evaluation to measure the degree of confidentiality in _reviewer selection_ and _commit-reveal_ scenarios:

- **$N$ (Anonymity Set Size)**: Total number of candidates or the user pool size.
- **$H(P)$ (Entropy Bits)**: Actual Shannon Entropy of the set ($-\Sigma (p_i \cdot \log_2 p_i)$) representing system confidentiality.
- **$N_{eff}$ (Effective Anonymity Set Size)**: Calculated from $2^{H(P)}$, indicating the _effective pool_ size if the distribution is non-uniform.
- **$d$ (Normalized Degree of Anonymity)**: The ratio between $H(P)$ and its theoretical upper bound ($\log_2 N$), ranging from $[0, 1]$.
- **Sensitive Fields**: Number of exposed attributes (e.g., _review text_, _recommendation_).
- **Exposure Delta**: The increase in _sensitive fields_ between phases (e.g., from _commit_ to _reveal_).

_Uniform vs Explicit Distribution_: By default, if only the set size $N$ is provided, the metrics automatically assume a _Uniform_ probability distribution. _Skewed_ distributions are injected mathematically during the _Scenario Matrix_ tests to evaluate the resilience of the anonymity matrix.

### 7.4 Ablation and Comparative Evaluation

This repository includes a dedicated Ablation Evaluation Suite (`anonymity-technique-ablation.evaluation.spec.ts`) designed to prove that the implemented anonymity techniques actively and significantly impact the overall anonymity metrics.

#### A. Implemented Techniques Evaluated

These techniques are fully implemented in the current Proof-of-Concept (PoC) and are evaluated based on their actual application-layer projections:

- **Ephemeral Account / Pseudonymization**: Disabling this exposes direct identifiers (`realName`, `email`) instead of session-scoped pseudonyms.
- **Assignment Commitments & Proof Summaries**: Disabling assignment commitments collapses the anonymity set (`effectiveAnonymitySetSize` drops to 1). Explicit assignment summaries increase identity leakage compared to hashed proof references.
- **Commit-Reveal**: Omitting the commit phase results in premature sensitive field exposure (`exposureDelta` degradation) revealing reviewer decisions too early.

#### B. Conceptual / Counterfactual Techniques Evaluated

These techniques are **not fully implemented** in the current network-level PoC. They are tested strictly as **[CONCEPTUAL SIMULATIONS]**:

- **Zero-Knowledge Proofs (ZKP) / Anonymous Credentials**: Modeled to show that without ZKP, membership eligibility checks would directly leak the permanent identity (exposing role and real name).
- **Stealth Address / Stealth Routing**: Modeled to show that without stealth routing, reviewer assignments would expose the exact linkage rather than using privacy-preserving routing artifacts (`inviteRef`).

_Why evaluate conceptually?_
The conceptual ablation scenarios are included solely to demonstrate the **directional impact** of these advanced cryptographic primitives on structural anonymity metrics. They prove that _if_ ZKP and stealth addresses were fully integrated at the network layer, they would prevent specific types of identity leakage. This does not claim that the current smart contracts have active ZKP or Stealth Address implementations.

#### C. Running the Ablation Suite Only

To run _only_ the Ablation Evaluation Suite (and generate its specific artifacts):

```bash
cd server
npm run test:evaluation:ablation
```

### 7.5 Methodological Limitations & Boundaries

- This metric evaluation runs at the **application/projection level proxy metrics** based on the state recorded in the DLT.
- The probability tests used are **evaluative mathematical models** to analyze anonymity sensitivity, **not** derived from real-world traffic observations.
- This entropy value $H(P)$ serves as structural proof of the framework, **not** a validation claim of full network-level unobservability (such as resistance to ISP monitoring).
- Scenarios that are inherently irrelevant for entropy measurement are transparently flagged with `supportsFormalEntropy: false`.

## 8. Repository Structure

```text
Anonymize-Publication/
├── contracts/                     # Solidity smart contracts & tests
├── server/                        # NestJS backend orchestrator
│   ├── src/
│   │   ├── flows/ & query/        # P02-P08 On-chain business orchestrations
│   │   ├── manuscripts/           # P01, P03, P04 Off-chain PDF pipeline
│   │   └── evaluation/            # Formal evaluation logic and proxy metrics
│   ├── storage/                   # Local file storage for manuscripts
│   └── test/                      # E2E test suites
└── README.md                      # Main entry point (this file)
```
