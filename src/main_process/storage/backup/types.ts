export interface SurvivalKitData {
    version: string;
    myUpeerId: string;
    myPublicKey: string;
    timestamp: number;
    contacts: Array<{
        upeerId: string;
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