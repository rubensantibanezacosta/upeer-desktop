import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { RoutingTable } from './routing.js';
import { KademliaContact, SeedNode, SEED_NODES, BOOTSTRAP_MIN_NODES, BOOTSTRAP_RETRY_MS } from './types.js';
import { toKademliaId } from './types.js';
import { warn, info } from '../../../security/secure-logger.js';

type KademliaContactInput = {
    upeerId: string;
    address: string;
    publicKey: string;
    status?: string;
    dhtSeq?: number;
    dhtSignature?: string;
};

type SeedRecordMap = Record<string, string>;


const SEED_DNS_DOMAIN = 'dht-seeds.upeer.chat';
const LOCAL_SEEDS_FILE = 'seednodes.json';

export class BootstrapManager {
    private bootstrapped = false;
    private lastBootstrapAttempt = 0;
    private totalContacts = 0;
    private stats = {
        bootstrapAttempts: 0,
        bootstrapSuccesses: 0
    };

    constructor(
        private readonly routingTable: RoutingTable,
        private readonly sendMessage: (address: string, data: { type: string;[key: string]: unknown }) => void,
        private readonly getContacts?: () => KademliaContactInput[],
        private readonly userDataPath?: string
    ) { }

    private async loadSeedNodes(): Promise<SeedNode[]> {
        const seedNodes: SeedNode[] = [];
        const seenIds = new Set<string>();

        for (const seed of SEED_NODES) {
            if (!seenIds.has(seed.upeerId)) {
                seedNodes.push(seed);
                seenIds.add(seed.upeerId);
            }
        }

        try {
            const dnsSeeds = await this.loadSeedNodesFromDNS();
            for (const seed of dnsSeeds) {
                if (!seenIds.has(seed.upeerId)) {
                    seedNodes.push(seed);
                    seenIds.add(seed.upeerId);
                }
            }
        } catch (error) {
            warn('Failed to load seed nodes from DNS', error, 'kademlia-bootstrap');
        }

        try {
            const fileSeeds = await this.loadSeedNodesFromFile();
            for (const seed of fileSeeds) {
                if (!seenIds.has(seed.upeerId)) {
                    seedNodes.push(seed);
                    seenIds.add(seed.upeerId);
                }
            }
        } catch (error) {
            warn('Failed to load seed nodes from file', error, 'kademlia-bootstrap');
        }

        info(`Loaded ${seedNodes.length} seed nodes from ${seenIds.size} unique sources`, undefined, 'kademlia-bootstrap');
        return seedNodes;
    }

    private async loadSeedNodesFromDNS(): Promise<SeedNode[]> {
        const seedNodes: SeedNode[] = [];
        try {
            const records = await dns.promises.resolveTxt(SEED_DNS_DOMAIN);

            for (const record of records) {
                for (const entry of record) {
                    try {
                        const parts = entry.split(';');
                        const seed: SeedRecordMap = {};
                        for (const part of parts) {
                            const [key, value] = part.split('=');
                            if (key && value) {
                                seed[key] = value.trim();
                            }
                        }
                        if (seed.upeerId && seed.address && seed.publicKey) {
                            seedNodes.push({
                                upeerId: seed.upeerId,
                                address: seed.address,
                                publicKey: seed.publicKey
                            });
                        }
                    } catch (error) {
                        info('Skipping malformed DNS seed entry', undefined, 'kademlia-bootstrap');
                    }
                }
            }
        } catch (error) {
            info('DNS seed resolution skipped or failed', undefined, 'kademlia-bootstrap');
        }
        return seedNodes;
    }

    private async loadSeedNodesFromFile(): Promise<SeedNode[]> {
        if (!this.userDataPath) return [];

        const filePath = path.join(this.userDataPath, LOCAL_SEEDS_FILE);
        if (!fs.existsSync(filePath)) return [];

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);

            if (!Array.isArray(data)) return [];

            const seedNodes: SeedNode[] = [];
            for (const item of data) {
                if (item.upeerId && item.address && item.publicKey) {
                    seedNodes.push({
                        upeerId: item.upeerId,
                        address: item.address,
                        publicKey: item.publicKey
                    });
                }
            }
            return seedNodes;
        } catch (error) {
            warn('Error reading seed nodes from file', error, 'kademlia-bootstrap');
            return [];
        }
    }

    bootstrapFromContacts(): number {
        if (!this.getContacts) return 0;

        const contacts = this.getContacts();
        let bootstrappedCount = 0;
        for (const contact of contacts) {
            if (!contact.upeerId || !contact.publicKey || contact.status !== 'connected') {
                continue;
            }

            const kContact: KademliaContact = {
                nodeId: toKademliaId(contact.upeerId),
                upeerId: contact.upeerId,
                address: contact.address,
                publicKey: contact.publicKey,
                lastSeen: Date.now(),
                dhtSeq: contact.dhtSeq || undefined,
                dhtSignature: contact.dhtSignature || undefined
            };
            const added = this.routingTable.addContact(kContact);
            if (added) bootstrappedCount++;
        }

        this.totalContacts = this.routingTable.getContactCount();
        this.updateBootstrapStatus();

        info(`Bootstrapped with ${bootstrappedCount} contacts (out of ${contacts.length})`, undefined, 'kademlia-bootstrap');
        return bootstrappedCount;
    }

    async attemptBootstrapFromSeeds(): Promise<void> {
        const now = Date.now();
        if (now - this.lastBootstrapAttempt < BOOTSTRAP_RETRY_MS) {
            return;
        }

        this.lastBootstrapAttempt = now;
        this.stats.bootstrapAttempts++;

        const seedNodes = await this.loadSeedNodes();
        info(`Attempting bootstrap from ${seedNodes.length} seed nodes`, undefined, 'kademlia-bootstrap');

        for (const seed of seedNodes) {
            const kContact: KademliaContact = {
                nodeId: toKademliaId(seed.upeerId),
                upeerId: seed.upeerId,
                address: seed.address,
                publicKey: seed.publicKey,
                lastSeen: Date.now()
            };
            this.routingTable.addContact(kContact);

            try {
                this.sendMessage(seed.address, {
                    type: 'DHT_PING',
                    timestamp: now
                });
            } catch (error) {
                warn(`Failed to ping seed node ${seed.upeerId}`, error, 'kademlia-bootstrap');
            }
        }

        this.updateBootstrapStatus();

        if (this.bootstrapped) {
            info(`Bootstrap successful with ${this.totalContacts} contacts`, undefined, 'kademlia-bootstrap');
        }
    }

    updateBootstrapStatus(): void {
        const wasBootstrapped = this.bootstrapped;
        this.totalContacts = this.routingTable.getContactCount();
        this.bootstrapped = this.totalContacts >= BOOTSTRAP_MIN_NODES;

        if (wasBootstrapped && !this.bootstrapped) {
            warn(`Lost bootstrap status (${this.totalContacts} contacts)`, undefined, 'kademlia-bootstrap');
        } else if (!wasBootstrapped && this.bootstrapped) {
            info(`Gained bootstrap status (${this.totalContacts} contacts)`, undefined, 'kademlia-bootstrap');
            this.stats.bootstrapSuccesses++;
        }
    }

    async retryBootstrap(): Promise<void> {
        this.lastBootstrapAttempt = 0;
        await this.attemptBootstrapFromSeeds();
    }

    isBootstrapped(): boolean {
        return this.bootstrapped;
    }

    getContactCount(): number {
        return this.totalContacts;
    }

    getStats() {
        return { ...this.stats };
    }

    getTimeSinceLastAttempt(): number {
        return Date.now() - this.lastBootstrapAttempt;
    }
}