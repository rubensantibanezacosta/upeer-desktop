export interface SurvivalKitData {
    version: string;
    myRevelnestId: string;
    myPublicKey: string;
    timestamp: number;
    contacts: Array<{
        revelnestId: string;
        name: string;
        publicKey: string;
        locationBlock: {
            address: string;
            dhtSeq: number;
            signature: string;
            expiresAt: number;
            renewalToken?: any;
        };
        lastSeen: number;
    }>;
    renewalTokens: Array<{
        targetId: string;
        token: any;
    }>;
}