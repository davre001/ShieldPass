export interface ShieldPassConfig {
    rpcUrl: string;
    networkPassphrase: string;
    contractId: string;
    wasmPath?: string;
}

export interface KYCProofParams {
    secretSalt: string;
    kycPassed: boolean;
    notSanctioned: boolean;
    merklePath: string[];
    merkleIndices: number[];
    merkleRoot: string;
}

export interface PrivatePaymentParams {
    privateNoteSecret: string;
    amount: bigint;
    recipientAddress: string;
    complianceNullifier: string;
    publicPoolRoot: string;
}

export interface ShieldedNote {
    secret: string;
    amount: bigint;
    commitment: string;
}
