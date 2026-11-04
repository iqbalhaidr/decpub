// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ReputationSBT
 * @notice Soulbound Token for non-transferable reputation (FR-07, FR-08)
 * @dev Thesis ref: III.2.3.4 — SBT non-transferable with exponential decay
 *
 * Key design decisions from thesis:
 * - NFR-05: Non-transferability via disabled transfer functions
 * - FR-08: Reputation decay for inactive reviewers
 * - M4 mitigation: Prevents Sybil attack via purchased reputation
 */
contract ReputationSBT is Ownable {
    // --- State ---
    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _lastActiveTimestamp;

    // Decay parameters (fixed-point with 1e18 precision)
    uint256 public decayRatePerDay; // λ in e^(-λt), scaled by 1e18
    uint256 public constant PRECISION = 1e18;

    // --- Events ---
    event ReputationMinted(address indexed reviewer, uint256 amount);
    event ReputationDecayed(address indexed reviewer, uint256 before, uint256 after_);

    constructor(uint256 _decayRatePerDay) Ownable(msg.sender) {
        decayRatePerDay = _decayRatePerDay;
    }

    /**
     * @notice Get reputation balance (before decay applied)
     */
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    /**
     * @notice Get reputation balance with decay applied
     * @param account Reviewer address
     * @return Effective reputation after exponential decay
     */
    function effectiveBalance(address account) external view returns (uint256) {
        return _applyDecay(account);
    }

    /**
     * @notice Get timestamp of last activity
     */
    function lastActive(address account) external view returns (uint256) {
        return _lastActiveTimestamp[account];
    }

    /**
     * @notice Mint reputation to a reviewer (called after distribution)
     * @dev Applies pending decay before minting, then resets activity timer
     * @param to Reviewer address
     * @param amount Reputation points to add
     */
    function mint(address to, uint256 amount) external onlyOwner {
        // Apply decay on existing balance first
        if (_balances[to] > 0) {
            _balances[to] = _applyDecay(to);
        }

        _balances[to] += amount;
        _lastActiveTimestamp[to] = block.timestamp;

        emit ReputationMinted(to, amount);
    }

    /**
     * @notice Explicitly trigger decay for an account (anyone can call)
     * @dev Useful for updating stale balances before reads
     */
    function triggerDecay(address account) external {
        uint256 before = _balances[account];
        _balances[account] = _applyDecay(account);
        _lastActiveTimestamp[account] = block.timestamp;

        emit ReputationDecayed(account, before, _balances[account]);
    }

    /**
     * @notice Update decay rate (governance)
     */
    function setDecayRate(uint256 _newRate) external onlyOwner {
        decayRatePerDay = _newRate;
    }

    // --- Internal ---

    /**
     * @dev Compute balance after exponential decay: balance * e^(-λ * t_days)
     *
     * Uses linear approximation for gas efficiency:
     *   e^(-x) ≈ 1 - x  for small x (first-order Taylor)
     *
     * For more precise decay over longer periods, uses iterative halving:
     *   e^(-λt) = (e^(-λ))^t, computed via repeated squaring
     */
    function _applyDecay(address account) internal view returns (uint256) {
        if (_balances[account] == 0) return 0;
        if (_lastActiveTimestamp[account] == 0) return _balances[account];

        uint256 elapsed = block.timestamp - _lastActiveTimestamp[account];
        uint256 daysInactive = elapsed / 1 days;

        if (daysInactive == 0) return _balances[account];

        // Decay factor: (1 - λ)^days (discrete approximation of e^(-λt))
        // Using fixed-point: factor = ((PRECISION - decayRatePerDay) / PRECISION)^days
        uint256 factor = PRECISION;
        uint256 base = PRECISION - decayRatePerDay;

        // Exponentiation by squaring for gas efficiency
        uint256 exp = daysInactive;
        uint256 b = base;
        while (exp > 0) {
            if (exp % 2 == 1) {
                factor = (factor * b) / PRECISION;
            }
            b = (b * b) / PRECISION;
            exp /= 2;
        }

        return (_balances[account] * factor) / PRECISION;
    }

    // --- Soulbound: disable all transfers (NFR-05) ---
    // No ERC-721 or ERC-20 transfer functions are implemented.
    // This token cannot be moved between addresses by design.
}
