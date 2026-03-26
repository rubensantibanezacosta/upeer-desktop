export interface GetMyNetworkAddressResponse {
    address: string;
}

export interface GetMyIdentityResponse {
    upeerId: string;
    alias: string;
    avatar: string | null;
    publicKey: string;
    fingerprint: string;
}

export interface GetVaultStatsResponse {
    totalEntries: number;
    storageUsedBytes: number;
    uniqueSenders: number;
    replicationFactor: number;
}

export interface IdentityStatusResponse {
    isUnlocked: boolean;
    hasIdentity: boolean;
    alias?: string;
    avatar?: string;
}

export interface GenerateMnemonicResponse {
    mnemonic: string;
}

export interface CreateMnemonicIdentityRequest {
    mnemonic: string;
    alias?: string;
    avatar?: string;
}

export interface CreateMnemonicIdentityResponse {
    success: boolean;
    upeerId?: string;
    error?: string;
}

export interface UnlockSessionRequest {
    mnemonic: string;
}

export interface UnlockSessionResponse {
    success: boolean;
    error?: string;
}

export interface LockSessionResponse {
    success: boolean;
}

export interface SetMyAliasRequest {
    alias: string;
}

export interface SetMyAliasResponse {
    success: boolean;
    error?: string;
}

export interface SetMyAvatarRequest {
    avatar: string;
}

export interface SetMyAvatarResponse {
    success: boolean;
    error?: string;
}

export interface GetMyReputationResponse {
    score: number;
    totalVouches: number;
    directVouches: number;
    indirectVouches: number;
}

export interface AddContactRequest {
    address: string;
    name: string;
}

export interface AddContactResponse {
    success: boolean;
    upeerId?: string;
    error?: string;
}

export interface AcceptContactRequestRequest {
    upeerId: string;
    publicKey: string;
}

export interface AcceptContactRequestResponse {
    success: boolean;
    error?: string;
}

export interface DeleteContactRequest {
    upeerId: string;
}

export interface DeleteContactResponse {
    success: boolean;
    error?: string;
}

export interface ToggleFavoriteContactRequest {
    upeerId: string;
    isFavorite: boolean;
}

export interface ToggleFavoriteContactResponse {
    success: boolean;
    error?: string;
}

export interface ClearChatRequest {
    upeerId: string;
}

export interface ClearChatResponse {
    success: boolean;
    error?: string;
}

export interface BlockContactRequest {
    upeerId: string;
}

export interface BlockContactResponse {
    success: boolean;
    error?: string;
}

export interface UnblockContactRequest {
    upeerId: string;
}

export interface UnblockContactResponse {
    success: boolean;
    error?: string;
}

export interface GetBlockedContactsResponse {
    blocked: Array<{
        upeerId: string;
        alias: string;
        avatar: string | null;
        blockedAt: string;
    }>;
}

export interface Contact {
    upeerId: string;
    alias: string;
    avatar: string | null;
    address: string;
    publicKey: string;
    status: 'pending' | 'connected' | 'blocked';
    lastSeen: string;
    ephemeralPublicKey?: string;
    ephemeralPublicKeyUpdatedAt?: string;
    signedPreKey?: string;
    signedPreKeyId?: number;
}

export interface GetContactsResponse {
    contacts: Contact[];
}
