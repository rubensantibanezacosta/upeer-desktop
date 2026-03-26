export interface PreviousSpkEntry {
    spkId: number;
    spkPk: Buffer;
    spkSk: Buffer;
}

export interface IdentityState {
    publicKey: Buffer | null;
    secretKey: Buffer | null;
    upeerId: string;
    ephemeralPublicKey: Buffer | null;
    ephemeralSecretKey: Buffer | null;
    spkPublicKey: Buffer | null;
    spkSecretKey: Buffer | null;
    spkId: number;
    spkRotationInterval: NodeJS.Timeout | null;
    previousSpkEntries: PreviousSpkEntry[];
    previousEphemeralSecretKeys: Buffer[];
    ephemeralKeyRotationInterval: NodeJS.Timeout | null;
    ephemeralKeyRotationCounter: number;
    dhtSeq: number;
    dhtStatePath: string;
    myAlias: string;
    myAvatar: string;
    userDataPath: string;
    isLocked: boolean;
    isMnemonicBased: boolean;
    mnemonic: string | null;
}

export const SPK_ROTATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_PREVIOUS_SPK = 5;
export const MAX_PREVIOUS_EPH_KEYS = 6;
export const EPHEMERAL_KEY_ROTATION_INTERVAL_MS = 5 * 60 * 1000;
export const EPHEMERAL_KEY_MAX_MESSAGES = 100;

export const MNEMONIC_MODE_FLAG = 'identity.mnemonic_mode';
export const DEVICE_KEY_FILE = 'device.key';
export const SESSION_ENC_FILE = 'identity.enc';
export const SESSION_LOCKED_FILE = 'session.locked';
export const ALIAS_FILE = 'identity.alias';
export const AVATAR_FILE = 'identity.avatar';
export const SPK_STATE_FILE = 'spk.enc';
export const MNEMONIC_ENC_FILE = 'identity.mnemonic.enc';

export const identityState: IdentityState = {
    publicKey: null,
    secretKey: null,
    upeerId: '',
    ephemeralPublicKey: null,
    ephemeralSecretKey: null,
    spkPublicKey: null,
    spkSecretKey: null,
    spkId: 0,
    spkRotationInterval: null,
    previousSpkEntries: [],
    previousEphemeralSecretKeys: [],
    ephemeralKeyRotationInterval: null,
    ephemeralKeyRotationCounter: 0,
    dhtSeq: 0,
    dhtStatePath: '',
    myAlias: '',
    myAvatar: '',
    userDataPath: '',
    isLocked: true,
    isMnemonicBased: false,
    mnemonic: null,
};
