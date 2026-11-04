# Smart Contracts

This package contains the smart contracts for the Anonymity Mechanism proof of concept. It uses Hardhat 3, TypeScript, Viem, Ignition, and the built-in Node.js test runner, and targets Ethereum Sepolia for deployment and testing.

The contracts form an auditable on-chain layer for permanent identities, session-scoped pseudonyms, publication sessions, reviewer selection, assignment proofs, automatic checks, editorial screening, reviewer commit-reveal submissions, and recommendation aggregation with gray-zone handling.

Most privacy-sensitive content and policy-heavy operations remain off-chain, including manuscript storage, anonymization and de-anonymization, reviewer candidate discovery, conflict checks, invitation delivery, encrypted content handling, and selective disclosure workflows. The on-chain layer stores only the state transitions, proofs, commitments, hashes, and records that must remain immutable and auditable.

## Design Overview

The architecture follows a minimal on-chain approach. Smart contracts record identity anchors, session-scoped pseudonyms, publication workflow state, reviewer-selection outcomes, assignment proofs, automatic-check records, editorial-screening records, review commit-reveal records, and aggregated recommendation outcomes.

The server or other off-chain components still handle manuscript and metadata storage, anonymization, reviewer discovery and ranking, invitation transport, conflict-of-interest analysis, encrypted content handling, and journal-specific operational policy.

Current contract responsibilities:

- `PermanentAccounts` stores long-lived user accounts and identity commitments.
- `EphemeralAccounts` issues session-scoped pseudonyms derived from valid permanent identities.
- `PublicationSessions` records the lifecycle of a manuscript submission and review process.
- `ReviewerSelections` stores reviewer-selection batches and selected reviewer commitments.
- `AssignmentProofs` stores assignment-related proofs without exposing reviewer identity directly.
- `AutomaticChecks` stores batched results of automatic submission checking before the manuscript proceeds to the next publication stage.
- `EditorialScreenings` stores desk review outputs for anonymized manuscripts handled by the assigned editor.
- `ReviewSubmissions` stores reviewer commit-reveal records and anonymous review artifacts during the review phase.
- `ReviewDecisions` aggregates revealed reviewer recommendations, detects gray-zone outcomes, requests additional reviewers when needed, and stores batch-level decision results.

## Repository Layout

```text
contracts/
├── contracts/
│   ├── interfaces/
│   │   ├── IAssignmentProofs.sol
│   │   ├── IAutomaticChecks.sol
│   │   ├── IEditorialScreenings.sol
│   │   ├── IEphemeralAccounts.sol
│   │   ├── IPermanentAccounts.sol
│   │   ├── IPublicationSessions.sol
│   │   ├── IReviewDecisions.sol
│   │   ├── IReviewerSelections.sol
│   │   └── IReviewSubmissions.sol
│   ├── AssignmentProofs.sol
│   ├── AutomaticChecks.sol
│   ├── EditorialScreenings.sol
│   ├── EphemeralAccounts.sol
│   ├── PermanentAccounts.sol
│   ├── PublicationSessions.sol
│   ├── ReviewDecisions.sol
│   ├── ReviewerSelections.sol
│   └── ReviewSubmissions.sol
├── ignition/
│   ├── modules/
│   │   ├── AssignmentProofs.ts
│   │   ├── AutomaticChecks.ts
│   │   ├── EditorialScreenings.ts
│   │   ├── EphemeralAccounts.ts
│   │   ├── FullSystem.ts
│   │   ├── PermanentAccounts.ts
│   │   ├── PublicationSessions.ts
│   │   ├── ReviewDecisions.ts
│   │   ├── ReviewerSelections.ts
│   │   └── ReviewSubmissions.ts
│   └── parameters.json
├── scripts/
│   └── batch-register.ts
└── test/
    ├── AssignmentProofs.test.ts
    ├── AutomaticChecks.test.ts
    ├── EditorialScreenings.test.ts
    ├── EphemeralAccounts.test.ts
    ├── FullFlow.test.ts
    ├── PermanentAccounts.test.ts
    ├── PublicationSessions.test.ts
    ├── ReviewDecisions.test.ts
    ├── ReviewerSelections.test.ts
    └── ReviewSubmissions.test.ts
```

## Deployment Approach

The recommended deployment flow uses the full Ignition module graph through `ignition/modules/FullSystem.ts`.

This is the default and preferred approach because the module graph already composes all inter-contract dependencies internally. In practice, this means you do not need to deploy contracts one by one or manually copy constructor addresses between modules.

The full deployment graph includes:

1. `PermanentAccounts`
2. `EphemeralAccounts`
3. `PublicationSessions`
4. `ReviewerSelections`
5. `AssignmentProofs`
6. `AutomaticChecks`
7. `EditorialScreenings`
8. `ReviewSubmissions`
9. `ReviewDecisions`

## Ignition Modules

Each contract still has its own Ignition module for composition and testing purposes, but the main deployment entry point is:

- `FullSystem.ts`

The lower-level modules are used internally by the Ignition graph through `m.useModule(...)`, so the full system deployment automatically wires constructor dependencies in the correct order.

## Setup

### 1. Configure secrets

Store the Sepolia RPC URL and deployer private key in the Hardhat keystore.

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

The Hardhat config reads these values through `configVariable(...)` for the Sepolia network.

### 2. Prepare `ignition/parameters.json`

For the full-system deployment flow, `ignition/parameters.json` only needs to provide the seeded permanent accounts used by `scripts/batch-register.ts`.

Minimal example:

```json
{
    "_comment": "Seeded permanent accounts for the Sepolia test deployment.",
    "_note": "Use test wallets only. Do not place production wallets or funded private keys here.",
    "PermanentAccountsModule": {
        "initialAccounts": [
            {
                "address": "0xPublicKey",
                "privateKey": "0xPrivateKey"
            }
        ]
    }
}
```

Only use test wallets here. Do not store production wallets, funded private keys, or sensitive operational keys in this file.

### 3. Reset old deployments if needed

If you changed constructor parameters, function signatures, contract behavior, or module wiring, remove prior Ignition deployment artifacts before redeploying.

Typical cleanup targets:

- `ignition/deployments/chain-*`
- old deployment folders such as `sepolia-full-system-v1`
- stale generated artifacts tied to previous contract versions

### 4. Deploy the full system

Deploy the entire contract graph through the single full-system module:

```bash
npx hardhat ignition deploy ignition/modules/FullSystem.ts \
  --network sepolia \
  --parameters ignition/parameters.json \
  --deployment-id sepolia-full-system-v1
```

This deployment graph automatically composes the full contract stack and resolves constructor dependencies through Ignition module composition.

### 5. Seed permanent accounts

After deployment, seed the permanent accounts into the deployed `PermanentAccounts` contract.

```bash
PERMANENT_ACCOUNTS_ADDRESS=0xPermanentAccountsAddress \
  npx hardhat run scripts/batch-register.ts --network sepolia
```

The script reads test wallets from `ignition/parameters.json`, validates each address and private-key pair, derives the identity secret and identity commitment, saves derived local credentials to `ignition/.credentials.json`, skips accounts that are already registered, and batch-registers the remaining accounts.

## Contract Notes

### PermanentAccounts

Stores the permanent identity anchor for each participant. It supports self-registration, admin registration, and admin batch registration, while enforcing unique addresses and unique identity commitments.

This contract is the long-term identity registry and is not used for routine review activity. Later pseudonym creation depends on the commitments stored here.

### EphemeralAccounts

Creates session-scoped pseudonyms for roles such as author, editor, and reviewer. Each pseudonym is bound to a specific `sessionId`, role, and valid permanent identity commitment.

This contract is part of the unlinkability layer. It also tracks active and revoked pseudonyms, session usage, and global commitment reuse constraints.

### PublicationSessions

Acts as the main workflow ledger for manuscript and publication state. It stores author and editor pseudonyms, manuscript and metadata hashes, URIs, revision count, reviewer criteria, and the main publication status machine.

This contract is the workflow backbone. It also exposes status transitions used by other contracts such as `AutomaticChecks`, `EditorialScreenings`, and `ReviewDecisions`, which are authorized as session managers in the tests and deployment flow.

### ReviewerSelections

Stores the audit trail for reviewer selection after editorial screening. It records selection batches, the criteria hash, reviewer count, and selected reviewer commitments.

This contract stores reviewer-selection outcomes, not reviewer discovery or ranking logic. It also supports repeated batches when gray-zone handling requires additional reviewers.

### AssignmentProofs

Stores proof records related to editor or reviewer assignment. It records the editor assignment proof for a session and reviewer assignment proofs for selected reviewer commitments.

This contract preserves auditability without exposing reviewer identity directly. It is not the reviewer-selection engine, because reviewer selection is recorded separately in `ReviewerSelections`.

### AutomaticChecks

Stores the audit trail for the automatic checking stage near the beginning of the submission process. It records repeated checking batches per session together with the report hash, flags hash, result category, and off-chain report URI.

In the current implementation, `AutomaticChecks` also updates `PublicationSessions` after a valid check when it has been authorized as a session manager.

### EditorialScreenings

Stores the audit trail for editorial screening or desk review after anonymization. It binds each record to the assigned editor pseudonym for that session and stores both original and anonymized editorial report hashes, the anonymized report URI, and the desk review decision.

In the current implementation, `EditorialScreenings` can also drive the next workflow transition in `PublicationSessions` when it is authorized as a session manager.

### ReviewSubmissions

Stores the audit trail for reviewer submission during peer review using a commit-reveal scheme. It manages the per-session review phase, accepts commits during the commit phase, verifies reveals against the stored commitment during the reveal phase, and stores the revealed recommendation, review hash, URI, and nonce.

The commit hash is computed using `keccak256(abi.encode(...))`, so tests must match this encoding exactly. `ReviewSubmissions` does not aggregate recommendations or change workflow state by itself.

### ReviewDecisions

Stores recommendation aggregation results after the reveal phase. It reads revealed reviewer recommendations from `ReviewSubmissions`, counts votes across the four recommendation categories, detects gray-zone outcomes, stores the requested number of additional reviewers for gray-zone batches, and stores the resulting batch-level decision outcome.

In the current implementation, `ReviewDecisions` can also update `PublicationSessions` after a non-gray-zone batch when it has been authorized as a session manager.

## Publication Status Scale

`PublicationSessions` uses the following status values in the current workflow:

1. `Submitted`
2. `UnderAutomaticChecking`
3. `Incomplete`
4. `UnderAnonymization`
5. `UnderEditorialScreening`
6. `MinorRevisionRequired`
7. `MajorRevisionRequired`
8. `AssigningReviewers`
9. `UnderReview`
10. `Accepted`
11. `Rejected`
12. `Published`

Valid transitions are enforced in the contract.

## Recommendation Scale

The review and decision contracts use the following ordinal recommendation categories:

1. `Reject`
2. `MajorRevision`
3. `MinorRevision`
4. `AcceptAsIs`

These values are used directly in the commit-reveal flow and in the aggregation logic.

## Gray-Zone Handling

`ReviewDecisions` supports a gray-zone mechanism for highly inconclusive outcomes. When no category reaches majority, the batch is recorded as gray-zone with outcome `None`, and the contract stores the requested number of additional reviewers for the next reviewer-selection cycle.

In the current implementation, `decideBatch(sessionId, batch, reviewerPseudonyms, additionalReviewerCountIfGrayZone)` stores the additional reviewer request for gray-zone results instead of forcing a final decision.

## Development and Testing

### Compile

```bash
npm run compile
```

### Local Testing (Unit Tests)
Runs standard unit/integration tests on a local, in-memory simulated network.

```bash
# Run all local tests
npm run test:local

# Or run a single test file
npx hardhat test test/PermanentAccounts.test.ts --gas-stats
```

### Deployed Contract Testing (Sepolia Integration)
Runs verification tests against already-deployed contracts listed in `deployed_addresses.json`.

> [!IMPORTANT]
> To run deployed contract tests, you must configure the Hardhat 3 keystore dev environment. Hardhat reads the Sepolia RPC URL and deployer/admin private key from the keystore.
> Setup keystore:
> ```bash
> npx hardhat keystore set SEPOLIA_RPC_URL
> npx hardhat keystore set SEPOLIA_PRIVATE_KEY
> ```

```bash
# Run all deployed integration tests
npm run test:deployed

# Or run a single deployed test file
npx hardhat test test-deployed/PermanentAccounts.deployed.test.ts --gas-stats
```

### Run All Tests (Local & Deployed)
```bash
npm run test:all
```

### Gas Reporting
To run local tests and automatically collect gas usage statistics:

```bash
npm run test:gas
```


The end-to-end tests also authorize manager accounts and selected contracts via `setSessionManager(...)`, because `AutomaticChecks`, `EditorialScreenings`, and `ReviewDecisions` need permission to update `PublicationSessions` during integrated flows.

## Important Implementation Notes

- Keep files containing private keys or derived credentials local and git-ignored, even if they only contain test wallets.
- `scripts/batch-register.ts` reads seeded accounts from `PermanentAccountsModule.initialAccounts` in `ignition/parameters.json`.
- `ReviewerSelections` stores selection results, not reviewer discovery or ranking logic.
- `AssignmentProofs` is not a reviewer-selection engine.
- `ReviewSubmissions` computes commit hashes with `abi.encode`, so tests must mirror that encoding instead of packed encoding.
- `ReviewSubmissions.getRevealRecord(...)` currently reverts with `CommitNotFound` when no reveal exists.
- `ReviewDecisions.decideBatch(...)` currently accepts four parameters: `sessionId`, `batch`, `reviewerPseudonyms`, and `additionalReviewerCountIfGrayZone`.
- `ReviewDecisions` updates `PublicationSessions` for non-gray-zone results when authorized as a session manager.
- `AutomaticChecks` and `EditorialScreenings` also update `PublicationSessions` in the integrated flow when authorized as session managers.
- Reviewer identity should not be exposed directly on-chain; use commitments, pseudonyms, or proof references instead.
- Reviewer assignment proofs should be recorded before `ReviewSubmissions` accepts a review commit for that reviewer commitment.
- Review commits should be recorded during the commit phase, and reveals should be recorded during the reveal phase.
- Review decisions should be computed only after the relevant reviewer reveals have been recorded.
- Gray-zone outcomes should trigger another reviewer-selection cycle rather than forcing a premature result.
