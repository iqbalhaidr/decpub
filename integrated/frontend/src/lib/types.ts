/** Bentuk balasan backend yang dipakai frontend (subset). Sumber kebenaran: server/src dan Swagger /api. */

export interface PublicConfig {
  network: string;
  chainId: number;
  contracts: Record<string, string>;
  storage: { apiUrl: string; gatewayUrl: string };
  zkUrl: string;
  escrowRequired: boolean;
  plagiarismThreshold: number;
  simulations: string[];
}

export interface Stats {
  articlesPublished: number;
  byJournal: { journal: string; articles: number }[];
  reviewsOnPublishedArticles: number;
  authorsDisclosed: number;
  editorsDisclosed: number;
  commentsPosted: number;
  reviewersWithVerifiedFields: number;
  pendingFieldVerifications: number;
}

export interface Journal {
  id: number;
  name: string;
  categorySlug: string;
  categoryLabel: string;
  apcWei: string;
  weightPolicy: { preset: string; lambda: number };
}

export interface ArticleSummary {
  sessionId: string;
  doi: string;
  title: string;
  abstract: string;
  keywords: string[];
  journal: { id: number; name: string; category: string } | null;
  publishedAt: number;
  revisionCount: number;
  authorName: string | null;
  authorDisclosed: boolean;
}

export interface ManuscriptRow {
  id: string;
  journalId: number;
  sessionId: string;
  title: string;
  createdAt: string;
  submittedAt: string | null;
}

export interface Party {
  disclosed: boolean;
  attributes?: Record<string, string | null> | null;
  attributesVerified?: boolean;
  attributesHash?: string;
  permanentAccount?: string;
  pseudonym?: string;
  disclosedAt?: number;
  originalManuscript?: {
    url: string;
    cid: string;
    uploaded: boolean;
    sha256MatchesOnChain: boolean | null;
    expectedHash: string;
  } | null;
}

export interface Decision {
  batch: number;
  outcome: string;
  grayZone: boolean;
  reviewerCount: number;
  additionalReviewerCount?: number;
}

export interface ArticleDetail {
  sessionId: string;
  doi: string;
  doiTokenId: number;
  publishedAt: number;
  revisionCount: number;
  title: string | null;
  abstract: string;
  keywords: string[];
  journal: { id: number; name: string; category: string } | null;
  anonymizedManuscript: { url: string; uri: string; sha256Anonymized: string };
  metadataUrl: string;
  hashes: { original: string; anonymized: string; metadata: string };
  author: Party;
  editor: Party;
  reviewers: { disclosed: false; reviews: number };
  decision: Decision | null;
}

export interface OpenReview {
  sessionId: string;
  doi: string;
  note: string;
  editorial: {
    revision: number;
    decision: string;
    comments: string | null;
    reviewerCriteria: unknown;
    reportUrl: string;
    hashVerified: boolean;
  }[];
  batches: {
    batch: number;
    decision: { outcome: string; grayZone: boolean; reviewerCount: number; additionalReviewerCount: number } | null;
    reviews: { pseudonym: string; recommendation: string; text: string | null; reviewUrl: string; hashVerified: boolean; revealedAt: number }[];
  }[];
}

export interface CommentsResponse {
  doi: string;
  doiTokenId: number;
  comments: { handle: string | null; body: string | null; contentHash: string; txHash: string; blockNumber: number; postedAt: number; verified: boolean }[];
}

export interface AuditEntry {
  order: number;
  blockNumber: number;
  timestamp: number;
  txHash: string;
  logIndex: number;
  contract: string;
  event: string;
  summary: string;
}

export interface CheckReport {
  checkedAt: string;
  fileSize: number;
  pageCount: number;
  flags: Record<string, boolean | number | string>;
  identityExposedFields: string[];
  plagiarism: { provider: string; score: number; threshold: number };
  result: string;
  notes: string;
}

export interface SessionProjection {
  session: {
    sessionId: string;
    status: string;
    statusValue: number;
    createdAt: number;
    updatedAt: number;
    revisionCount: number;
    originalManuscriptHash: string;
    anonymizedManuscriptHash: string;
    metadataHash: string;
  };
  anonymizedManuscriptUrl: string;
  automaticCheck: { batch: number; result: string; recordedAt: number } | null;
  reportUrl: string | null;
  editorial: { revision: number; decision: string; recordedAt: number; reportUrl: string } | null;
  selection: { batch: number; selected: number; bound: number };
  review: {
    phase: string;
    roundBatches: number[];
    committed: number;
    revealed: number;
    reviews: { pseudonym: string; recommendation: string; reviewUrl: string; revealedAt: number }[] | null;
  };
  decision: (Decision & { outcomeValue?: number }) | null;
  decisions: (Decision & { decidedAt: number })[];
  publication: { doi: string; doiTokenId: number; publishedAt: number } | null;
}

export interface EscrowStatus {
  state: string;
  amountWei: string;
  boundAt: number | null;
  unclaimedWei: string;
  refundable: boolean;
  distributable: boolean;
  escrowRequired: boolean;
}

export interface IncentiveView {
  sessionId: string;
  escrow: { state: string; amountWei: string; unclaimedWei: string; refundable: boolean; distributable: boolean };
  policy: { preset: string; lambda: number; hash: string; lockedAt: string; lockedLate: boolean; detail: unknown } | null;
  distribution: null | {
    reviewerCount: number;
    executedAt: number;
    qosReportHash: string;
    policyHash: string;
    policyMatchesLocked: boolean | null;
    reportCid: string | null;
    reportUrl: string | null;
    reportMatchesOnChain: boolean;
    txHash: string | null;
    qosProvider: string | null;
    weights: { bwm: number[]; bwmConsistencyRatio: number; ecwm: number[]; fused: number[] } | null;
    rows: {
      pseudonym: string;
      batch: number;
      q1Days: number;
      q2: number;
      q3: number;
      tier: number;
      q4: number;
      score: string;
      sigmoid: string;
      rewardWei: string;
      claimed: boolean;
    }[];
  };
}
