export const PublicationStatusMap = [
  'None',
  'Submitted',
  'UnderAutomaticChecking',
  'Incomplete',
  'UnderAnonymization',
  'UnderEditorialScreening',
  'MinorRevisionRequired',
  'MajorRevisionRequired',
  'AssigningReviewers',
  'UnderReview',
  'Accepted',
  'Rejected',
  'Published',
];

export const AutomaticCheckResultMap = [
  'None',
  'Pass',
  'Incomplete',
  'Reject',
];

export const DeskReviewDecisionMap = [
  'None',
  'ProceedToReviewerSelection',
  'ReviseBeforeReview',
  'DeskReject',
];

export const ReviewRecommendationMap = [
  'None',
  'Reject',
  'MajorRevision',
  'MinorRevision',
  'AcceptAsIs',
];

export const ReviewPhaseMap = [
  'None',
  'Commit',
  'Reveal',
  'Closed',
];

export const DecisionOutcomeMap = [
  'None',
  'Reject',
  'MajorRevision',
  'MinorRevision',
  'AcceptAsIs',
];

export function mapEnum(value: number, map: string[]): string {
  if (value >= 0 && value < map.length) {
    return map[value];
  }
  return 'Unknown';
}

export function normalizeHex(value: string, expectedLength: number = 66): `0x${string}` {
  const hex = value.startsWith('0x') ? value : `0x${value}`;
  if (hex.length !== expectedLength) {
    throw new Error(`Invalid hex string length. Expected ${expectedLength}, got ${hex.length}`);
  }
  return hex as `0x${string}`;
}

export function normalizeAddress(value: string): `0x${string}` {
  const hex = value.startsWith('0x') ? value : `0x${value}`;
  if (hex.length !== 42) {
    throw new Error(`Invalid address length. Expected 42, got ${hex.length}`);
  }
  return hex as `0x${string}`;
}
