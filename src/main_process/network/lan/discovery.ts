import dgram from 'node:dgram';
import { getMyUPeerId, getMyPublicKeyHex, getMyEphemeralPublicKeyHex, sign, verify, getUPeerIdFromPublicKey } from '../../security/identity.js';
import { getNetworkAddresses, canonicalStringify, generateSignedLocationBlock, getDeviceMetadata } from '../utils.js';
import { getMyDhtSeq } from '../../security/identity.js';
import { addOrUpdateContact } from '../../storage/contacts/operations.js';
import { isContactBlocked } from '../../storage/contacts/operations.js';
import { network, info, warn } from '../../security/secure-logger.js';
import { RateLimiter } from '../../security/rate-limiter.js';

// LAN discovery constants
const LAN_DISCOVERY_PORT = 50006;
const LAN_MULTICAST_GROUP = 'ff02::1'; // IPv6 link-local all-nodes multicast
const LAN_BROADCAST_INTERVAL = 30000; // 30 seconds
const LAN_DISCOVERY_TIMEOUT = 60000; // 60 seconds

// LAN discovery message types
export interface LanDiscoveryMessage {
    type: 'LAN_DISCOVERY_ANNOUNCE' | 'LAN_DISCOVERY_RESPONSE';
    upeerId: string;
    publicKey: string;
    ephemeralPublicKey?: string;
    address: string;
    timestamp: number;
    signature: string;
}

// Yggdrasil 200::/7 range: first segment starts with 2xx or 3xx in hex (not fe80:: link-local)
const YGG_REGEX = /^[23][0-9a-f]{2}:/i;

export class LanDiscovery {
    private socket: dgram.Socket | null = null;
    private discoveryInterval: NodeJS.Timeout | null = null;
    private discoveredPeers = new Map<string, { address: string; timestamp: number }>();
    private isRunning = false;
    // BUG CU fix: rate-limiter por IP de origen para bloquear floods de multicast.
    // Límite conservador: 10 anuncios/min por IP (el propio nodo anuncia cada 30 s).
    private lanRateLimiter = new RateLimiter({
        'LAN_DISCOVERY': { windowMs: 60000, maxTokens: 10, refillRate: 10 / 60 },
    });

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
                const s = this.socket;
                if (!s) return reject(new Error('Socket not initialized'));

                s.bind(LAN_DISCOVERY_PORT, '::', () => {
                    // Join multicast group for IPv6
                    try {
                        s.addMembership(LAN_MULTICAST_GROUP);
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

        const myAddresses = getNetworkAddresses();
        if (myAddresses.length === 0) return;

        // Guard: no intentar firmar si la identidad no está lista
        let upeerId: string;
        let publicKey: string;
        let ephemeralPublicKey: string;
        try {
            upeerId = getMyUPeerId();
            publicKey = getMyPublicKeyHex();
            ephemeralPublicKey = getMyEphemeralPublicKeyHex();
            if (!upeerId || !publicKey) return;
        } catch {
            return;
        }

        const dhtSeq = getMyDhtSeq();
        const deviceMeta = getDeviceMetadata();
        // Generar un bloque firmado DETERMINISTA que incluya todas las IPs
        const locBlock = generateSignedLocationBlock(myAddresses, dhtSeq, undefined, undefined, deviceMeta);

        const messageData = {
            type: 'LAN_DISCOVERY_ANNOUNCE' as const,
            upeerId,
            publicKey,
            ephemeralPublicKey,
            address: locBlock.address, // Primaria (compatible)
            addresses: locBlock.addresses, // Lista completa
            timestamp: Date.now()
        };

        // Sign the message
        const signature = sign(Buffer.from(canonicalStringify(messageData))).toString('hex');

        // Add signature to final message
        const message = {
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

        network('LAN announcement sent (multi-channel)', undefined, { addresses: myAddresses }, 'lan');
    }

    // Handle incoming LAN messages
    private handleLanMessage(msg: Buffer, rinfo: any): void {
        try {
            // BUG CU fix: rate-limit por IP de origen ANTES de parsear/verificar criptografía.
            // Sin esto, un atacante en la LAN puede inundar el socket multicast generando
            // keypairs masivamente y saturar la DB de contactos y el Map discoveredPeers.
            if (!this.lanRateLimiter.check(rinfo.address, 'LAN_DISCOVERY')) {
                warn('LAN discovery rate limit exceeded', { sourceIp: rinfo.address }, 'lan');
                return;
            }

            const message: LanDiscoveryMessage = JSON.parse(msg.toString());

            // Validate message
            if (!this.validateLanMessage(message, rinfo)) {
                return;
            }

            // Check if message is from ourselves
            if (message.upeerId === getMyUPeerId()) {
                return;
            }

            // Record peer
            this.discoveredPeers.set(message.upeerId, {
                address: message.address,
                timestamp: Date.now()
            });

            // Add to contacts
            this.addDiscoveredPeer(message);

            // Respond to announcements
            if (message.type === 'LAN_DISCOVERY_ANNOUNCE') {
                this.sendResponse(message.upeerId, message.address);
            }

        } catch (error) {
            warn('Failed to parse LAN message', error, 'lan');
        }
    }

    // Validate LAN message
    private validateLanMessage(message: LanDiscoveryMessage, _rinfo: any): boolean {
        if (!message.upeerId || !message.publicKey || !message.address || !message.timestamp || !message.signature) {
            return false;
        }

        // BUG CV fix: rechazar timestamps futuros (> 5 min adelante) además de los muy antiguos.
        // La condición original sólo comprobaba Date.now() - ts > 5min, que es negativa para
        // timestamps futuros → pasan como válidos.
        const now = Date.now();
        const tsDelta = now - message.timestamp;
        if (tsDelta > 5 * 60 * 1000 || tsDelta < -(5 * 60 * 1000)) {
            return false;
        }

        // BUG CT fix parte 1: validar formato de publicKey (64 hex = 32 bytes Ed25519)
        // antes de pasarlo a libsodium; evita que la verificación falle con error opaco.
        if (typeof message.publicKey !== 'string' || !/^[0-9a-f]{64}$/i.test(message.publicKey)) {
            warn('LAN message: invalid publicKey format', {}, 'lan');
            return false;
        }

        // BUG FT fix: ephemeralPublicKey opcional no se validaba → un peer en LAN con clave
        // legítima podía firmar un paquete con ephemeralPublicKey='garbage' (o un string de
        // 30 KB) que pasaba la verificación de firma y quedaba almacenado en la DB.
        // Consecuencia: las operaciones X3DH posteriores con ese contacto fallaban
        // (DoS dirigido a un contacto concreto) porque Buffer.from(key, 'hex') produce
        // un buffer de longitud incorrecta que libsodium rechaza.
        if (message.ephemeralPublicKey !== undefined &&
            (typeof message.ephemeralPublicKey !== 'string' || !/^[0-9a-f]{64}$/i.test(message.ephemeralPublicKey))) {
            warn('LAN message: invalid ephemeralPublicKey format', {}, 'lan');
            return false;
        }

        // BUG CT fix parte 2: validar que message.address es una dirección Yggdrasil válida
        // (rango 200::/7, 8 segmentos). Sin esto, un peer con clave legítima puede firmar un
        // paquete con address='127.0.0.1' o cualquier IP y la firma pasaría; esa dirección
        // quedaría almacenada en contactos y redigiría conexiones futuras a localhost.
        const addrSegments = message.address.split(':');
        if (!YGG_REGEX.test(message.address) || addrSegments.length !== 8) {
            warn('LAN message: address is not a valid Yggdrasil IPv6 address', { address: message.address }, 'lan');
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
                warn('Invalid LAN message signature', { upeerId: message.upeerId }, 'lan');
                return false;
            }

            // BUG AQ fix: verificar que upeerId realmente deriva de publicKey.
            // Sin esta comprobación, un peer puede firmar con su propia clave pero
            // reclamar el upeerId de otra persona → suplantación de identidad en LAN.
            const derivedId = getUPeerIdFromPublicKey(publicKeyBuffer);
            if (derivedId !== message.upeerId) {
                warn('LAN message: upeerId does not match publicKey (identity spoofing attempt)', { claimed: message.upeerId }, 'lan');
                return false;
            }
        } catch (error) {
            warn('Failed to verify LAN message signature', error, 'lan');
            return false;
        }

        return true;
    }

    // Send response to discovered peer
    private sendResponse(targetUpeerId: string, targetAddress: string): void {
        if (!this.socket) return;

        const myAddresses = getNetworkAddresses();
        if (myAddresses.length === 0) return;

        // Create response data without signature
        const responseData = {
            type: 'LAN_DISCOVERY_RESPONSE' as const,
            upeerId: getMyUPeerId(),
            publicKey: getMyPublicKeyHex(),
            ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
            address: myAddresses[0],
            addresses: myAddresses,
            timestamp: Date.now()
        };

        // Sign the response
        const signature = sign(Buffer.from(canonicalStringify(responseData))).toString('hex');

        // Add signature to final response
        const response = {
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

        network('LAN response sent (multi-channel)', undefined, { target: targetUpeerId }, 'lan');
    }

    // Add discovered peer to contacts
    private async addDiscoveredPeer(message: LanDiscoveryMessage): Promise<void> {
        try {
            // BUG AR fix: verificar que el peer no está bloqueado antes de añadirlo.
            // Sin esta comprobación, contactos bloqueados podían reaparecer como 'connected'
            // mediante anuncios LAN multicast, saltándose el bloqueo.
            if (isContactBlocked(message.upeerId)) {
                warn('LAN: ignoring announcement from blocked contact', { upeerId: message.upeerId }, 'lan');
                return;
            }

            await addOrUpdateContact(
                message.upeerId,
                message.address,
                `LAN Peer ${message.upeerId.slice(0, 4)}`,
                message.publicKey,
                'connected',
                message.ephemeralPublicKey
            );

            info('LAN peer discovered', {
                upeerId: message.upeerId,
                address: message.address
            }, 'lan');

        } catch (error) {
            warn('Failed to add LAN peer to contacts', error, 'lan');
        }
    }

    // Cleanup old peers
    private cleanupOldPeers(): void {
        const now = Date.now();
        for (const [upeerId, data] of this.discoveredPeers.entries()) {
            if (now - data.timestamp > LAN_DISCOVERY_TIMEOUT) {
                this.discoveredPeers.delete(upeerId);
            }
        }
    }

    // Get discovered peers
    getDiscoveredPeers(): Array<{ upeerId: string; address: string; timestamp: number }> {
        return Array.from(this.discoveredPeers.entries()).map(([upeerId, data]) => ({
            upeerId,
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