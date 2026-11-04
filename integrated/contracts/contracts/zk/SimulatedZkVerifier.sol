// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./IZkVerifier.sol";

/**
 * [SIMULASI] Pemeriksa bukti ZK berbasis tanda tangan attestor.
 *
 * Bukan zero-knowledge: layanan `zk-sim` melihat witness, memeriksanya, lalu menandatangani
 * sinyal publik. Kontrak ini hanya memverifikasi tanda tangan itu dengan `ecrecover`.
 * Nilainya ada pada bentuk alur dan antarmuka (`IZkVerifier`), yang bisa diganti dengan
 * verifier sirkuit sungguhan tanpa mengubah `ActionGateway`.
 *
 * Yang ditandatangani (`proofDigest`): domain, chain, alamat kontrak ini, jenis, dan hash
 * sinyal publik. Tanda tangan untuk jenis, chain, atau deployment lain tidak berlaku.
 */
contract SimulatedZkVerifier is IZkVerifier {
    // Tag domain tanda tangan. Harus sama dengan `PROOF_DOMAIN` di `@decpub/shared`.
    bytes32 public constant PROOF_DOMAIN = keccak256("decpub.zk.simulated.v1");

    address public admin;
    address public attestor;

    event AttestorUpdated(address indexed previousAttestor, address indexed newAttestor);

    error OnlyAdmin();
    error InvalidAttestor();

    constructor(address attestor_) {
        if (attestor_ == address(0)) revert InvalidAttestor();
        admin = msg.sender;
        attestor = attestor_;
    }

    /// Ganti attestor (rotasi kunci). Hanya admin.
    function setAttestor(address newAttestor) external {
        if (msg.sender != admin) revert OnlyAdmin();
        if (newAttestor == address(0)) revert InvalidAttestor();
        emit AttestorUpdated(attestor, newAttestor);
        attestor = newAttestor;
    }

    function proofDigest(
        uint8 kind,
        bytes32[] calldata publicSignals
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    PROOF_DOMAIN,
                    block.chainid,
                    address(this),
                    kind,
                    keccak256(abi.encodePacked(publicSignals))
                )
            );
    }

    function verify(
        uint8 kind,
        bytes32[] calldata publicSignals,
        bytes calldata proof
    ) external view override returns (bool) {
        if (kind == uint8(Kind.None) || kind > uint8(Kind.SelectiveDisclosure)) return false;
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(proofDigest(kind, publicSignals));
        (address signer, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, proof);
        return err == ECDSA.RecoverError.NoError && signer == attestor;
    }
}
