import dgram from 'node:dgram';
import os from 'node:os';
import { getMyRevelNestId, getMyPublicKeyHex, getMyEphemeralPublicKeyHex, sign, verify } from '../../security/identity.js';
import { getNetworkAddress, canonicalStringify } from '../utils.js';
import { addOrUpdateContact } from '../../storage/db.js';
import { network, info, warn } from '../../security/secure-logger.js';

// LAN discovery constants
const LAN_DISCOVERY_PORT = 50006;
const LAN_MULTICAST_GROUP = 'ff02::1'; // IPv6 link-local all-nodes multicast
const LAN_BROADCAST_INTERVAL = 30000; // 30 seconds
const LAN_DISCOVERY_TIMEOUT = 60000; // 60 seconds

// LAN discovery message types
export interface LanDiscoveryMessage {
    type: 'LAN_DISCOVERY_ANNOUNCE' | 'LAN_DISCOVERY_RESPONSE';
    revelnestId: string;
    publicKey: string;
    ephemeralPublicKey?: string;
    address: string;
    timestamp: number;
    signature: string;
}

export class LanDiscovery {
    private socket: dgram.Socket | null = null;
    private discoveryInterval: NodeJS.Timeout | null = null;
    private discoveredPeers = new Map<string, { address: string; timestamp: number }>();
    private isRunning = false;

    constructor() {}

    // Start LAN discovery
    async start(): Promise<void> {
        if (this.isRunning) return;
        
        try {
            this.socket = dgram.createSocket({ type: 'udp6', reuseAddr: true });
            
            this.socket.on('message', (msg, rinfo) => {
                this.handleLanMessage(msg, rinfo);
            });
            
            this.socket.on('error', (err) => {
                warn('LAN discovery socket error', err, 'lan');
            });
            
            // Bind to all interfaces on LAN discovery port
            await new Promise<void>((resolve, reject) => {
                this.socket!.bind(LAN_DISCOVERY_PORT, '::', () => {
                    // Join multicast group for IPv6
                    try {
                        this.socket!.addMembership(LAN_MULTICAST_GROUP);
                        info('LAN discovery started', { port: LAN_DISCOVERY_PORT, multicastGroup: LAN_MULTICAST_GROUP }, 'lan');
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            
            // Start periodic announcements
            this.discoveryInterval = setInterval(() => {
                this.announcePresence();
                this.cleanupOldPeers();
            }, LAN_BROADCAST_INTERVAL);
            
            // Initial announcement
            setTimeout(() => this.announcePresence(), 1000);
            
            this.isRunning = true;
            
        } catch (error) {
            warn('Failed to start LAN discovery', error, 'lan');
            this.stop();
        }
    }

    // Stop LAN discovery
    stop(): void {
        if (this.discoveryInterval) {
            clearInterval(this.discoveryInterval);
            this.discoveryInterval = null;
        }
        
        if (this.socket) {
            try {
                this.socket.dropMembership(LAN_MULTICAST_GROUP);
                this.socket.close();
            } catch (error) {
                // Ignore errors during cleanup
            }
            this.socket = null;
        }
        
        this.discoveredPeers.clear();
        this.isRunning = false;
        info('LAN discovery stopped', {}, 'lan');
    }

    // Announce presence on LAN
    private announcePresence(): void {
        if (!this.socket) return;
        
        const myAddress = getNetworkAddress();
        if (!myAddress) return;
        
        // Create message data without signature
        const messageData = {
            type: 'LAN_DISCOVERY_ANNOUNCE' as const,
            revelnestId: getMyRevelNestId(),
            publicKey: getMyPublicKeyHex(),
            ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
            address: myAddress,
            timestamp: Date.now()
        };
        
        // Sign the message
        const signature = sign(Buffer.from(canonicalStringify(messageData))).toString('hex');
        
        // Add signature to final message
        const message: LanDiscoveryMessage = {
            ...messageData,
            signature
        };
        
        const buffer = Buffer.from(JSON.stringify(message));
        
        // Send to multicast group
        this.socket.send(buffer, 0, buffer.length, LAN_DISCOVERY_PORT, LAN_MULTICAST_GROUP, (err) => {
            if (err) {
                warn('Failed to send LAN announcement', err, 'lan');
            }
        });
        
        network('LAN announcement sent', undefined, { address: myAddress }, 'lan');
    }

    // Handle incoming LAN messages
    private handleLanMessage(msg: Buffer, rinfo: any): void {
        try {
            const message: LanDiscoveryMessage = JSON.parse(msg.toString());
            
            // Validate message
            if (!this.validateLanMessage(message, rinfo)) {
                return;
            }
            
            // TODO: Add rate limiting per IP to prevent DoS attacks
            // Consider using the global RateLimiter with LAN_DISCOVERY message type
            
            // Check if message is from ourselves
            if (message.revelnestId === getMyRevelNestId()) {
                return;
            }
            
            // Record peer
            this.discoveredPeers.set(message.revelnestId, {
                address: message.address,
                timestamp: Date.now()
            });
            
            // Add to contacts
            this.addDiscoveredPeer(message);
            
            // Respond to announcements
            if (message.type === 'LAN_DISCOVERY_ANNOUNCE') {
                this.sendResponse(message.revelnestId, message.address);
            }
            
        } catch (error) {
            warn('Failed to parse LAN message', error, 'lan');
        }
    }

    // Validate LAN message
    private validateLanMessage(message: LanDiscoveryMessage, rinfo: any): boolean {
        if (!message.revelnestId || !message.publicKey || !message.address || !message.timestamp || !message.signature) {
            return false;
        }
        
        // Check if message is recent (within 5 minutes)
        if (Date.now() - message.timestamp > 5 * 60 * 1000) {
            return false;
        }
        
        // Verify signature
        try {
            // Extract message data without signature for verification
            const { signature, ...messageData } = message;
            const messageBuffer = Buffer.from(canonicalStringify(messageData));
            const signatureBuffer = Buffer.from(signature, 'hex');
            const publicKeyBuffer = Buffer.from(message.publicKey, 'hex');
            
            const isValid = verify(messageBuffer, signatureBuffer, publicKeyBuffer);
            if (!isValid) {
                warn('Invalid LAN message signature', { revelnestId: message.revelnestId }, 'lan');
                return false;
            }
        } catch (error) {
            warn('Failed to verify LAN message signature', error, 'lan');
            return false;
        }
        
        return true;
    }

    // Send response to discovered peer
    private sendResponse(targetRevelnestId: string, targetAddress: string): void {
        if (!this.socket) return;
        
        const myAddress = getNetworkAddress();
        if (!myAddress) return;
        
        // Create response data without signature
        const responseData: Omit<LanDiscoveryMessage, 'signature'> = {
            type: 'LAN_DISCOVERY_RESPONSE' as const,
            revelnestId: getMyRevelNestId(),
            publicKey: getMyPublicKeyHex(),
            ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
            address: myAddress,
            timestamp: Date.now()
        };
        
        // Sign the response
        const signature = sign(Buffer.from(canonicalStringify(responseData))).toString('hex');
        
        // Add signature to final response
        const response: LanDiscoveryMessage = {
            ...responseData,
            signature
        };
        
        const buffer = Buffer.from(JSON.stringify(response));
        
        // Send directly to the peer
        this.socket.send(buffer, 0, buffer.length, LAN_DISCOVERY_PORT, targetAddress, (err) => {
            if (err) {
                warn('Failed to send LAN response', err, 'lan');
            }
        });
        
        network('LAN response sent', undefined, { target: targetRevelnestId }, 'lan');
    }

    // Add discovered peer to contacts
    private async addDiscoveredPeer(message: LanDiscoveryMessage): Promise<void> {
        try {
            await addOrUpdateContact(
                message.revelnestId,
                message.address,
                `LAN Peer ${message.revelnestId.slice(0, 4)}`,
                message.publicKey,
                'connected',
                message.ephemeralPublicKey
            );
            
            info('LAN peer discovered', { 
                revelnestId: message.revelnestId, 
                address: message.address 
            }, 'lan');
            
        } catch (error) {
            warn('Failed to add LAN peer to contacts', error, 'lan');
        }
    }

    // Cleanup old peers
    private cleanupOldPeers(): void {
        const now = Date.now();
        for (const [revelnestId, data] of this.discoveredPeers.entries()) {
            if (now - data.timestamp > LAN_DISCOVERY_TIMEOUT) {
                this.discoveredPeers.delete(revelnestId);
            }
        }
    }

    // Get discovered peers
    getDiscoveredPeers(): Array<{ revelnestId: string; address: string; timestamp: number }> {
        return Array.from(this.discoveredPeers.entries()).map(([revelnestId, data]) => ({
            revelnestId,
            address: data.address,
            timestamp: data.timestamp
        }));
    }

    // Check if running
    isActive(): boolean {
        return this.isRunning;
    }
}

// Singleton instance
let lanDiscoveryInstance: LanDiscovery | null = null;

export function getLanDiscovery(): LanDiscovery {
    if (!lanDiscoveryInstance) {
        lanDiscoveryInstance = new LanDiscovery();
    }
    return lanDiscoveryInstance;
}

export async function startLanDiscovery(): Promise<void> {
    const lanDiscovery = getLanDiscovery();
    await lanDiscovery.start();
}

export function stopLanDiscovery(): void {
    if (lanDiscoveryInstance) {
        lanDiscoveryInstance.stop();
        lanDiscoveryInstance = null;
    }
}