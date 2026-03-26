export const SOCKS_HOST = '127.0.0.1';
export const SOCKS_PORT = 9050;
export const APP_P2P_PORT = 50005;
export const YGG_IPV6_REGEX = /\b((?:2[0-9a-f]{2}|3[0-9a-f]{2}):[0-9a-f:]{4,}(?::[0-9a-f]{0,4}){1,6})\b/i;
export const MAX_RESTART_ATTEMPTS = 8;
export const RESTART_BASE_DELAY_MS = 3_000;

export type YggStatus = 'connecting' | 'up' | 'down' | 'reconnecting';
export type AddressCallback = (address: string) => void;
export type StatusCallback = (status: YggStatus, address?: string) => void;