// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * Sumber alamat pemeriksa bukti ZK yang sedang berlaku. Diimplementasikan oleh `ActionGateway`
 * (`verifier()`), sehingga kontrak Hugo (EscrowPool, ReputationSBT) tidak menyimpan alamat
 * verifier sendiri: `ActionGateway.setVerifier` satu-satunya tempat mengganti verifier
 * simulasi dengan verifier sirkuit sungguhan.
 */
interface IVerifierSource {
    function verifier() external view returns (address);
}
