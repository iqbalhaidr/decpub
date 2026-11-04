// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ReputationSBT.sol";

/**
 * @title IncentiveEngine
 * @notice On-chain TOPSIS ranking + Sigmoid distribution + Escrow (Fase 3-4)
 * @dev Thesis ref: III.2.3.3 (TOPSIS), III.2.3.4 (Sigmoid + SBT)
 *
 * Architecture (SoC):
 * - Middleware sends: normalized QoS matrix + fused weights
 * - This contract: runs TOPSIS, applies Sigmoid, distributes tokens
 *
 * Design decisions:
 * - On-chain TOPSIS for verifiability (NFR-01)
 * - Deterministic output (NFR-02)
 * - O(n×m) complexity, n≤10, m=4 (NFR-07)
 * - Fixed-point arithmetic (18 decimals) for Solidity
 */
contract IncentiveEngine is Ownable {
    // --- Constants ---
    uint256 public constant PRECISION = 1e18;
    uint256 public constant NUM_CRITERIA = 4; // q1..q4

    // --- Linked contracts ---
    ReputationSBT public reputationSBT;

    // --- Sigmoid parameters ---
    // f(S) = 1 / (1 + e^(-k*(S - x0)))
    // k = steepness, x0 = inflection point
    // Stored as fixed-point * PRECISION
    uint256 public sigmoidK;  // steepness
    uint256 public sigmoidX0; // inflection point (0.5 * PRECISION = midpoint)

    // --- Escrow (FR-09) ---
    struct Batch {
        address author;
        uint256 escrowAmount;
        address[] reviewers;
        bool distributed;
        string journalName;
    }
    mapping(uint256 => Batch) public batches;
    uint256 public nextBatchId;

    // --- Events ---
    event BatchCreated(uint256 indexed batchId, address author, uint256 amount, uint256 reviewerCount);
    event BatchDistributed(uint256 indexed batchId, uint256[] scores);
    event RewardDistributed(uint256 indexed batchId, address reviewer, uint256 ethReward, uint256 reputationAmount);

    constructor(
        address _reputationSBT,
        uint256 _sigmoidK,
        uint256 _sigmoidX0
    ) Ownable(msg.sender) {
        reputationSBT = ReputationSBT(_reputationSBT);
        sigmoidK = _sigmoidK;
        sigmoidX0 = _sigmoidX0;
    }

    // ================================================================
    // ESCROW (FR-09)
    // ================================================================

    /**
     * @notice Author deposits escrow for a review batch
     * @param reviewers Array of reviewer addresses for this batch
     * @param journalName Name/title of the journal submission
     */
    function createBatch(address[] calldata reviewers, string calldata journalName) external payable {
        require(msg.value > 0, "Escrow amount must be > 0");
        require(reviewers.length > 0 && reviewers.length <= 10, "1-10 reviewers");

        uint256 batchId = nextBatchId++;
        Batch storage b = batches[batchId];
        b.author = msg.sender;
        b.escrowAmount = msg.value;
        b.reviewers = reviewers;
        b.journalName = journalName;

        emit BatchCreated(batchId, msg.sender, msg.value, reviewers.length);
    }

    // ================================================================
    // TOPSIS + DISTRIBUTION (Fase 3-4)
    // ================================================================

    /**
     * @notice Execute TOPSIS ranking and distribute rewards
     * @dev Called by middleware after computing weights off-chain
     *
     * @param batchId       Batch identifier
     * @param matrix        Normalized QoS matrix (n×4), each value * PRECISION
     * @param weights       Fused weights (4 values), each * PRECISION, sum = PRECISION
     * @param participated  Participation mask (n): false = reviewer did not submit
     *                      a review (no-show). Non-participants are excluded from the
     *                      escrow split and receive no reputation (participation gate,
     *                      applied BEFORE the sigmoid quality mapping). Their escrow
     *                      share flows to actual reviewers.
     */
    function executeDistribution(
        uint256 batchId,
        uint256[][] calldata matrix,
        uint256[4] calldata weights,
        bool[] calldata participated
    ) external onlyOwner {
        Batch storage batch = batches[batchId];
        require(!batch.distributed, "Already distributed");
        require(matrix.length == batch.reviewers.length, "Matrix/reviewer mismatch");
        require(participated.length == batch.reviewers.length, "Participation/reviewer mismatch");

        uint256 n = matrix.length;

        // Validate matrix dimensions
        for (uint256 i = 0; i < n; i++) {
            require(matrix[i].length == NUM_CRITERIA, "Each row must have 4 criteria");
        }

        // --- TOPSIS ---
        uint256[] memory scores = _topsis(matrix, weights, n);

        // --- Participation gate + Sigmoid mapping ---
        // Participation is a binary layer applied BEFORE the graded sigmoid: a no-show
        // (participated=false) is forced to zero (no escrow share, no reputation),
        // so its escrow slice is redistributed among actual reviewers. The sigmoid
        // floor thus applies only to reviewers who actually submitted a review.
        uint256[] memory sigmoidValues = new uint256[](n);
        uint256 sigmoidSum = 0;
        for (uint256 i = 0; i < n; i++) {
            if (participated[i]) {
                sigmoidValues[i] = _sigmoid(scores[i]);
                sigmoidSum += sigmoidValues[i];
            } else {
                sigmoidValues[i] = 0;
            }
        }

        // --- Distribution ---
        batch.distributed = true;

        for (uint256 i = 0; i < n; i++) {
            // Proportional share of escrow (ETH) based on sigmoid output
            uint256 ethReward = 0;
            if (sigmoidSum > 0) {
                ethReward = (batch.escrowAmount * sigmoidValues[i]) / sigmoidSum;
            }

            // Reputation SBT points = sigmoid value (non-transferable)
            uint256 reputationReward = sigmoidValues[i];

            // Transfer ETH reward from escrow
            if (ethReward > 0) {
                (bool sent, ) = batch.reviewers[i].call{value: ethReward}("");
                require(sent, "ETH transfer failed");
            }

            // Mint reputation SBT (non-transferable)
            if (reputationReward > 0) {
                reputationSBT.mint(batch.reviewers[i], reputationReward);
            }

            emit RewardDistributed(batchId, batch.reviewers[i], ethReward, reputationReward);
        }

        // Safety: if NO reviewer participated, the escrow would otherwise be trapped.
        // Refund it to the author instead of locking funds in the contract.
        if (sigmoidSum == 0 && batch.escrowAmount > 0) {
            (bool refunded, ) = batch.author.call{value: batch.escrowAmount}("");
            require(refunded, "Escrow refund failed");
        }

        emit BatchDistributed(batchId, scores);
    }

    // ================================================================
    // TOPSIS IMPLEMENTATION (on-chain, Fase 3)
    // ================================================================

    /**
     * @dev On-chain TOPSIS algorithm
     *
     * Input: normalized matrix (values in [0, PRECISION]) and weights
     * Since normalization already handles cost/benefit inversion,
     * PIS = max and NIS = min for all criteria.
     *
     * Complexity: O(n × m) — within gas limits for n≤10, m=4
     */
    function _topsis(
        uint256[][] calldata matrix,
        uint256[4] calldata weights,
        uint256 n
    ) internal pure returns (uint256[] memory) {
        // Step 1: Weighted normalized matrix + find PIS/NIS
        uint256[4] memory pis;
        uint256[4] memory nis;

        // Initialize PIS to 0 (will find max), NIS to max (will find min)
        for (uint256 j = 0; j < NUM_CRITERIA; j++) {
            nis[j] = type(uint256).max;
        }

        // Build weighted values and track PIS/NIS
        uint256[][] memory V = new uint256[][](n);
        for (uint256 i = 0; i < n; i++) {
            V[i] = new uint256[](NUM_CRITERIA);
            for (uint256 j = 0; j < NUM_CRITERIA; j++) {
                V[i][j] = (matrix[i][j] * weights[j]) / PRECISION;
                if (V[i][j] > pis[j]) pis[j] = V[i][j];
                if (V[i][j] < nis[j]) nis[j] = V[i][j];
            }
        }

        // Step 2: Euclidean distances and closeness coefficient
        uint256[] memory scores = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 dPlusSq = 0;
            uint256 dMinusSq = 0;
            for (uint256 j = 0; j < NUM_CRITERIA; j++) {
                uint256 diffPlus = V[i][j] > pis[j] ? V[i][j] - pis[j] : pis[j] - V[i][j];
                uint256 diffMinus = V[i][j] > nis[j] ? V[i][j] - nis[j] : nis[j] - V[i][j];
                dPlusSq += diffPlus * diffPlus;
                dMinusSq += diffMinus * diffMinus;
            }

            uint256 dPlus = _sqrt(dPlusSq);
            uint256 dMinus = _sqrt(dMinusSq);

            uint256 denom = dPlus + dMinus;
            if (denom == 0) {
                scores[i] = PRECISION / 2; // 0.5
            } else {
                scores[i] = (dMinus * PRECISION) / denom;
            }
        }

        return scores;
    }

    // ================================================================
    // SIGMOID (Fase 4 — distribution function)
    // ================================================================

    /**
     * @dev Sigmoid function: f(S) = 1 / (1 + e^(-k*(S - x0)))
     *
     * Uses piecewise linear approximation for gas efficiency:
     *   - For |x| > 6: saturate to 0 or PRECISION
     *   - For |x| <= 6: cubic approximation
     *
     * Input: S in [0, PRECISION] (TOPSIS score)
     * Output: sigmoid value in [0, PRECISION]
     */
    function _sigmoid(uint256 score) internal view returns (uint256) {
        // Compute x = k * (S - x0) in fixed-point
        // score and sigmoidX0 are in PRECISION scale
        int256 diff = int256(score) - int256(sigmoidX0);
        int256 x = (diff * int256(sigmoidK)) / int256(PRECISION);

        // Clamp to avoid overflow
        if (x > 10 * int256(PRECISION)) return PRECISION;
        if (x < -10 * int256(PRECISION)) return 0;

        // Piecewise linear approximation of sigmoid
        // sigmoid(x) ≈ 0.5 + x/4 for |x| < 2 (linear region)
        // Saturate smoothly outside
        if (x >= 0) {
            // For positive x: 0.5 + 0.5 * (x / (x + PRECISION))
            uint256 ux = uint256(x);
            return PRECISION / 2 + (PRECISION / 2 * ux) / (ux + PRECISION);
        } else {
            // For negative x: 0.5 - 0.5 * (|x| / (|x| + PRECISION))
            uint256 ux = uint256(-x);
            return PRECISION / 2 - (PRECISION / 2 * ux) / (ux + PRECISION);
        }
    }

    // ================================================================
    // MATH UTILITIES
    // ================================================================

    /**
     * @dev Integer square root (Babylonian method)
     */
    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    // ================================================================
    // ADMIN
    // ================================================================

    function setSigmoidParams(uint256 _k, uint256 _x0) external onlyOwner {
        sigmoidK = _k;
        sigmoidX0 = _x0;
    }

    receive() external payable {}
}
