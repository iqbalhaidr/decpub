import { writeEvaluationArtifact } from './evaluation-artifact.util';
import { getRichQuantitativeMetrics } from './quantitative-metrics.util';
import {
  buildProtectedSubmissionProjection,
  buildUnprotectedSubmissionProjection,
  buildProtectedAssignmentProjection,
  buildUnprotectedAssignmentProjection,
  buildNoProofAssignmentProjection,
  buildNoZkpAssignmentProjection,
  buildNoStealthAssignmentProjection,
  buildNoZkpAndNoStealthAssignmentProjection,
  buildProtectedCommitProjection,
  buildProtectedRevealProjection,
  buildUnprotectedCommitProjection,
  buildUnprotectedRevealProjection,
  buildDirectRevealReviewProjection
} from './evaluation-payload.factory';

describe('Anonymity Technique Ablation Suite', () => {
  
  const generateSimulatedPayload = (mode: string) => {
    // Default: full protection (with all techniques)
    let submissionPayload = buildProtectedSubmissionProjection();
    let assignmentPayload = buildProtectedAssignmentProjection();
    let commitPayload: any = buildProtectedCommitProjection();
    let revealPayload: any = buildProtectedRevealProjection();
    
    let publicViewPayload: any = {
      manuscriptHash: '0xhash...',
      authorPseudonym: '0xauthorpseudo...',
      decision: 'Accepted'
    };
    
    let N = 5; // Default anonymity set size
    let assignmentOptions: any = undefined;

    const isNoEphemeral = mode.includes('noephemeral') || mode.includes('nopseudonym') || mode.includes('no_pseudonym') || mode === 'no_protection' || mode === 'all_disabled_conceptual';
    const isNoCommitReveal = mode.includes('nocommitreveal') || mode.includes('no_commit_reveal') || mode === 'no_protection' || mode === 'multi_ablation_1' || mode === 'all_disabled_conceptual';
    const isNoZkp = mode.includes('nozkp') || mode.includes('no_zkp') || mode === 'all_disabled_conceptual';
    const isNoStealth = mode.includes('nostealth') || mode.includes('no_stealth') || mode === 'all_disabled_conceptual';

    // 1. Ablation: Without Pseudonym / Ephemeral Account
    if (isNoEphemeral) {
      submissionPayload = buildUnprotectedSubmissionProjection();
      if (commitPayload) commitPayload = buildUnprotectedCommitProjection();
      revealPayload = buildUnprotectedRevealProjection();
    }

    // 2. Ablation: Without Assignment Commitment (Legacy)
    if (mode === 'no_assignment_commitment' || mode === 'no_protection') {
      assignmentPayload = buildUnprotectedAssignmentProjection();
      N = 1; // Explicit assignment ruins anonymity set completely
    }

    // 3. Ablation: Without Proof Reference (Explicit Summary)
    if (mode === 'no_proof_reference' || mode === 'no_protection' || mode === 'all_disabled_conceptual') {
      assignmentPayload = buildNoProofAssignmentProjection();
      delete revealPayload.reviewURI;
      revealPayload.reviewText = 'PlainText review content exposed...';
    }

    // 4. Ablation: Without Commit-Reveal
    if (isNoCommitReveal) {
      commitPayload = null; // Phase is skipped
      revealPayload = buildDirectRevealReviewProjection();
    }
    
    // 5 & 6. CONCEPTUAL: ZKP and Stealth
    if (isNoZkp && isNoStealth) {
      assignmentPayload = buildNoZkpAndNoStealthAssignmentProjection();
    } else if (isNoZkp) {
      assignmentPayload = buildNoZkpAssignmentProjection();
    } else if (isNoStealth) {
      assignmentPayload = buildNoStealthAssignmentProjection();
    }

    // --- PARTIAL TECHNIQUE SCENARIOS ---
    
    // Partial 1: Pseudonym active, no commit-reveal
    if (mode === 'pseudo_no_commit_reveal') {
      commitPayload = null;
      revealPayload = buildDirectRevealReviewProjection();
    }

    // Partial 2: Commit-reveal active, no assignment protection
    if (mode === 'commit_reveal_no_assignment') {
      assignmentPayload = buildUnprotectedAssignmentProjection();
      N = 1;
    }

    // Partial 3: Proof summary active, no pseudonym
    if (mode === 'proof_no_pseudonym') {
      submissionPayload = buildUnprotectedSubmissionProjection();
      if (commitPayload) {
        commitPayload = buildUnprotectedCommitProjection();
      }
      revealPayload = buildUnprotectedRevealProjection();
    }

    // Partial 4: Gray-zone reviewer selection
    if (mode === 'gray_zone_protected') {
      N = 5;
      assignmentOptions = { reviewerCount: 15, selectedCount: 5, additionalReviewerCount: 2 };
    }
    if (mode === 'gray_zone_unprotected') {
      N = 1;
      assignmentPayload = buildUnprotectedAssignmentProjection();
      assignmentOptions = { reviewerCount: 15, selectedCount: 5, additionalReviewerCount: 2 };
    }

    // Partial 5: Post-publication
    if (mode === 'post_pub_unprotected' || mode === 'no_protection') {
      publicViewPayload = {
        manuscriptHash: '0xhash...',
        realName: 'Jane Doe',
        reviewerName: 'Dr. Smith',
        decision: 'Accepted'
      };
    }

    return {
      submissionPayload,
      assignmentPayload,
      commitPayload,
      revealPayload,
      publicViewPayload,
      N,
      assignmentOptions
    };
  };

  const evaluateMode = (mode: string, scenarioName?: string, notes?: string, baseline?: any) => {
    const payloads = generateSimulatedPayload(mode);
    
    const submissionMetrics = getRichQuantitativeMetrics(1, payloads.submissionPayload, {
      supportsFormalEntropy: false,
      reasonNoEntropy: 'Submission phase tracks identity leakage.'
    });

    const assignmentMetrics = getRichQuantitativeMetrics(payloads.N, payloads.assignmentPayload, payloads.assignmentOptions);

    let reviewMetrics: any;
    if (payloads.commitPayload) {
      reviewMetrics = getRichQuantitativeMetrics(1, payloads.revealPayload, {
        commitPayload: payloads.commitPayload,
        revealPayload: payloads.revealPayload,
        supportsFormalEntropy: false,
      });
    } else {
      reviewMetrics = getRichQuantitativeMetrics(1, payloads.revealPayload, {
        supportsFormalEntropy: false,
      });
    }

    const publicViewMetrics = getRichQuantitativeMetrics(1, payloads.publicViewPayload, {
      supportsFormalEntropy: false,
      reasonNoEntropy: 'Public view tracks identity linkage.'
    });

    if (scenarioName) {
      const enhance = (metrics: any, baseMetrics?: any) => {
        let scenarioType = 'implemented-ablation';
        if (mode.includes('zkp') || mode.includes('stealth') || mode.includes('conceptual') || mode === 'all_disabled_conceptual' || mode === 'noephemeral' || mode === 'noephemeral_nocommitreveal') {
          scenarioType = 'conceptual-ablation';
        }
        if (mode === 'full_protection') {
          scenarioType = 'baseline';
        }

        const disabledList: string[] = [];
        const isNoEph = mode.includes('noephemeral') || mode.includes('nopseudonym') || mode.includes('no_pseudonym') || mode === 'no_protection' || mode === 'all_disabled_conceptual';
        const isNoCR = mode.includes('nocommitreveal') || mode.includes('no_commit_reveal') || mode === 'no_protection' || mode === 'multi_ablation_1' || mode === 'all_disabled_conceptual';
        const isNoZk = mode.includes('nozkp') || mode.includes('no_zkp') || mode === 'all_disabled_conceptual';
        const isNoSt = mode.includes('nostealth') || mode.includes('no_stealth') || mode === 'all_disabled_conceptual';

        if (isNoEph) disabledList.push('ephemeral/pseudonym');
        if (isNoCR) disabledList.push('commit-reveal');
        if (isNoZk) disabledList.push('zkp');
        if (isNoSt) disabledList.push('stealth-routing');
        if (mode === 'no_assignment_commitment' || mode === 'no_protection') disabledList.push('assignment-commitment');
        if (mode === 'no_proof_reference' || mode === 'no_protection' || mode === 'all_disabled_conceptual') disabledList.push('proof-reference');

        const enhanced = {
          scenarioName,
          techniqueMode: mode,
          disabledTechniques: disabledList.length > 0 ? disabledList.join(', ') : 'None',
          scenarioType,
          comparedAgainst: baseline ? 'full_protection' : 'N/A',
          supportsFormalEntropy: metrics.supportsFormalEntropy ?? true,
          notes: notes || '',
          ...metrics,
          deltaForbiddenIdentityFieldCount: baseMetrics ? (metrics.forbiddenIdentityFieldCount - baseMetrics.forbiddenIdentityFieldCount) : 0,
          deltaPseudonymousFieldCount: baseMetrics ? (metrics.pseudonymousFieldCount - baseMetrics.pseudonymousFieldCount) : 0,
          deltaSensitiveFieldCount: baseMetrics ? (metrics.sensitiveFieldCount - baseMetrics.sensitiveFieldCount) : 0,
        };

        if (typeof metrics.entropy === 'number' && typeof baseMetrics?.entropy === 'number') {
          enhanced.deltaEntropy = metrics.entropy - baseMetrics.entropy;
          enhanced.deltaDegreeOfAnonymity = metrics.degreeOfAnonymity - baseMetrics.degreeOfAnonymity;
        }

        return enhanced;
      };

      writeEvaluationArtifact('Technique Ablation', `${scenarioName} - 1 Submission`, enhance(submissionMetrics, baseline?.submissionMetrics));
      writeEvaluationArtifact('Technique Ablation', `${scenarioName} - 2 Assignment`, enhance(assignmentMetrics, baseline?.assignmentMetrics));
      writeEvaluationArtifact('Technique Ablation', `${scenarioName} - 3 Review`, enhance(reviewMetrics, baseline?.reviewMetrics));
      writeEvaluationArtifact('Technique Ablation', `${scenarioName} - 4 Public View`, enhance(publicViewMetrics, baseline?.publicViewMetrics));
    }

    return {
      submissionMetrics,
      assignmentMetrics,
      reviewMetrics,
      publicViewMetrics
    };
  };

  describe('Full vs None Ablations', () => {
    let fullBaseline: any;

    beforeAll(() => {
      // Define the absolute protected baseline once
      fullBaseline = evaluateMode(
        'full_protection', 
        'Control', 
        'Absolute full protection baseline, using all encrypted techniques.',
        null
      );
    });

    it('Scenario 0: Verifies Baseline Full Protection Metrics', () => {
      const full = fullBaseline;
      
      expect(full.submissionMetrics.forbiddenIdentityFieldCount).toBe(0);
      expect(full.submissionMetrics.pseudonymousFieldCount).toBeGreaterThan(0);
      
      expect(full.assignmentMetrics.degreeOfAnonymity).toBe(1);
      expect(full.assignmentMetrics.effectiveAnonymitySetSize).toBeCloseTo(5);
      
      expect(full.reviewMetrics.exposureDelta).toBeGreaterThan(0);
      expect(full.reviewMetrics.commitSensitiveCount).toBe(0);
    });

    it('Scenario 1: Pseudonym / Ephemeral Account Ablation', () => {
      const full = fullBaseline;
      const ablated = evaluateMode(
        'no_pseudonym', 
        'S1_Pseudonym_Ablation', 
        'Disabling pseudonym / ephemeral account exposes identity from the start.',
        full
      );
      
      expect(ablated.submissionMetrics.forbiddenIdentityFieldCount).toBeGreaterThan(full.submissionMetrics.forbiddenIdentityFieldCount);
      expect(ablated.submissionMetrics.pseudonymousFieldCount).toBeLessThan(full.submissionMetrics.pseudonymousFieldCount);
      expect(ablated.submissionMetrics.forbiddenIdentityFieldCount).toBeGreaterThan(0);
      expect(ablated.submissionMetrics.supportsFormalEntropy).toBe(false);
    });

    it('Scenario 2: Reviewer Assignment Commitment Ablation', () => {
      const full = fullBaseline;
      const ablated = evaluateMode(
        'no_assignment_commitment',
        'S2_Assignment_Commitment_Ablation',
        'Tanpa assignment commitment, set anonimitas hancur.',
        full
      );
      
      expect(full.assignmentMetrics.effectiveAnonymitySetSize).toBeGreaterThanOrEqual(ablated.assignmentMetrics.effectiveAnonymitySetSize);
      expect(full.assignmentMetrics.degreeOfAnonymity).toBeGreaterThanOrEqual(ablated.assignmentMetrics.degreeOfAnonymity);
      expect(ablated.assignmentMetrics.degreeOfAnonymity).toBe(0);
    });

    it('Scenario 3: Proof Reference / Assignment Summary Ablation', () => {
      const full = fullBaseline;
      const ablated = evaluateMode(
        'no_proof_reference',
        'S3_Proof_Reference_Ablation',
        'Without proofRef, the reviewer list is explicitly exposed.',
        full
      );
      
      expect(full.assignmentMetrics.forbiddenIdentityFieldCount).toBeLessThan(ablated.assignmentMetrics.forbiddenIdentityFieldCount);
      expect(ablated.assignmentMetrics.forbiddenIdentityFieldCount).toBeGreaterThan(0);
    });

    it('Scenario 4: Commit-Reveal Phase Ablation', () => {
      const full = fullBaseline;
      const ablated = evaluateMode(
        'no_commit_reveal',
        'S4_Commit_Reveal_Ablation',
        'Without commit-reveal, the decision is leaked instantly.',
        full
      );
      
      expect(full.reviewMetrics.commitSensitiveCount).toBeLessThan(ablated.reviewMetrics.sensitiveFieldCount);
      expect(full.reviewMetrics.exposureDelta).toBeGreaterThan(0);
      expect(full.reviewMetrics.supportsFormalEntropy).toBe(false);
    });

    it('Scenario 5: Full Baseline (No Protection)', () => {
      const full = fullBaseline;
      const none = evaluateMode(
        'no_protection',
        'S5_No_Protection',
        'All anonymity techniques disabled. Worst case scenario.',
        full
      );
      
      expect(full.submissionMetrics.forbiddenIdentityFieldCount).toBeLessThanOrEqual(none.submissionMetrics.forbiddenIdentityFieldCount);
      expect(full.submissionMetrics.pseudonymousFieldCount).toBeGreaterThanOrEqual(none.submissionMetrics.pseudonymousFieldCount);
      
      expect(full.assignmentMetrics.effectiveAnonymitySetSize).toBeGreaterThanOrEqual(none.assignmentMetrics.effectiveAnonymitySetSize);
      expect(full.assignmentMetrics.degreeOfAnonymity).toBeGreaterThanOrEqual(none.assignmentMetrics.degreeOfAnonymity);
      
      expect(full.reviewMetrics.commitSensitiveCount).toBeLessThan(none.reviewMetrics.sensitiveFieldCount);
    });

    it('Scenario 6: Conceptual Ablation - Without ZKP (Eligibility Leak)', () => {
      const full = fullBaseline;
      const ablated = evaluateMode(
        'nozkp_conceptual',
        'S6_NoZKP_Conceptual',
        '[CONCEPTUAL SIMULATION] Without ZKP, eligibility proof leaks real identity directly.',
        full
      );
      
      expect(full.assignmentMetrics.forbiddenIdentityFieldCount).toBeLessThan(ablated.assignmentMetrics.forbiddenIdentityFieldCount);
      expect(ablated.assignmentMetrics.forbiddenIdentityFieldCount).toBeGreaterThan(0);
    });

    it('Scenario 7: Conceptual Ablation - Without Stealth Address Routing', () => {
      const full = fullBaseline;
      const ablated = evaluateMode(
        'no_stealth_address',
        'S7_No_Stealth_Conceptual',
        '[CONCEPTUAL SIMULATION] Without Stealth Address, assignment uses visible wallet address.',
        full
      );
      
      expect(full.assignmentMetrics.forbiddenIdentityFieldCount).toBeLessThan(ablated.assignmentMetrics.forbiddenIdentityFieldCount);
      expect(ablated.assignmentMetrics.forbiddenIdentityFieldCount).toBeGreaterThan(0);
    });

    it('Scenario 8: Conceptual Ablation - No ZKP & No Stealth', () => {
      const full = fullBaseline;
      const ablated = evaluateMode(
        'nozkp_nostealth',
        'S8_NoZKP_NoStealth',
        '[CONCEPTUAL SIMULATION] Disabling both ZKP and Stealth Address.',
        full
      );
      
      expect(ablated.assignmentMetrics.forbiddenIdentityFieldCount).toBeGreaterThan(1);
    });

    it('Scenario 9: Conceptual Ablation - No ZKP & No Ephemeral', () => {
      const full = fullBaseline;
      const ablated = evaluateMode(
        'nozkp_noephemeral',
        'S9_NoZKP_NoEphemeral',
        '[CONCEPTUAL SIMULATION] Disabling ZKP membership and Ephemeral accounts. Exposes role and identity directly.',
        full
      );
      
      expect(ablated.submissionMetrics.supportsFormalEntropy).toBe(false);
      expect(full.submissionMetrics.forbiddenIdentityFieldCount).toBeLessThan(ablated.submissionMetrics.forbiddenIdentityFieldCount);
      expect(full.assignmentMetrics.forbiddenIdentityFieldCount).toBeLessThan(ablated.assignmentMetrics.forbiddenIdentityFieldCount);
    });

    it('Scenario 10: Conceptual Ablation - No Stealth Address Simulation', () => {
      const full = fullBaseline;
      const ablated = evaluateMode(
        'nostealth',
        'S10_NoStealth_Conceptual',
        '[CONCEPTUAL SIMULATION] Without stealth routing. Assignment exposes linkage explicitly rather than via inviteRef/proof.',
        full
      );
      
      expect(full.assignmentMetrics.forbiddenIdentityFieldCount).toBeLessThan(ablated.assignmentMetrics.forbiddenIdentityFieldCount);
      expect(ablated.assignmentMetrics.forbiddenIdentityFieldCount).toBeGreaterThan(0);
    });

    it('Scenario 11: Conceptual Ablation - No Stealth & No Ephemeral', () => {
      const full = fullBaseline;
      const ablated = evaluateMode(
        'nostealth_noephemeral',
        'S11_NoStealth_NoEphemeral',
        '[CONCEPTUAL SIMULATION] Disabling stealth routing and ephemeral accounts simultaneously.',
        full
      );
      
      expect(full.submissionMetrics.forbiddenIdentityFieldCount).toBeLessThan(ablated.submissionMetrics.forbiddenIdentityFieldCount);
      expect(full.assignmentMetrics.forbiddenIdentityFieldCount).toBeLessThan(ablated.assignmentMetrics.forbiddenIdentityFieldCount);
    });

    it('Scenario 12: Conceptual Ablation - No Stealth & No Commit-Reveal', () => {
      const full = fullBaseline;
      const ablated = evaluateMode(
        'nostealth_nocommitreveal',
        'S12_NoStealth_NoCommitReveal',
        '[CONCEPTUAL SIMULATION] Disabling stealth routing and commit-reveal simultaneously.',
        full
      );
      
      expect(full.assignmentMetrics.forbiddenIdentityFieldCount).toBeLessThan(ablated.assignmentMetrics.forbiddenIdentityFieldCount);
      expect(full.reviewMetrics.commitSensitiveCount).toBeLessThan(ablated.reviewMetrics.sensitiveFieldCount);
      expect(ablated.reviewMetrics.supportsFormalEntropy).toBe(false);
    });

    it('Scenario 13: Conceptual Ablation - Explicit No Ephemeral Account', () => {
      const full = fullBaseline;
      const ablated = evaluateMode(
        'noephemeral',
        'S13_NoEphemeral_Conceptual',
        '[CONCEPTUAL SIMULATION] Disabling ephemeral accounts directly exposes identity fields.',
        full
      );
      
      expect(ablated.submissionMetrics.forbiddenIdentityFieldCount).toBeGreaterThan(full.submissionMetrics.forbiddenIdentityFieldCount);
      expect(ablated.submissionMetrics.pseudonymousFieldCount).toBeLessThan(full.submissionMetrics.pseudonymousFieldCount);
      expect(ablated.submissionMetrics.supportsFormalEntropy).toBe(false);
    });

    it('Scenario 14: Conceptual Ablation - No Ephemeral & No Commit-Reveal', () => {
      const full = fullBaseline;
      const ablated = evaluateMode(
        'noephemeral_nocommitreveal',
        'S14_NoEphemeral_NoCommitReveal',
        '[CONCEPTUAL SIMULATION] Disabling ephemeral accounts and commit-reveal simultaneously.',
        full
      );
      
      expect(ablated.submissionMetrics.forbiddenIdentityFieldCount).toBeGreaterThan(full.submissionMetrics.forbiddenIdentityFieldCount);
      expect(ablated.reviewMetrics.sensitiveFieldCount).toBeGreaterThan(full.reviewMetrics.commitSensitiveCount);
      expect(ablated.submissionMetrics.supportsFormalEntropy).toBe(false);
    });

    it('Scenario 15: Conceptual Ablation - All Protection Disabled (no ZKP, no Ephemeral, no Commit-Reveal, no Stealth)', () => {
      const full = fullBaseline;
      const ablated = evaluateMode(
        'all_disabled_conceptual',
        'S15_All_Disabled_Conceptual',
        '[CONCEPTUAL SIMULATION] Complete absence of all privacy-preserving layers (ZKP, Ephemeral, Stealth, Commit-Reveal).',
        full
      );
      
      expect(ablated.submissionMetrics.forbiddenIdentityFieldCount).toBeGreaterThan(full.submissionMetrics.forbiddenIdentityFieldCount);
      expect(ablated.assignmentMetrics.forbiddenIdentityFieldCount).toBeGreaterThan(1);
      expect(ablated.reviewMetrics.sensitiveFieldCount).toBeGreaterThan(full.reviewMetrics.commitSensitiveCount);
      expect(ablated.submissionMetrics.supportsFormalEntropy).toBe(false);
    });
  });

  describe('Partial Technique Combinations', () => {
    let fullBaseline: any;

    beforeAll(() => {
      fullBaseline = evaluateMode('full_protection');
    });

    it('Partial Scenario 1: Pseudonym Active but Commit-Reveal Disabled', () => {
      const mode = evaluateMode(
        'pseudo_no_commit_reveal',
        'P1_Pseudo_NoCommitReveal',
        'Identity protected but review sentiment leaks early.',
        fullBaseline
      );
      
      expect(mode.submissionMetrics.forbiddenIdentityFieldCount).toBe(0);
      expect(fullBaseline.reviewMetrics.commitSensitiveCount).toBeLessThan(mode.reviewMetrics.sensitiveFieldCount);
    });
  
    it('Partial Scenario 2: Commit-Reveal Active but Reviewer Assignment Unprotected', () => {
      const mode = evaluateMode(
        'commit_reveal_no_assignment',
        'P2_CommitReveal_NoAssignment',
        'Review safely delayed, but assignment identity leaks.',
        fullBaseline
      );
      
      expect(mode.reviewMetrics.commitSensitiveCount).toBe(0);
      expect(mode.assignmentMetrics.degreeOfAnonymity).toBe(0);
      expect(mode.assignmentMetrics.effectiveAnonymitySetSize).toBe(1);
    });
  
    it('Partial Scenario 3: Proof Summary Active but Pseudonym Disabled', () => {
      const mode = evaluateMode(
        'proof_no_pseudonym',
        'P3_Proof_NoPseudonym',
        'Proof summary active but realName leaks author.',
        fullBaseline
      );
      
      expect(mode.assignmentMetrics.degreeOfAnonymity).toBe(1);
      expect(mode.submissionMetrics.forbiddenIdentityFieldCount).toBeGreaterThan(0);
      expect(mode.reviewMetrics.forbiddenIdentityFieldCount).toBeGreaterThan(fullBaseline.reviewMetrics.forbiddenIdentityFieldCount);
    });
  
    it('Partial Scenario 4: Gray-Zone Reviewer Selection (Protected vs Unprotected)', () => {
      const protectedMode = evaluateMode(
        'gray_zone_protected',
        'P4_GrayZone_Protected',
        'Additional selection protected.',
        fullBaseline
      );
      const unprotectedMode = evaluateMode(
        'gray_zone_unprotected',
        'P4_GrayZone_Unprotected',
        'Additional selection exposed.',
        protectedMode
      );
      
      expect(protectedMode.assignmentMetrics.additionalReviewerRatio).toBeGreaterThan(0);
      expect(unprotectedMode.assignmentMetrics.additionalReviewerRatio).toBeGreaterThan(0);
      
      expect(protectedMode.assignmentMetrics.effectiveAnonymitySetSize).toBeGreaterThan(unprotectedMode.assignmentMetrics.effectiveAnonymitySetSize);
      expect(unprotectedMode.assignmentMetrics.effectiveAnonymitySetSize).toBe(1);
    });
  
    it('Partial Scenario 5: Post-Publication Public View Linkage', () => {
      const protectedMode = evaluateMode(
        'post_pub_protected',
        'P5_PostPub_Protected',
        'Public access does not leak identity.',
        fullBaseline
      );
      const unprotectedMode = evaluateMode(
        'post_pub_unprotected',
        'P5_PostPub_Unprotected',
        'Akses publik memperlihatkan linkage reviewer.',
        protectedMode
      );
      
      expect(protectedMode.publicViewMetrics.forbiddenIdentityFieldCount).toBe(0);
      expect(unprotectedMode.publicViewMetrics.forbiddenIdentityFieldCount).toBeGreaterThan(0);
    });
  });
});
