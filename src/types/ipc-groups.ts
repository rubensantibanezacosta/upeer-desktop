import type { LinkPreview } from './chat.js';

export interface Group {
    id: string;
    name: string;
    adminUpeerId: string;
    members: string[];
    status: 'active' | 'archived';
    avatar: string | null;
}

export interface GetGroupsResponse {
    groups: Group[];
}

export interface CreateGroupRequest {
    name: string;
    memberUpeerIds: string[];
    avatar?: string;
}

export interface CreateGroupResponse {
    success: boolean;
    groupId?: string;
    error?: string;
}

export interface UpdateGroupAvatarRequest {
    groupId: string;
    avatar: string;
}

export interface UpdateGroupAvatarResponse {
    success: boolean;
    error?: string;
}

export interface SendGroupMessageRequest {
    groupId: string;
    message: string;
    replyTo?: string;
    linkPreview?: LinkPreview | null;
}

export interface SendGroupMessageResponse {
    id: string;
    timestamp: number;
    savedMessage: string;
}

export interface InviteToGroupRequest {
    groupId: string;
    upeerId: string;
}

export interface InviteToGroupResponse {
    success: boolean;
    error?: string;
}

export interface UpdateGroupRequest {
    groupId: string;
    name?: string;
    avatar?: string | null;
}

export interface UpdateGroupResponse {
    success: boolean;
    error?: string;
}

export interface ToggleFavoriteGroupRequest {
    groupId: string;
    isFavorite: boolean;
}

export interface ToggleFavoriteGroupResponse {
    success: boolean;
    error?: string;
}

export interface LeaveGroupRequest {
    groupId: string;
}

export interface LeaveGroupResponse {
    success: boolean;
    error?: string;
}
