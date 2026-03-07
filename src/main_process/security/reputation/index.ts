// Import types
import { TrustGraphReputation } from './trust-graph.js';
import type { 
    ReputationScore, 
    SocialInteraction, 
    TrustGraph, 
    ReputationConfig 
} from './types.js';

// Re-export for external use
export { TrustGraphReputation };
export type { 
    ReputationScore, 
    SocialInteraction, 
    TrustGraph, 
    ReputationConfig 
};

// Default reputation system instance
let reputationSystem: TrustGraphReputation | null = null;

export function initReputationSystem(config?: Partial<ReputationConfig>): TrustGraphReputation {
    if (!reputationSystem) {
        reputationSystem = new TrustGraphReputation(config);
    }
    return reputationSystem;
}

export function getReputationSystem(): TrustGraphReputation | null {
    return reputationSystem;
}

// Helper functions for common reputation operations

export function recordMessageInteraction(from: string, to: string, positive: boolean = true): void {
    const system = getReputationSystem();
    if (!system) return;
    
    system.recordInteraction({
        type: 'message',
        from,
        to,
        timestamp: Date.now(),
        weight: 1.0,
        positive,
        metadata: { interactionType: 'message' }
    });
}

export function recordReactionInteraction(from: string, to: string, positive: boolean = true): void {
    const system = getReputationSystem();
    if (!system) return;
    
    system.recordInteraction({
        type: 'reaction',
        from,
        to,
        timestamp: Date.now(),
        weight: 0.5,
        positive,
        metadata: { interactionType: 'reaction' }
    });
}

export function recordContactRequest(from: string, to: string, accepted: boolean): void {
    const system = getReputationSystem();
    if (!system) return;
    
    system.recordInteraction({
        type: accepted ? 'contact_accept' : 'contact_request',
        from,
        to,
        timestamp: Date.now(),
        weight: accepted ? 1.0 : 0.3,
        positive: accepted,
        metadata: { accepted }
    });
}

export function recordDhtInteraction(from: string, to: string, type: 'query' | 'response', helpful: boolean): void {
    const system = getReputationSystem();
    if (!system) return;
    
    system.recordInteraction({
        type: type === 'query' ? 'dht_query' : 'dht_response',
        from,
        to,
        timestamp: Date.now(),
        weight: 0.2,
        positive: helpful,
        metadata: { helpful }
    });
}

export function getReputationScore(revelnestId: string): number {
    const system = getReputationSystem();
    if (!system) return 0.5; // Default neutral score
    
    const score = system.calculateReputation(revelnestId);
    return score?.score || 0.5;
}

export function checkSybilRisk(revelnestId: string): boolean {
    const system = getReputationSystem();
    if (!system) return false;
    
    const clusters = system.detectSybilClusters();
    return clusters.some(cluster => cluster.includes(revelnestId));
}

export function getReputationStats() {
    const system = getReputationSystem();
    if (!system) return null;
    
    return system.getStats();
}