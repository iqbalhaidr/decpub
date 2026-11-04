/**
 * Enum status on-chain dan nama tampilannya. Satu sumber untuk server, frontend, dan skrip.
 * Urutan sama dengan `IPublicationSessions.PublicationStatus` dan enum lain di kontrak Ciko.
 */
export const PublicationStatus = {
  None: 0,
  Submitted: 1,
  UnderAutomaticChecking: 2,
  Incomplete: 3,
  UnderAnonymization: 4,
  UnderEditorialScreening: 5,
  MinorRevisionRequired: 6,
  MajorRevisionRequired: 7,
  AssigningReviewers: 8,
  UnderReview: 9,
  Accepted: 10,
  Rejected: 11,
  Published: 12,
} as const;
export type PublicationStatusValue = (typeof PublicationStatus)[keyof typeof PublicationStatus];

export const PUBLICATION_STATUS_NAMES = [
  "None",
  "Submitted",
  "UnderAutomaticChecking",
  "Incomplete",
  "UnderAnonymization",
  "UnderEditorialScreening",
  "MinorRevisionRequired",
  "MajorRevisionRequired",
  "AssigningReviewers",
  "UnderReview",
  "Accepted",
  "Rejected",
  "Published",
] as const;

/** Sama dengan `IAutomaticChecks.AutomaticCheckResult`. */
export const AutomaticCheckResult = { None: 0, Pass: 1, Incomplete: 2, Reject: 3 } as const;
export type AutomaticCheckResultValue = (typeof AutomaticCheckResult)[keyof typeof AutomaticCheckResult];
export const AUTOMATIC_CHECK_RESULT_NAMES = ["None", "Pass", "Incomplete", "Reject"] as const;

/** Sama dengan `IEditorialScreenings.DeskReviewDecision`. */
export const DeskDecision = { None: 0, ProceedToReviewerSelection: 1, ReviseBeforeReview: 2, DeskReject: 3 } as const;
export const DESK_DECISION_NAMES = ["None", "ProceedToReviewerSelection", "ReviseBeforeReview", "DeskReject"] as const;

/** Sama dengan `IReviewSubmissions.ReviewPhase`. */
export const ReviewPhase = { None: 0, Commit: 1, Reveal: 2, Closed: 3 } as const;
export type ReviewPhaseValue = (typeof ReviewPhase)[keyof typeof ReviewPhase];
export const REVIEW_PHASE_NAMES = ["None", "Commit", "Reveal", "Closed"] as const;

/** Sama dengan `IReviewSubmissions.ReviewRecommendation`. */
export const RECOMMENDATION_NAMES = ["None", "Reject", "MajorRevision", "MinorRevision", "AcceptAsIs"] as const;

/** Sama dengan `IReviewDecisions.DecisionOutcome`. */
export const DecisionOutcome = { None: 0, Reject: 1, MajorRevision: 2, MinorRevision: 3, AcceptAsIs: 4 } as const;
export const DECISION_OUTCOME_NAMES = ["None", "Reject", "MajorRevision", "MinorRevision", "AcceptAsIs"] as const;

export function statusName(value: number): string {
  return PUBLICATION_STATUS_NAMES[value] ?? "Unknown";
}

/** Bidang keilmuan (kategori jurnal). Slug sama dengan katalog Roihan (013_journals). */
export const FIELD_SLUGS = ["ai", "computer-security", "blockchain", "cloud-computing", "data-science"] as const;
export type FieldSlug = (typeof FIELD_SLUGS)[number];
export const isFieldSlug = (v: unknown): v is FieldSlug => (FIELD_SLUGS as readonly unknown[]).includes(v);
