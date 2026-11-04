// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * DOILib: pembentuk string DOI. Diekstrak apa adanya dari `PublicationRegistry.sol:26-68`
 * milik Roihan (docs/arsitektur.md bagian 7 dan 9), supaya `PublicationRecords` memakainya
 * tanpa membawa `PublicationRegistry` (UUPS, JRT, oracle) yang dibuang.
 *
 * Format: `10.55121/<tahun>.<chainId>.<msId>.<versi>`, mis. `10.55121/2026.31337.1.1`.
 * [SIMULASI] DOI tidak terdaftar di registrar mana pun (prefiks 10.55121 milik Roihan, bukan
 * prefiks yang dikeluarkan lembaga DOI). Penggantian: registrar nyata, lalu `DOILib` tak dipakai.
 */
library DOILib {
    string internal constant DOI_PREFIX = "10.55121";

    function buildDOI(uint256 msId, uint256 version) internal view returns (string memory doi) {
        uint256 year = _blockYear();
        doi = string(
            abi.encodePacked(
                DOI_PREFIX,
                "/",
                _uint2str(year),
                ".",
                _uint2str(block.chainid),
                ".",
                _uint2str(msId),
                ".",
                _uint2str(version)
            )
        );
    }

    function _blockYear() private view returns (uint256) {
        return 1970 + block.timestamp / 31_556_952;
    }

    function _uint2str(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
