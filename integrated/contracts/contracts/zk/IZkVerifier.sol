// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * Antarmuka pemeriksa bukti ZK. Satu-satunya yang diketahui `ActionGateway`.
 *
 * Implementasi sekarang: `SimulatedZkVerifier` (tanda tangan attestor). Pengganti nyata
 * (verifier Groth16 hasil snarkjs, dsb.) cukup memenuhi antarmuka ini, lalu dipasang
 * dengan `ActionGateway.setVerifier`. Gateway tidak perlu diubah.
 */
interface IZkVerifier {
    // Jenis bukti. Nilainya tetap, dipakai bersama oleh kontrak, zk-sim, dan @decpub/shared.
    enum Kind {
        None, // 0, tidak sah
        Ephemeral, // 1  P02/P05/P06: pembuatan pseudonim
        Assignment, // 2  P05/P06: kandidat memenuhi kriteria seleksi
        AssignmentOwnership, // 3  P06: pemegang undangan memiliki pseudonim
        NoteBind, // 4  P02: ikat note APC ke sesi (M6)
        NoteRefund, // 5  P03/P05/timeout: refund ke alamat baru (M6)
        ReputationBucket, // 6  P06: tingkat reputasi q4 (M7)
        ReputationClaim, // 7  P08: klaim mint reputasi (M7)
        SelectiveDisclosure // 8  P08: pengungkapan identitas atas pilihan penulis (M8)
    }

    /// @param kind jenis bukti (`Kind`)
    /// @param publicSignals sinyal publik. Urutan dan isinya ditentukan per jenis.
    /// @param proof bukti. Bentuknya bergantung implementasi.
    function verify(
        uint8 kind,
        bytes32[] calldata publicSignals,
        bytes calldata proof
    ) external view returns (bool);
}
