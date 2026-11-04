// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Bagian ReputationSBT yang dipakai IncentiveEngine.
interface IReputationSBT {
    /// Menambah reputasi yang bisa diklaim (agregat, tanpa penerima). Hanya IncentiveEngine.
    function accrue(uint256 amount) external;
}
