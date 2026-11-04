// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IAutomaticChecks {
    enum AutomaticCheckResult {
        None,
        Pass,
        Incomplete,
        Reject
    }

    struct AutomaticCheckRecord {
        bool exists;
        bytes32 sessionId;
        uint32 batch;
        bytes32 reportHash;
        bytes32 flagsHash;
        string reportURI;
        AutomaticCheckResult result;
        uint64 recordedAt;
    }

    event SessionManagerUpdated(address indexed manager, bool authorized, uint64 timestamp);

    event AutomaticCheckRecorded(
        bytes32 indexed sessionId,
        uint32 indexed batch,
        bytes32 indexed reportHash,
        bytes32 flagsHash,
        string reportURI,
        AutomaticCheckResult result,
        uint64 timestamp
    );

    error OnlyAdmin();
    error OnlySessionManager();
    error SessionNotFound();
    error InvalidSessionId();
    error InvalidHash();
    error InvalidResult();
    error InvalidBatch();
    error RecordNotFound();
    error InvalidSessionStatus();

    function setSessionManager(address manager, bool authorized) external;

    function recordAutomaticCheck(
        bytes32 sessionId,
        bytes32 reportHash,
        bytes32 flagsHash,
        string calldata reportURI,
        AutomaticCheckResult result
    ) external returns (uint32 batch);

    function admin() external view returns (address);

    function isSessionManager(address addr) external view returns (bool);

    function getLatestBatch(bytes32 sessionId) external view returns (uint32);

    function hasRecord(bytes32 sessionId, uint32 batch) external view returns (bool);

    function getRecord(
        bytes32 sessionId,
        uint32 batch
    ) external view returns (AutomaticCheckRecord memory);

    function getLatestRecord(bytes32 sessionId) external view returns (AutomaticCheckRecord memory);
}
