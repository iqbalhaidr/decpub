// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Bagian EscrowPool yang dipakai IncentiveEngine.
interface IEscrowPool {
    /// Sesi punya escrow terikat, ada keputusan penelaah, dan sudah final atau macet melewati timeout.
    function distributable(bytes32 sessionId) external view returns (bool);

    /// Jumlah escrow yang terikat ke sesi (0 bila belum ada).
    function escrowAmount(bytes32 sessionId) external view returns (uint256);

    /// Mengkredit imbalan per pseudonim. Hanya IncentiveEngine. Jumlahnya harus tepat sama dengan escrow.
    function creditRewards(
        bytes32 sessionId,
        address[] calldata pseudonyms,
        uint256[] calldata amounts
    ) external;
}
