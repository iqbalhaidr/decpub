export type DistributionInput = number | number[] | Record<string, number>;

export interface QuantitativeMetrics {
  anonymitySetSize: number;           // N
  entropy: number;                    // H(P) actual shannon entropy
  maxEntropy: number;                 // log2(N) theoretical max
  effectiveAnonymitySetSize: number;  // N_eff
  degreeOfAnonymity: number;          // d
  sensitiveFieldCount: number;
  exposureDelta: number;
  supportsFormalEntropy?: boolean;
  reasonNoEntropy?: string;
}

export function normalizeDistribution(input: DistributionInput): number[] {
  let probs: number[] = [];
  
  if (typeof input === 'number') {
    if (input <= 0) throw new Error('Anonymity set size (N) must be greater than 0.');
    const p = 1 / input;
    probs = Array(input).fill(p);
  } else if (Array.isArray(input)) {
    probs = input;
  } else if (typeof input === 'object' && input !== null) {
    probs = Object.values(input);
  } else {
    throw new Error('Invalid distribution input.');
  }
  
  if (probs.length === 0) {
    throw new Error('Probability distribution cannot be empty.');
  }
  
  let sum = 0;
  for (const p of probs) {
    if (typeof p !== 'number' || p < 0) throw new Error('Probabilities must be non-negative numbers.');
    sum += p;
  }
  
  if (sum === 0) {
    throw new Error('Sum of probabilities cannot be 0.');
  }
  
  // Normalize automatically with small tolerance
  if (Math.abs(sum - 1) > 1e-6) {
    probs = probs.map(p => p / sum);
  }
  
  return probs;
}

export function calculateQuantitativeMetrics(
  distributionInput: DistributionInput,
  baseSensitiveFieldCount: number,
  exposedSensitiveFieldCount: number
): QuantitativeMetrics {
  const probs = normalizeDistribution(distributionInput);
  const N = probs.length;
  
  let entropy = 0;
  for (const p of probs) {
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }
  
  // Guard against precision issues causing negative entropy
  entropy = Math.max(0, entropy);
  
  const effectiveAnonymitySetSize = Math.pow(2, entropy);
  const maxEntropy = N > 1 ? Math.log2(N) : 0;
  
  const degreeOfAnonymity = maxEntropy > 0 ? entropy / maxEntropy : (N === 1 ? 0 : 1); 
  
  const exposureDelta = exposedSensitiveFieldCount - baseSensitiveFieldCount;
  
  return {
    anonymitySetSize: N,
    entropy,
    maxEntropy,
    effectiveAnonymitySetSize,
    degreeOfAnonymity,
    sensitiveFieldCount: exposedSensitiveFieldCount,
    exposureDelta
  };
}

// Utility untuk metrik proksi payload
export function countForbiddenIdentityFields(obj: any): number {
  if (!obj) return 0;
  const forbiddenKeys = [
    'identityCommitment',
    'permanentAccount',
    'walletAddress',
    'realIdentity',
    'realName',
    'permanentIdentity',
    'email',
    'phoneNumber'
  ];
  
  const str = JSON.stringify(obj).toLowerCase();
  let count = 0;
  for (const key of forbiddenKeys) {
    const regex = new RegExp(`"${key.toLowerCase()}"`, 'g');
    const matches = str.match(regex);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

export function countPseudonymousIdentifiers(obj: any): number {
  if (!obj) return 0;
  const pseudonymKeys = [
    'authorPseudonym',
    'editorPseudonym',
    'reviewerPseudonym',
    'proofRef',
    'assignmentCommitment'
  ];
  
  const str = JSON.stringify(obj).toLowerCase();
  let count = 0;
  for (const key of pseudonymKeys) {
    const regex = new RegExp(`"${key.toLowerCase()}"`, 'g');
    const matches = str.match(regex);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

export function countSensitiveReviewFields(obj: any): number {
  if (!obj) return 0;
  const sensitiveKeys = [
    'recommendation',
    'recommendationValue',
    'reviewHash',
    'reviewURI',
    'nonce'
  ];
  
  const str = JSON.stringify(obj).toLowerCase();
  let count = 0;
  for (const key of sensitiveKeys) {
    const regex = new RegExp(`"${key.toLowerCase()}"`, 'g');
    const matches = str.match(regex);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

export function getRichQuantitativeMetrics(
  distributionInput: number | number[] | Record<string, number>,
  dataPayload: any,
  options?: {
    reviewerCount?: number;
    selectedCount?: number;
    additionalReviewerCount?: number;
    commitPayload?: any;
    revealPayload?: any;
    explicitDistribution?: number[] | Record<string, number>;
    supportsFormalEntropy?: boolean;
    reasonNoEntropy?: string;
  }
) {
  const forbiddenCount = countForbiddenIdentityFields(dataPayload);
  const pseudoCount = countPseudonymousIdentifiers(dataPayload);
  const sensitiveCount = countSensitiveReviewFields(dataPayload);

  let commitSensitiveCount = 0;
  let revealSensitiveCount = 0;
  if (options?.commitPayload && options?.revealPayload) {
    commitSensitiveCount = countSensitiveReviewFields(options.commitPayload);
    revealSensitiveCount = countSensitiveReviewFields(options.revealPayload);
  }

  const metrics = calculateQuantitativeMetrics(
    options?.explicitDistribution || distributionInput, 
    commitSensitiveCount || 0,
    revealSensitiveCount || sensitiveCount
  );

  let reviewerSelectionDensity = 0;
  if (options?.reviewerCount && options?.selectedCount && options.reviewerCount > 0) {
    reviewerSelectionDensity = options.selectedCount / options.reviewerCount;
  }

  let additionalReviewerRatio = 0;
  if (options?.additionalReviewerCount && options?.reviewerCount && options.reviewerCount > 0) {
    additionalReviewerRatio = options.additionalReviewerCount / options.reviewerCount;
  }

  return {
    // Core Set Metrics
    anonymitySetSize: metrics.anonymitySetSize,
    probabilityDistribution: options?.explicitDistribution,
    
    // Entropy & Degree
    // Entropy & Degree metrics are naturally spread via ...metrics
    
    // Privacy Exposure
    sensitiveFieldCount: metrics.sensitiveFieldCount,
    commitSensitiveCount,
    revealSensitiveCount,
    exposureDelta: metrics.exposureDelta,
    
    // Structural Metadata
    forbiddenIdentityFieldCount: forbiddenCount,
    pseudonymousFieldCount: pseudoCount,
    reviewerSelectionDensity,
    additionalReviewerRatio,
    
    // Modifiers
    supportsFormalEntropy: options?.supportsFormalEntropy,
    reasonNoEntropy: options?.reasonNoEntropy,
    
    // Any remaining legacy fields from metrics
    ...metrics,
  };
}
