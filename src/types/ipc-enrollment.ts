export interface EnrollmentInviteResponse {
    success: boolean;
    code?: string;
    inviteId?: string;
    expiresAt?: number;
    error?: string;
}

export interface EnrollmentPendingInvite {
    inviteId: string;
    authorizerDeviceId: string;
    expiresAt: number;
}

export interface EnrollmentListInvitesResponse {
    invites: EnrollmentPendingInvite[];
}

export interface EnrollmentCompleteRequest {
    code: string;
}

export interface EnrollmentCompleteResponse {
    success: boolean;
    code?: string;
    deviceId?: string;
    expiresAt?: number;
    error?: string;
}

export interface EnrollmentBeginRequest {
    code: string;
}

export interface EnrollmentBeginResponse {
    success: boolean;
    requestCode?: string;
    accountUpeerId?: string;
    expiresAt?: number;
    error?: string;
}

export interface EnrollmentFinishRequest {
    code: string;
}

export interface EnrollmentFinishResponse {
    success: boolean;
    deviceId?: string;
    upeerId?: string;
    expiresAt?: number;
    error?: string;
}

export interface EnrollmentCancelResponse {
    success: boolean;
}

export type DeviceIdentityStatus = 'root' | 'ready' | 'renewal-required' | 'locked';

export interface EnrollmentStatusResponse {
    pending: boolean;
    accountUpeerId?: string;
    expiresAt?: number;
    deviceStatus: DeviceIdentityStatus;
}

export interface AuthorizedDeviceView {
    deviceId: string;
    devicePublicKey: string;
    platform?: string;
    capabilities?: string[];
    authorizedAt: number;
    expiresAt: number;
    epoch: number;
}

export interface AuthorizedDevicesResponse {
    devices: AuthorizedDeviceView[];
    epoch: number | null;
}

export interface RevokeAuthorizedDeviceRequest {
    deviceId: string;
}

export interface RevokeAuthorizedDeviceResponse {
    success: boolean;
    epoch?: number;
    published?: boolean;
    error?: string;
}
