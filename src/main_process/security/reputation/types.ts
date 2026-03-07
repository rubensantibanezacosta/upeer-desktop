// Types for social reputation system

export interface ReputationScore {
    revelnestId: string;
    score: number; // 0.0 to 1.0
    confidence: number; // 0.0 to 1.0 (how confident we are in this score)
    lastUpdated: number;
    interactions: number;
    positiveInteractions: number;
    negativeInteractions: number;
}

export interface SocialInteraction {
    type: 'message' | 'reaction' | 'contact_request' | 'contact_accept' | 'dht_query' | 'dht_response';
    from: string;
    to: string;
    timestamp: number;
    weight: number; // 0.0 to 1.0 (importance of this interaction)
    positive: boolean; // Whether this was a positive interaction
    metadata?: Record<string, any>;
}

export interface TrustGraph {
    nodes: Map<string, ReputationScore>;
    edges: Map<string, SocialInteraction[]>; // key: "from-to"
}

export interface ReputationConfig {
    // Weight factors for different interaction types
    weights: {
        message: number;
        reaction: number;
        contact_request: number;
        contact_accept: number;
        dht_query: number;
        dht_response: number;
    };
    
    // Decay factor (how quickly reputation decays over time)
    decayFactor: number;
    
    // Minimum interactions for confidence
    minInteractions: number;
    
    // Maximum age for interactions (in milliseconds)
    maxInteractionAge: number;
    
    // Graph traversal depth for reputation propagation
    maxDepth: number;
    
    // Sybil resistance thresholds
    sybilThreshold: number;
    sybilMinConnections: number;
}