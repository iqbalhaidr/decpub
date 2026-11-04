// BERKAS HASIL GENERASI. Jangan diubah tangan.
// Sumber: contracts/scripts/export-abis.ts (dijalankan oleh `npm run compile`).

export const PermanentAccountsAbi = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AccountAlreadyRegistered",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AccountNotRegistered",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ArrayLengthMismatch",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CommitmentAlreadyUsed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidAccount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidCommitment",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyAdmin",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "account",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "identityCommitment",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "registeredAt",
        "type": "uint64"
      }
    ],
    "name": "PermanentAccountRegistered",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "accounts",
        "type": "address[]"
      },
      {
        "internalType": "bytes32[]",
        "name": "identityCommitments",
        "type": "bytes32[]"
      }
    ],
    "name": "adminBatchRegister",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "identityCommitment",
        "type": "bytes32"
      }
    ],
    "name": "adminRegister",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "getAccount",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "uint64",
            "name": "registeredAt",
            "type": "uint64"
          },
          {
            "internalType": "bytes32",
            "name": "identityCommitment",
            "type": "bytes32"
          }
        ],
        "internalType": "struct IPermanentAccounts.PermanentAccount",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "getIdentityCommitment",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getMyAccount",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "uint64",
            "name": "registeredAt",
            "type": "uint64"
          },
          {
            "internalType": "bytes32",
            "name": "identityCommitment",
            "type": "bytes32"
          }
        ],
        "internalType": "struct IPermanentAccounts.PermanentAccount",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "identityCommitment",
        "type": "bytes32"
      }
    ],
    "name": "isCommitmentUsed",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "isRegistered",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "identityCommitment",
        "type": "bytes32"
      }
    ],
    "name": "register",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const EphemeralAccountsAbi = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AccountNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AccountRevoked",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CommitmentAlreadyUsedInSession",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidCommitment",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidPseudonym",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSession",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyAdmin",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlySessionManager",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PseudonymAlreadyExists",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "pseudonym",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "enum IEphemeralAccounts.Role",
        "name": "role",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "sessionCommitment",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "createdAt",
        "type": "uint64"
      }
    ],
    "name": "EphemeralAccountCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "pseudonym",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "revokedAt",
        "type": "uint64"
      }
    ],
    "name": "EphemeralAccountRevoked",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "pseudonym",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "enum IEphemeralAccounts.Role",
        "name": "role",
        "type": "uint8"
      },
      {
        "internalType": "bytes32",
        "name": "sessionCommitment",
        "type": "bytes32"
      }
    ],
    "name": "createEphemeral",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "pseudonym",
        "type": "address"
      }
    ],
    "name": "exists",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "pseudonym",
        "type": "address"
      }
    ],
    "name": "getAccount",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "enum IEphemeralAccounts.Role",
            "name": "role",
            "type": "uint8"
          },
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "sessionCommitment",
            "type": "bytes32"
          },
          {
            "internalType": "uint64",
            "name": "createdAt",
            "type": "uint64"
          },
          {
            "internalType": "bool",
            "name": "revoked",
            "type": "bool"
          }
        ],
        "internalType": "struct IEphemeralAccounts.EphemeralAccount",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "pseudonym",
        "type": "address"
      }
    ],
    "name": "isActive",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "sessionCommitment",
        "type": "bytes32"
      }
    ],
    "name": "isCommitmentUsedInSession",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "pseudonym",
        "type": "address"
      }
    ],
    "name": "isPseudonymUsedInSession",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "addr",
        "type": "address"
      }
    ],
    "name": "isSessionManager",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "pseudonym",
        "type": "address"
      }
    ],
    "name": "revokeEphemeral",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "manager",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "authorized",
        "type": "bool"
      }
    ],
    "name": "setSessionManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const PublicationSessionsAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "ephemeralAccountsAddr",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "EditorAlreadyAssigned",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidHash",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidPseudonym",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidReviewerCount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSessionId",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidStatus",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidStatusTransition",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyAdmin",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlySessionManager",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SessionAlreadyExists",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SessionNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "UnauthorizedRole",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "editorPseudonym",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "assignedAt",
        "type": "uint64"
      }
    ],
    "name": "EditorAssigned",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "originalManuscriptHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "anonymizedManuscriptHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "metadataHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "anonymizedManuscriptURI",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "metadataURI",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "revisionCount",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "updatedAt",
        "type": "uint64"
      }
    ],
    "name": "ManuscriptRevisionRecorded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "authorPseudonym",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "originalManuscriptHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "anonymizedManuscriptHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "metadataHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "anonymizedManuscriptURI",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "metadataURI",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "createdAt",
        "type": "uint64"
      }
    ],
    "name": "PublicationSessionCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "enum IPublicationSessions.PublicationStatus",
        "name": "previousStatus",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "enum IPublicationSessions.PublicationStatus",
        "name": "newStatus",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "updatedAt",
        "type": "uint64"
      }
    ],
    "name": "PublicationStatusUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "criteriaHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "reviewerCount",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "recordedAt",
        "type": "uint64"
      }
    ],
    "name": "ReviewerCriteriaRecorded",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "editorPseudonym",
        "type": "address"
      }
    ],
    "name": "assignEditor",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "authorPseudonym",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "originalManuscriptHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "anonymizedManuscriptHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "metadataHash",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "anonymizedManuscriptURI",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "metadataURI",
        "type": "string"
      }
    ],
    "name": "createSession",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      }
    ],
    "name": "exists",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      }
    ],
    "name": "getSession",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "authorPseudonym",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "editorPseudonym",
            "type": "address"
          },
          {
            "internalType": "bytes32",
            "name": "originalManuscriptHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "anonymizedManuscriptHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "metadataHash",
            "type": "bytes32"
          },
          {
            "internalType": "string",
            "name": "anonymizedManuscriptURI",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "metadataURI",
            "type": "string"
          },
          {
            "internalType": "enum IPublicationSessions.PublicationStatus",
            "name": "status",
            "type": "uint8"
          },
          {
            "internalType": "uint64",
            "name": "createdAt",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "updatedAt",
            "type": "uint64"
          },
          {
            "internalType": "uint32",
            "name": "revisionCount",
            "type": "uint32"
          }
        ],
        "internalType": "struct IPublicationSessions.PublicationSession",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "addr",
        "type": "address"
      }
    ],
    "name": "isSessionManager",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "criteriaHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint16",
        "name": "reviewerCount",
        "type": "uint16"
      }
    ],
    "name": "recordReviewerCriteria",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "newOriginalManuscriptHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "newAnonymizedManuscriptHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "newMetadataHash",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "newAnonymizedManuscriptURI",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "newMetadataURI",
        "type": "string"
      }
    ],
    "name": "recordRevision",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "manager",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "authorized",
        "type": "bool"
      }
    ],
    "name": "setSessionManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "enum IPublicationSessions.PublicationStatus",
        "name": "newStatus",
        "type": "uint8"
      }
    ],
    "name": "updateStatus",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const AutomaticChecksAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "publicationSessionsAddr",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "InvalidBatch",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidHash",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidResult",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSessionId",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSessionStatus",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyAdmin",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlySessionManager",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RecordNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SessionNotFound",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "reportHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "flagsHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "reportURI",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "enum IAutomaticChecks.AutomaticCheckResult",
        "name": "result",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      }
    ],
    "name": "AutomaticCheckRecorded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "manager",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "authorized",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      }
    ],
    "name": "SessionManagerUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      }
    ],
    "name": "getLatestBatch",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      }
    ],
    "name": "getLatestRecord",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "uint32",
            "name": "batch",
            "type": "uint32"
          },
          {
            "internalType": "bytes32",
            "name": "reportHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "flagsHash",
            "type": "bytes32"
          },
          {
            "internalType": "string",
            "name": "reportURI",
            "type": "string"
          },
          {
            "internalType": "enum IAutomaticChecks.AutomaticCheckResult",
            "name": "result",
            "type": "uint8"
          },
          {
            "internalType": "uint64",
            "name": "recordedAt",
            "type": "uint64"
          }
        ],
        "internalType": "struct IAutomaticChecks.AutomaticCheckRecord",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      }
    ],
    "name": "getRecord",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "uint32",
            "name": "batch",
            "type": "uint32"
          },
          {
            "internalType": "bytes32",
            "name": "reportHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "flagsHash",
            "type": "bytes32"
          },
          {
            "internalType": "string",
            "name": "reportURI",
            "type": "string"
          },
          {
            "internalType": "enum IAutomaticChecks.AutomaticCheckResult",
            "name": "result",
            "type": "uint8"
          },
          {
            "internalType": "uint64",
            "name": "recordedAt",
            "type": "uint64"
          }
        ],
        "internalType": "struct IAutomaticChecks.AutomaticCheckRecord",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      }
    ],
    "name": "hasRecord",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "addr",
        "type": "address"
      }
    ],
    "name": "isSessionManager",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "reportHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "flagsHash",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "reportURI",
        "type": "string"
      },
      {
        "internalType": "enum IAutomaticChecks.AutomaticCheckResult",
        "name": "result",
        "type": "uint8"
      }
    ],
    "name": "recordAutomaticCheck",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "manager",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "authorized",
        "type": "bool"
      }
    ],
    "name": "setSessionManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const EditorialScreeningsAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "ephemeralAccountsAddr",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "publicationSessionsAddr",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "InvalidDecision",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidHash",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidPseudonym",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSessionId",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSessionStatus",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyAdmin",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlySessionManager",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RecordAlreadyExists",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RecordNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SessionNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "UnauthorizedEditor",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "revision",
        "type": "uint32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "editorPseudonym",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "editorialReportHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "anonymousEditorialReportHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "anonymousEditorialReportURI",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "enum IEditorialScreenings.DeskReviewDecision",
        "name": "decision",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "recordedAt",
        "type": "uint64"
      }
    ],
    "name": "EditorialScreeningRecorded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "manager",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "authorized",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      }
    ],
    "name": "SessionManagerUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      }
    ],
    "name": "getLatestRecord",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "uint32",
            "name": "revision",
            "type": "uint32"
          },
          {
            "internalType": "address",
            "name": "editorPseudonym",
            "type": "address"
          },
          {
            "internalType": "bytes32",
            "name": "editorialReportHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "anonymousEditorialReportHash",
            "type": "bytes32"
          },
          {
            "internalType": "string",
            "name": "anonymousEditorialReportURI",
            "type": "string"
          },
          {
            "internalType": "enum IEditorialScreenings.DeskReviewDecision",
            "name": "decision",
            "type": "uint8"
          },
          {
            "internalType": "uint64",
            "name": "recordedAt",
            "type": "uint64"
          }
        ],
        "internalType": "struct IEditorialScreenings.EditorialScreeningRecord",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "revision",
        "type": "uint32"
      }
    ],
    "name": "getRecord",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "uint32",
            "name": "revision",
            "type": "uint32"
          },
          {
            "internalType": "address",
            "name": "editorPseudonym",
            "type": "address"
          },
          {
            "internalType": "bytes32",
            "name": "editorialReportHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "anonymousEditorialReportHash",
            "type": "bytes32"
          },
          {
            "internalType": "string",
            "name": "anonymousEditorialReportURI",
            "type": "string"
          },
          {
            "internalType": "enum IEditorialScreenings.DeskReviewDecision",
            "name": "decision",
            "type": "uint8"
          },
          {
            "internalType": "uint64",
            "name": "recordedAt",
            "type": "uint64"
          }
        ],
        "internalType": "struct IEditorialScreenings.EditorialScreeningRecord",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "revision",
        "type": "uint32"
      }
    ],
    "name": "hasRecord",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "addr",
        "type": "address"
      }
    ],
    "name": "isSessionManager",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "editorPseudonym",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "editorialReportHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "anonymousEditorialReportHash",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "anonymousEditorialReportURI",
        "type": "string"
      },
      {
        "internalType": "enum IEditorialScreenings.DeskReviewDecision",
        "name": "decision",
        "type": "uint8"
      }
    ],
    "name": "recordEditorialScreening",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "revision",
        "type": "uint32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "manager",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "authorized",
        "type": "bool"
      }
    ],
    "name": "setSessionManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const AssignmentProofsAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "ephemeralAccountsAddr",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "publicationSessionsAddr",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "EditorAlreadyRecorded",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "EditorMismatch",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidCommitment",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidPseudonym",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidReference",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSessionId",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSessionStatus",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LengthMismatch",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyAdmin",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlySessionManager",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ProofAlreadyExists",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ProofNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SessionNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "UnauthorizedRole",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "editorPseudonym",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "proofRef",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      }
    ],
    "name": "EditorAssignmentProofRecorded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "reviewerAssignmentCommitment",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "inviteRef",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "proofRef",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      }
    ],
    "name": "ReviewerAssignmentProofRecorded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "manager",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "authorized",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      }
    ],
    "name": "SessionManagerUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32[]",
        "name": "reviewerAssignmentCommitments",
        "type": "bytes32[]"
      },
      {
        "internalType": "bytes32[]",
        "name": "inviteRefs",
        "type": "bytes32[]"
      },
      {
        "internalType": "bytes32[]",
        "name": "proofRefs",
        "type": "bytes32[]"
      }
    ],
    "name": "batchRecordReviewerAssignmentProofs",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      }
    ],
    "name": "getEditorAssignmentProof",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "editorPseudonym",
            "type": "address"
          },
          {
            "internalType": "bytes32",
            "name": "proofRef",
            "type": "bytes32"
          },
          {
            "internalType": "uint64",
            "name": "recordedAt",
            "type": "uint64"
          }
        ],
        "internalType": "struct IAssignmentProofs.EditorAssignmentProof",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "commitment",
        "type": "bytes32"
      }
    ],
    "name": "getReviewerAssignmentProof",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "reviewerAssignmentCommitment",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "inviteRef",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "proofRef",
            "type": "bytes32"
          },
          {
            "internalType": "uint64",
            "name": "recordedAt",
            "type": "uint64"
          }
        ],
        "internalType": "struct IAssignmentProofs.ReviewerAssignmentProof",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      }
    ],
    "name": "getReviewerAssignmentProofCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      }
    ],
    "name": "hasEditorAssignmentProof",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "commitment",
        "type": "bytes32"
      }
    ],
    "name": "hasReviewerAssignmentProof",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "addr",
        "type": "address"
      }
    ],
    "name": "isSessionManager",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "editorPseudonym",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "proofRef",
        "type": "bytes32"
      }
    ],
    "name": "recordEditorAssignmentProof",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "reviewerAssignmentCommitment",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "inviteRef",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "proofRef",
        "type": "bytes32"
      }
    ],
    "name": "recordReviewerAssignmentProof",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "manager",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "authorized",
        "type": "bool"
      }
    ],
    "name": "setSessionManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const ReviewerSelectionsAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "publicationSessionsAddr",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "BatchAlreadyExists",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BatchNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidCommitment",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidHash",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidReviewerCount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSessionId",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSessionStatus",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "LengthMismatch",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyAdmin",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlySessionManager",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SelectionAlreadyExists",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SessionNotFound",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "reviewerAssignmentCommitment",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "recordedAt",
        "type": "uint64"
      }
    ],
    "name": "ReviewerSelected",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "criteriaHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "reviewerCount",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "selectedCount",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "recordedAt",
        "type": "uint64"
      }
    ],
    "name": "ReviewerSelectionBatchRecorded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "manager",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "authorized",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      }
    ],
    "name": "SessionManagerUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      }
    ],
    "name": "getBatch",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "uint32",
            "name": "batch",
            "type": "uint32"
          },
          {
            "internalType": "bytes32",
            "name": "criteriaHash",
            "type": "bytes32"
          },
          {
            "internalType": "uint16",
            "name": "reviewerCount",
            "type": "uint16"
          },
          {
            "internalType": "uint16",
            "name": "selectedCount",
            "type": "uint16"
          },
          {
            "internalType": "uint64",
            "name": "recordedAt",
            "type": "uint64"
          }
        ],
        "internalType": "struct IReviewerSelections.ReviewerSelectionBatch",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      }
    ],
    "name": "getLatestBatch",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      },
      {
        "internalType": "bytes32",
        "name": "commitment",
        "type": "bytes32"
      }
    ],
    "name": "getSelectedReviewer",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "uint32",
            "name": "batch",
            "type": "uint32"
          },
          {
            "internalType": "bytes32",
            "name": "reviewerAssignmentCommitment",
            "type": "bytes32"
          },
          {
            "internalType": "uint64",
            "name": "recordedAt",
            "type": "uint64"
          }
        ],
        "internalType": "struct IReviewerSelections.SelectedReviewer",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      }
    ],
    "name": "getSelectedReviewerCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      }
    ],
    "name": "hasBatch",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      },
      {
        "internalType": "bytes32",
        "name": "commitment",
        "type": "bytes32"
      }
    ],
    "name": "hasSelection",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "addr",
        "type": "address"
      }
    ],
    "name": "isSessionManager",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "criteriaHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint16",
        "name": "reviewerCount",
        "type": "uint16"
      },
      {
        "internalType": "bytes32[]",
        "name": "reviewerAssignmentCommitments",
        "type": "bytes32[]"
      }
    ],
    "name": "recordSelectionBatch",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "manager",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "authorized",
        "type": "bool"
      }
    ],
    "name": "setSessionManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const ReviewSubmissionsAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "ephemeralAccountsAddr",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "publicationSessionsAddr",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "assignmentProofsAddr",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "CommitAlreadyExists",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CommitNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidCommitment",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidHash",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidPhase",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidPseudonym",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidRecommendation",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidReveal",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSessionId",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSessionStatus",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyAdmin",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlySessionManager",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RevealAlreadyExists",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SessionNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "UnauthorizedReviewer",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "reviewerPseudonym",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "assignmentCommitment",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "commitHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "committedAt",
        "type": "uint64"
      }
    ],
    "name": "ReviewCommitted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "enum IReviewSubmissions.ReviewPhase",
        "name": "previousPhase",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "enum IReviewSubmissions.ReviewPhase",
        "name": "newPhase",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "updatedAt",
        "type": "uint64"
      }
    ],
    "name": "ReviewPhaseUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "reviewerPseudonym",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "assignmentCommitment",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "enum IReviewSubmissions.ReviewRecommendation",
        "name": "recommendation",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "reviewHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "reviewURI",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "revealedAt",
        "type": "uint64"
      }
    ],
    "name": "ReviewRevealed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "manager",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "authorized",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      }
    ],
    "name": "SessionManagerUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "reviewerPseudonym",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "assignmentCommitment",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "commitHash",
        "type": "bytes32"
      }
    ],
    "name": "commitReview",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "reviewerPseudonym",
        "type": "address"
      },
      {
        "internalType": "enum IReviewSubmissions.ReviewRecommendation",
        "name": "recommendation",
        "type": "uint8"
      },
      {
        "internalType": "bytes32",
        "name": "reviewHash",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "reviewURI",
        "type": "string"
      },
      {
        "internalType": "bytes32",
        "name": "nonce",
        "type": "bytes32"
      }
    ],
    "name": "computeCommitHash",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "reviewer",
        "type": "address"
      }
    ],
    "name": "getCommitRecord",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "reviewerPseudonym",
            "type": "address"
          },
          {
            "internalType": "bytes32",
            "name": "assignmentCommitment",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "commitHash",
            "type": "bytes32"
          },
          {
            "internalType": "bool",
            "name": "revealed",
            "type": "bool"
          },
          {
            "internalType": "uint64",
            "name": "committedAt",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "revealedAt",
            "type": "uint64"
          }
        ],
        "internalType": "struct IReviewSubmissions.ReviewCommitRecord",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "reviewer",
        "type": "address"
      }
    ],
    "name": "getRevealRecord",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "reviewerPseudonym",
            "type": "address"
          },
          {
            "internalType": "bytes32",
            "name": "assignmentCommitment",
            "type": "bytes32"
          },
          {
            "internalType": "enum IReviewSubmissions.ReviewRecommendation",
            "name": "recommendation",
            "type": "uint8"
          },
          {
            "internalType": "bytes32",
            "name": "reviewHash",
            "type": "bytes32"
          },
          {
            "internalType": "string",
            "name": "reviewURI",
            "type": "string"
          },
          {
            "internalType": "bytes32",
            "name": "nonce",
            "type": "bytes32"
          },
          {
            "internalType": "uint64",
            "name": "revealedAt",
            "type": "uint64"
          }
        ],
        "internalType": "struct IReviewSubmissions.ReviewRevealRecord",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      }
    ],
    "name": "getReviewPhase",
    "outputs": [
      {
        "internalType": "enum IReviewSubmissions.ReviewPhase",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "reviewer",
        "type": "address"
      }
    ],
    "name": "hasCommit",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "reviewer",
        "type": "address"
      }
    ],
    "name": "hasReveal",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "addr",
        "type": "address"
      }
    ],
    "name": "isSessionManager",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "reviewerPseudonym",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "assignmentCommitment",
        "type": "bytes32"
      },
      {
        "internalType": "enum IReviewSubmissions.ReviewRecommendation",
        "name": "recommendation",
        "type": "uint8"
      },
      {
        "internalType": "bytes32",
        "name": "reviewHash",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "reviewURI",
        "type": "string"
      },
      {
        "internalType": "bytes32",
        "name": "nonce",
        "type": "bytes32"
      }
    ],
    "name": "revealReview",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "enum IReviewSubmissions.ReviewPhase",
        "name": "newPhase",
        "type": "uint8"
      }
    ],
    "name": "setReviewPhase",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "manager",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "authorized",
        "type": "bool"
      }
    ],
    "name": "setSessionManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const ReviewDecisionsAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "publicationSessionsAddr",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "reviewSubmissionsAddr",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "BatchAlreadyDecided",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DuplicateReviewer",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidBatch",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidOutcome",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidReviewerCount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSessionId",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSessionStatus",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyAdmin",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlySessionManager",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RevealNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SessionNotFound",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "reviewerCount",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "rejectCount",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "majorRevisionCount",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "minorRevisionCount",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "acceptAsIsCount",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "grayZone",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "additionalReviewerCount",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "enum IReviewDecisions.DecisionOutcome",
        "name": "outcome",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "decidedAt",
        "type": "uint64"
      }
    ],
    "name": "ReviewBatchDecided",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "manager",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "authorized",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      }
    ],
    "name": "SessionManagerUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint16",
        "name": "rejectCount",
        "type": "uint16"
      },
      {
        "internalType": "uint16",
        "name": "majorRevisionCount",
        "type": "uint16"
      },
      {
        "internalType": "uint16",
        "name": "minorRevisionCount",
        "type": "uint16"
      },
      {
        "internalType": "uint16",
        "name": "acceptAsIsCount",
        "type": "uint16"
      }
    ],
    "name": "computeOutcome",
    "outputs": [
      {
        "internalType": "bool",
        "name": "grayZone",
        "type": "bool"
      },
      {
        "internalType": "enum IReviewDecisions.DecisionOutcome",
        "name": "outcome",
        "type": "uint8"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      },
      {
        "internalType": "address[]",
        "name": "reviewerPseudonyms",
        "type": "address[]"
      },
      {
        "internalType": "uint16",
        "name": "additionalReviewerCountIfGrayZone",
        "type": "uint16"
      }
    ],
    "name": "decideBatch",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      }
    ],
    "name": "getDecision",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "exists",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "uint32",
            "name": "batch",
            "type": "uint32"
          },
          {
            "internalType": "uint16",
            "name": "reviewerCount",
            "type": "uint16"
          },
          {
            "internalType": "uint16",
            "name": "rejectCount",
            "type": "uint16"
          },
          {
            "internalType": "uint16",
            "name": "majorRevisionCount",
            "type": "uint16"
          },
          {
            "internalType": "uint16",
            "name": "minorRevisionCount",
            "type": "uint16"
          },
          {
            "internalType": "uint16",
            "name": "acceptAsIsCount",
            "type": "uint16"
          },
          {
            "internalType": "bool",
            "name": "grayZone",
            "type": "bool"
          },
          {
            "internalType": "uint16",
            "name": "additionalReviewerCount",
            "type": "uint16"
          },
          {
            "internalType": "enum IReviewDecisions.DecisionOutcome",
            "name": "outcome",
            "type": "uint8"
          },
          {
            "internalType": "uint64",
            "name": "decidedAt",
            "type": "uint64"
          }
        ],
        "internalType": "struct IReviewDecisions.DecisionBatch",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      }
    ],
    "name": "hasDecision",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "addr",
        "type": "address"
      }
    ],
    "name": "isSessionManager",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "manager",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "authorized",
        "type": "bool"
      }
    ],
    "name": "setSessionManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const SimulatedZkVerifierAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "attestor_",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "InvalidAttestor",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyAdmin",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousAttestor",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newAttestor",
        "type": "address"
      }
    ],
    "name": "AttestorUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "PROOF_DOMAIN",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "attestor",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint8",
        "name": "kind",
        "type": "uint8"
      },
      {
        "internalType": "bytes32[]",
        "name": "publicSignals",
        "type": "bytes32[]"
      }
    ],
    "name": "proofDigest",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newAttestor",
        "type": "address"
      }
    ],
    "name": "setAttestor",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint8",
        "name": "kind",
        "type": "uint8"
      },
      {
        "internalType": "bytes32[]",
        "name": "publicSignals",
        "type": "bytes32[]"
      },
      {
        "internalType": "bytes",
        "name": "proof",
        "type": "bytes"
      }
    ],
    "name": "verify",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const ActionGatewayAbi = [
  {
    "inputs": [
      {
        "internalType": "address[8]",
        "name": "cikoContracts",
        "type": "address[8]"
      },
      {
        "internalType": "address",
        "name": "verifier_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "operator_",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AssignmentAlreadyBound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AssignmentNotOwnedByPseudonym",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AssignmentNotRecorded",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ECDSAInvalidSignature",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "length",
        "type": "uint256"
      }
    ],
    "name": "ECDSAInvalidSignatureLength",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "s",
        "type": "bytes32"
      }
    ],
    "name": "ECDSAInvalidSignatureS",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidNonce",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidProof",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSession",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidShortString",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSignature",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotSessionAuthor",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NullifierAlreadyUsed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyAdmin",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyOperator",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "str",
        "type": "string"
      }
    ],
    "name": "StringTooLong",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "UnauthorizedRole",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousAdmin",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newAdmin",
        "type": "address"
      }
    ],
    "name": "AdminTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "assignmentCommitment",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "pseudonym",
        "type": "address"
      }
    ],
    "name": "AssignmentBound",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [],
    "name": "EIP712DomainChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint8",
        "name": "kind",
        "type": "uint8"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "nullifier",
        "type": "bytes32"
      }
    ],
    "name": "NullifierConsumed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOperator",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOperator",
        "type": "address"
      }
    ],
    "name": "OperatorUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousVerifier",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newVerifier",
        "type": "address"
      }
    ],
    "name": "VerifierUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "COMMIT_TYPEHASH",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "CREATE_SESSION_TYPEHASH",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "REVEAL_TYPEHASH",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "REVISION_TYPEHASH",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "SCREENING_TYPEHASH",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "editorPseudonym",
        "type": "address"
      }
    ],
    "name": "assignEditor",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "assignmentOwner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "assignmentProofs",
    "outputs": [
      {
        "internalType": "contract IAssignmentProofs",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "automaticChecks",
    "outputs": [
      {
        "internalType": "contract IAutomaticChecks",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32[]",
        "name": "reviewerAssignmentCommitments",
        "type": "bytes32[]"
      },
      {
        "internalType": "bytes32[]",
        "name": "inviteRefs",
        "type": "bytes32[]"
      },
      {
        "internalType": "bytes32[]",
        "name": "proofRefs",
        "type": "bytes32[]"
      }
    ],
    "name": "batchRecordReviewerAssignmentProofs",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "assignmentCommitment",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "pseudonym",
        "type": "address"
      },
      {
        "internalType": "bytes",
        "name": "proof",
        "type": "bytes"
      }
    ],
    "name": "bindAssignment",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "pseudonym",
            "type": "address"
          },
          {
            "internalType": "bytes32",
            "name": "assignmentCommitment",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "commitHash",
            "type": "bytes32"
          },
          {
            "internalType": "uint256",
            "name": "nonce",
            "type": "uint256"
          }
        ],
        "internalType": "struct ActionGateway.CommitAction",
        "name": "a",
        "type": "tuple"
      },
      {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
      }
    ],
    "name": "commitReviewSigned",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "enum IEphemeralAccounts.Role",
        "name": "role",
        "type": "uint8"
      },
      {
        "internalType": "address",
        "name": "pseudonym",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "sessionCommitment",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "nullifier",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "proof",
        "type": "bytes"
      }
    ],
    "name": "createEphemeralWithProof",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "pseudonym",
            "type": "address"
          },
          {
            "internalType": "bytes32",
            "name": "originalManuscriptHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "anonymizedManuscriptHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "metadataHash",
            "type": "bytes32"
          },
          {
            "internalType": "string",
            "name": "anonymizedManuscriptURI",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "metadataURI",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "nonce",
            "type": "uint256"
          }
        ],
        "internalType": "struct ActionGateway.CreateSessionAction",
        "name": "a",
        "type": "tuple"
      },
      {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
      }
    ],
    "name": "createSessionSigned",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "uint32",
        "name": "batch",
        "type": "uint32"
      },
      {
        "internalType": "address[]",
        "name": "reviewerPseudonyms",
        "type": "address[]"
      },
      {
        "internalType": "uint16",
        "name": "additionalReviewerCountIfGrayZone",
        "type": "uint16"
      }
    ],
    "name": "decideBatch",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "domainSeparator",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "editorialScreenings",
    "outputs": [
      {
        "internalType": "contract IEditorialScreenings",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "eip712Domain",
    "outputs": [
      {
        "internalType": "bytes1",
        "name": "fields",
        "type": "bytes1"
      },
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "version",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "verifyingContract",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "salt",
        "type": "bytes32"
      },
      {
        "internalType": "uint256[]",
        "name": "extensions",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "ephemeralAccounts",
    "outputs": [
      {
        "internalType": "contract IEphemeralAccounts",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "nonces",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "nullifierUsed",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "operator",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "publicationSessions",
    "outputs": [
      {
        "internalType": "contract IPublicationSessions",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "reportHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "flagsHash",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "reportURI",
        "type": "string"
      },
      {
        "internalType": "enum IAutomaticChecks.AutomaticCheckResult",
        "name": "result",
        "type": "uint8"
      }
    ],
    "name": "recordAutomaticCheck",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "editorPseudonym",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "proofRef",
        "type": "bytes32"
      }
    ],
    "name": "recordEditorAssignmentProof",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "reviewerAssignmentCommitment",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "inviteRef",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "proofRef",
        "type": "bytes32"
      }
    ],
    "name": "recordReviewerAssignmentProof",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "criteriaHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint16",
        "name": "reviewerCount",
        "type": "uint16"
      }
    ],
    "name": "recordReviewerCriteria",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "pseudonym",
            "type": "address"
          },
          {
            "internalType": "bytes32",
            "name": "newOriginalManuscriptHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "newAnonymizedManuscriptHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "newMetadataHash",
            "type": "bytes32"
          },
          {
            "internalType": "string",
            "name": "newAnonymizedManuscriptURI",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "newMetadataURI",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "nonce",
            "type": "uint256"
          }
        ],
        "internalType": "struct ActionGateway.RevisionAction",
        "name": "a",
        "type": "tuple"
      },
      {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
      }
    ],
    "name": "recordRevisionSigned",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "criteriaHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint16",
        "name": "reviewerCount",
        "type": "uint16"
      },
      {
        "internalType": "bytes32[]",
        "name": "reviewerAssignmentCommitments",
        "type": "bytes32[]"
      }
    ],
    "name": "recordSelectionBatch",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "pseudonym",
            "type": "address"
          },
          {
            "internalType": "bytes32",
            "name": "assignmentCommitment",
            "type": "bytes32"
          },
          {
            "internalType": "uint8",
            "name": "recommendation",
            "type": "uint8"
          },
          {
            "internalType": "bytes32",
            "name": "reviewHash",
            "type": "bytes32"
          },
          {
            "internalType": "string",
            "name": "reviewURI",
            "type": "string"
          },
          {
            "internalType": "bytes32",
            "name": "reviewNonce",
            "type": "bytes32"
          },
          {
            "internalType": "uint256",
            "name": "nonce",
            "type": "uint256"
          }
        ],
        "internalType": "struct ActionGateway.RevealAction",
        "name": "a",
        "type": "tuple"
      },
      {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
      }
    ],
    "name": "revealReviewSigned",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "reviewDecisions",
    "outputs": [
      {
        "internalType": "contract IReviewDecisions",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "reviewSubmissions",
    "outputs": [
      {
        "internalType": "contract IReviewSubmissions",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "reviewerSelections",
    "outputs": [
      {
        "internalType": "contract IReviewerSelections",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "pseudonym",
            "type": "address"
          },
          {
            "internalType": "bytes32",
            "name": "editorialReportHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "anonymousEditorialReportHash",
            "type": "bytes32"
          },
          {
            "internalType": "string",
            "name": "anonymousEditorialReportURI",
            "type": "string"
          },
          {
            "internalType": "uint8",
            "name": "decision",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "nonce",
            "type": "uint256"
          }
        ],
        "internalType": "struct ActionGateway.ScreeningAction",
        "name": "a",
        "type": "tuple"
      },
      {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
      }
    ],
    "name": "screeningSigned",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "revision",
        "type": "uint32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOperator",
        "type": "address"
      }
    ],
    "name": "setOperator",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "enum IReviewSubmissions.ReviewPhase",
        "name": "newPhase",
        "type": "uint8"
      }
    ],
    "name": "setReviewPhase",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newVerifier",
        "type": "address"
      }
    ],
    "name": "setVerifier",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newAdmin",
        "type": "address"
      }
    ],
    "name": "transferAdmin",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "enum IPublicationSessions.PublicationStatus",
        "name": "newStatus",
        "type": "uint8"
      }
    ],
    "name": "updateStatus",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "verifier",
    "outputs": [
      {
        "internalType": "contract IZkVerifier",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const EscrowPoolAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "publicationSessions_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "reviewerSelections_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "reviewDecisions_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "verifierSource_",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "apcAmount_",
        "type": "uint256"
      },
      {
        "internalType": "uint64",
        "name": "idleTimeout_",
        "type": "uint64"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AlreadyBound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "EngineAlreadySet",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidCredit",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidProof",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidShortString",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSignature",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NoUnboundNote",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotDistributable",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotRefundable",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NoteAlreadyDeposited",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NothingToClaim",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NullifierAlreadyUsed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyAdmin",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyEngine",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SessionNotBindable",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SessionNotFound",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "str",
        "type": "string"
      }
    ],
    "name": "StringTooLong",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TransferFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "WrongAmount",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [],
    "name": "EIP712DomainChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "engine",
        "type": "address"
      }
    ],
    "name": "EngineSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "nullifier",
        "type": "bytes32"
      }
    ],
    "name": "NoteBound",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "noteCommitment",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "depositIndex",
        "type": "uint256"
      }
    ],
    "name": "NoteDeposited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "Refunded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "pseudonym",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "RewardClaimed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "recipients",
        "type": "uint256"
      }
    ],
    "name": "RewardsCredited",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "CLAIM_REWARD_TYPEHASH",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "apcAmount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "nullifier",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "proof",
        "type": "bytes"
      }
    ],
    "name": "bindNote",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "pseudonym",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
      }
    ],
    "name": "claimReward",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address[]",
        "name": "pseudonyms",
        "type": "address[]"
      },
      {
        "internalType": "uint256[]",
        "name": "amounts",
        "type": "uint256[]"
      }
    ],
    "name": "creditRewards",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "noteCommitment",
        "type": "bytes32"
      }
    ],
    "name": "deposit",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "depositCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      }
    ],
    "name": "distributable",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "domainSeparator",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "eip712Domain",
    "outputs": [
      {
        "internalType": "bytes1",
        "name": "fields",
        "type": "bytes1"
      },
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "version",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "verifyingContract",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "salt",
        "type": "bytes32"
      },
      {
        "internalType": "uint256[]",
        "name": "extensions",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "engine",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      }
    ],
    "name": "escrowAmount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "escrows",
    "outputs": [
      {
        "internalType": "enum EscrowPool.EscrowState",
        "name": "state",
        "type": "uint8"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "bindNullifier",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "boundAt",
        "type": "uint64"
      },
      {
        "internalType": "uint256",
        "name": "unclaimed",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      }
    ],
    "name": "hasDecision",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "idleTimeout",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      }
    ],
    "name": "isIdle",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "noteDeposited",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "nullifierUsed",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "publicationSessions",
    "outputs": [
      {
        "internalType": "contract IPublicationSessions",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "nullifier",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "proof",
        "type": "bytes"
      }
    ],
    "name": "refund",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      }
    ],
    "name": "refundable",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "reviewDecisions",
    "outputs": [
      {
        "internalType": "contract IReviewDecisions",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "reviewerSelections",
    "outputs": [
      {
        "internalType": "contract IReviewerSelections",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "rewardCredit",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "engine_",
        "type": "address"
      }
    ],
    "name": "setEngine",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unboundNotes",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "verifierSource",
    "outputs": [
      {
        "internalType": "contract IVerifierSource",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const IncentiveEngineAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "escrowPool_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "reputationSBT_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "reviewSubmissions_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "operator_",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "sigmoidK_",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "sigmoidX0_",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AlreadyDistributed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DuplicatePseudonym",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidMatrixValue",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidReviewerCount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSigmoidParams",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MatrixMismatch",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NoReward",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotDistributable",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyAdmin",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyOperator",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "pseudonym",
        "type": "address"
      }
    ],
    "name": "PseudonymNotRevealed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "WeightsMustSumToOne",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOperator",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOperator",
        "type": "address"
      }
    ],
    "name": "OperatorUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "pseudonym",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "ethReward",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "reputationAmount",
        "type": "uint256"
      }
    ],
    "name": "RewardCredited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sessionId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256[]",
        "name": "scores",
        "type": "uint256[]"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "qosReportHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "policyHash",
        "type": "bytes32"
      }
    ],
    "name": "SessionDistributed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "k",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "x0",
        "type": "uint256"
      }
    ],
    "name": "SigmoidParamsUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "MAX_REVIEWERS",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "NUM_CRITERIA",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "PRECISION",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "distributions",
    "outputs": [
      {
        "internalType": "bool",
        "name": "executed",
        "type": "bool"
      },
      {
        "internalType": "uint16",
        "name": "reviewerCount",
        "type": "uint16"
      },
      {
        "internalType": "uint64",
        "name": "executedAt",
        "type": "uint64"
      },
      {
        "internalType": "bytes32",
        "name": "qosReportHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "policyHash",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "escrowPool",
    "outputs": [
      {
        "internalType": "contract IEscrowPool",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "sessionId",
            "type": "bytes32"
          },
          {
            "internalType": "uint256[][]",
            "name": "matrix",
            "type": "uint256[][]"
          },
          {
            "internalType": "uint256[4]",
            "name": "weights",
            "type": "uint256[4]"
          },
          {
            "internalType": "address[]",
            "name": "pseudonyms",
            "type": "address[]"
          },
          {
            "internalType": "bytes32",
            "name": "qosReportHash",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "policyHash",
            "type": "bytes32"
          }
        ],
        "internalType": "struct IncentiveEngine.DistributionInput",
        "name": "input",
        "type": "tuple"
      }
    ],
    "name": "executeDistribution",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "operator",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "reputationSBT",
    "outputs": [
      {
        "internalType": "contract IReputationSBT",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "reviewSubmissions",
    "outputs": [
      {
        "internalType": "contract IReviewSubmissions",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOperator",
        "type": "address"
      }
    ],
    "name": "setOperator",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "k",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "x0",
        "type": "uint256"
      }
    ],
    "name": "setSigmoidParams",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "sigmoidK",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "sigmoidX0",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const ReputationSBTAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "verifierSource_",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "decayRatePerDay_",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "claimStep_",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "EngineAlreadySet",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ExceedsUnclaimed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidAmount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidProof",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidRate",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NullifierAlreadyUsed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyAdmin",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyEngine",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "previousRate",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newRate",
        "type": "uint256"
      }
    ],
    "name": "DecayRateUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "engine",
        "type": "address"
      }
    ],
    "name": "EngineSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "unclaimedPool",
        "type": "uint256"
      }
    ],
    "name": "ReputationAccrued",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "reputationId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "before",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "after_",
        "type": "uint256"
      }
    ],
    "name": "ReputationDecayed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "reputationId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "ReputationMinted",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "PRECISION",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "accrue",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "reputationId",
        "type": "bytes32"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "reputationId",
            "type": "bytes32"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          },
          {
            "internalType": "bytes32",
            "name": "nullifier",
            "type": "bytes32"
          },
          {
            "internalType": "bytes",
            "name": "proof",
            "type": "bytes"
          }
        ],
        "internalType": "struct ReputationSBT.Claim[]",
        "name": "claims",
        "type": "tuple[]"
      }
    ],
    "name": "claimReputation",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "claimStep",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "reputationId",
        "type": "bytes32"
      }
    ],
    "name": "decayCheckpoint",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decayRatePerDay",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "reputationId",
        "type": "bytes32"
      }
    ],
    "name": "effectiveBalance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "engine",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "nullifierUsed",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "newRate",
        "type": "uint256"
      }
    ],
    "name": "setDecayRate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "engine_",
        "type": "address"
      }
    ],
    "name": "setEngine",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "reputationId",
        "type": "bytes32"
      }
    ],
    "name": "triggerDecay",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unclaimedPool",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "verifierSource",
    "outputs": [
      {
        "internalType": "contract IVerifierSource",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

