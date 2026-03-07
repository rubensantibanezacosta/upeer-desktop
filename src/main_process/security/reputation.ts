import { info, warn } from './secure-logger.js';

// Social reputation system for Sybil resistance
export class SocialReputation {
    private readonly graph: Map<string, Set<string>> = new Map(); // Adjacency list
    private readonly trustScores: Map<string, number> = new Map(); // Trust scores 0-100
    private readonly activityLogs: Map<string, ActivityLog[]> = new Map(); // Activity history
    
    constructor() {
        info('Social reputation system initialized', {}, 'reputation');
    }
    
    // Add a connection between two nodes
    addConnection(nodeA: string, nodeB: string): void {
        // Add connection A -> B
        if (!this.graph.has(nodeA)) {
            this.graph.set(nodeA, new Set());
        }
        this.graph.get(nodeA)!.add(nodeB);
        
        // Add connection B -> A (undirected graph)
        if (!this.graph.has(nodeB)) {
            this.graph.set(nodeB, new Set());
        }
        this.graph.get(nodeB)!.add(nodeA);
        
        // Initialize trust scores if not present
        if (!this.trustScores.has(nodeA)) {
            this.trustScores.set(nodeA, 50); // Default trust score
        }
        if (!this.trustScores.has(nodeB)) {
            this.trustScores.set(nodeB, 50); // Default trust score
        }
        
        info('Connection added', { nodeA, nodeB }, 'reputation');
    }
    
    // Remove a connection
    removeConnection(nodeA: string, nodeB: string): void {
        if (this.graph.has(nodeA)) {
            this.graph.get(nodeA)!.delete(nodeB);
        }
        if (this.graph.has(nodeB)) {
            this.graph.get(nodeB)!.delete(nodeA);
        }
        
        info('Connection removed', { nodeA, nodeB }, 'reputation');
    }
    
    // Log activity for a node
    logActivity(nodeId: string, activityType: ActivityType, details?: any): void {
        if (!this.activityLogs.has(nodeId)) {
            this.activityLogs.set(nodeId, []);
        }
        
        const activity: ActivityLog = {
            timestamp: Date.now(),
            type: activityType,
            details
        };
        
        this.activityLogs.get(nodeId)!.push(activity);
        
        // Keep only last 1000 activities per node
        if (this.activityLogs.get(nodeId)!.length > 1000) {
            this.activityLogs.set(nodeId, this.activityLogs.get(nodeId)!.slice(-1000));
        }
        
        // Update trust score based on activity
        this.updateTrustScore(nodeId, activityType);
    }
    
    // Update trust score based on activity
    private updateTrustScore(nodeId: string, activityType: ActivityType): void {
        const currentScore = this.trustScores.get(nodeId) || 50;
        let newScore = currentScore;
        
        switch (activityType) {
            case ActivityType.MESSAGE_SENT:
                newScore += 0.1; // Small positive for sending messages
                break;
            case ActivityType.MESSAGE_RECEIVED:
                newScore += 0.05; // Smaller positive for receiving
                break;
            case ActivityType.HANDSHAKE_COMPLETED:
                newScore += 1.0; // Positive for successful handshakes
                break;
            case ActivityType.DHT_UPDATE:
                newScore += 0.2; // Positive for DHT updates
                break;
            case ActivityType.SPAM_DETECTED:
                newScore -= 5.0; // Large negative for spam
                break;
            case ActivityType.MALICIOUS_ACTIVITY:
                newScore -= 10.0; // Very large negative for malicious activity
                break;
            case ActivityType.INACTIVE_PERIOD:
                newScore -= 0.01; // Small negative for inactivity
                break;
        }
        
        // Clamp score between 0 and 100
        newScore = Math.max(0, Math.min(100, newScore));
        
        this.trustScores.set(nodeId, newScore);
        
        info('Trust score updated', { nodeId, oldScore: currentScore, newScore }, 'reputation');
    }
    
    // Calculate reputation score using social graph analysis
    calculateReputation(nodeId: string): ReputationScore {
        const trustScore = this.trustScores.get(nodeId) || 50;
        const connections = this.graph.get(nodeId) || new Set();
        
        // Calculate network centrality
        const centrality = this.calculateCentrality(nodeId);
        
        // Calculate activity score
        const activityScore = this.calculateActivityScore(nodeId);
        
        // Calculate weighted reputation
        const reputation = {
            trustScore,
            centrality,
            activityScore,
            connectionCount: connections.size,
            weightedScore: this.calculateWeightedScore(trustScore, centrality, activityScore)
        };
        
        return reputation;
    }
    
    // Calculate network centrality (betweenness approximation)
    private calculateCentrality(nodeId: string): number {
        const connections = this.graph.get(nodeId);
        if (!connections || connections.size === 0) return 0;
        
        // Simple centrality: connections to well-connected nodes
        let centrality = 0;
        for (const neighbor of connections) {
            const neighborConnections = this.graph.get(neighbor);
            if (neighborConnections) {
                centrality += neighborConnections.size;
            }
        }
        
        // Normalize to 0-100 range
        return Math.min(100, centrality);
    }
    
    // Calculate activity score based on recent activity
    private calculateActivityScore(nodeId: string): number {
        const activities = this.activityLogs.get(nodeId);
        if (!activities || activities.length === 0) return 0;
        
        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
        
        let recentActivity = 0;
        let weeklyActivity = 0;
        
        for (const activity of activities) {
            if (activity.timestamp >= oneDayAgo) {
                recentActivity++;
            }
            if (activity.timestamp >= oneWeekAgo) {
                weeklyActivity++;
            }
        }
        
        // Score based on activity frequency
        const dailyScore = Math.min(100, recentActivity * 10);
        const weeklyScore = Math.min(100, weeklyActivity * 2);
        
        return (dailyScore * 0.7) + (weeklyScore * 0.3);
    }
    
    // Calculate weighted reputation score
    private calculateWeightedScore(trustScore: number, centrality: number, activityScore: number): number {
        // Weight factors (sum to 1.0)
        const trustWeight = 0.5;
        const centralityWeight = 0.2;
        const activityWeight = 0.3;
        
        return (trustScore * trustWeight) + 
               (centrality * centralityWeight) + 
               (activityScore * activityWeight);
    }
    
    // Check if a node is likely Sybil
    isLikelySybil(nodeId: string): boolean {
        const reputation = this.calculateReputation(nodeId);
        
        // Sybil detection heuristics
        const isSybil = (
            reputation.connectionCount < 3 || // Few connections
            reputation.activityScore < 10 ||   // Low activity
            reputation.trustScore < 20 ||      // Low trust
            reputation.weightedScore < 30      // Overall low reputation
        );
        
        if (isSybil) {
            warn('Potential Sybil node detected', { nodeId, reputation }, 'reputation');
        }
        
        return isSybil;
    }
    
    // Get recommendations for new connections
    getConnectionRecommendations(nodeId: string, limit: number = 5): string[] {
        const recommendations: Array<{ node: string; score: number }> = [];
        const existingConnections = this.graph.get(nodeId) || new Set();
        
        // Get friends of friends
        for (const friend of existingConnections) {
            const friendsFriends = this.graph.get(friend);
            if (friendsFriends) {
                for (const friendOfFriend of friendsFriends) {
                    // Skip self and existing connections
                    if (friendOfFriend === nodeId || existingConnections.has(friendOfFriend)) {
                        continue;
                    }
                    
                    // Calculate recommendation score
                    const reputation = this.calculateReputation(friendOfFriend);
                    const score = reputation.weightedScore;
                    
                    recommendations.push({ node: friendOfFriend, score });
                }
            }
        }
        
        // Sort by score and return top recommendations
        return recommendations
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(r => r.node);
    }
    
    // Export reputation data (for backup/analysis)
    exportData(): ReputationData {
        return {
            graph: Array.from(this.graph.entries()).map(([node, connections]) => ({
                node,
                connections: Array.from(connections)
            })),
            trustScores: Array.from(this.trustScores.entries()),
            nodeCount: this.graph.size
        };
    }
    
    // Import reputation data
    importData(data: ReputationData): void {
        // Clear existing data
        this.graph.clear();
        this.trustScores.clear();
        
        // Import graph
        for (const nodeData of data.graph) {
            this.graph.set(nodeData.node, new Set(nodeData.connections));
        }
        
        // Import trust scores
        for (const [node, score] of data.trustScores) {
            this.trustScores.set(node, score);
        }
        
        info('Reputation data imported', { nodeCount: data.nodeCount }, 'reputation');
    }
    
    // Get statistics
    getStats(): ReputationStats {
        const nodes = Array.from(this.graph.keys());
        const scores = nodes.map(node => this.trustScores.get(node) || 50);
        
        return {
            totalNodes: nodes.length,
            averageTrustScore: scores.reduce((a, b) => a + b, 0) / scores.length,
            minTrustScore: Math.min(...scores),
            maxTrustScore: Math.max(...scores),
            totalConnections: Array.from(this.graph.values())
                .reduce((total, connections) => total + connections.size, 0)
        };
    }
}

// Activity types
export enum ActivityType {
    MESSAGE_SENT = 'MESSAGE_SENT',
    MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
    HANDSHAKE_COMPLETED = 'HANDSHAKE_COMPLETED',
    DHT_UPDATE = 'DHT_UPDATE',
    SPAM_DETECTED = 'SPAM_DETECTED',
    MALICIOUS_ACTIVITY = 'MALICIOUS_ACTIVITY',
    INACTIVE_PERIOD = 'INACTIVE_PERIOD'
}

// Activity log interface
export interface ActivityLog {
    timestamp: number;
    type: ActivityType;
    details?: any;
}

// Reputation score interface
export interface ReputationScore {
    trustScore: number;
    centrality: number;
    activityScore: number;
    connectionCount: number;
    weightedScore: number;
}

// Reputation data for export/import
export interface ReputationData {
    graph: Array<{ node: string; connections: string[] }>;
    trustScores: Array<[string, number]>;
    nodeCount: number;
}

// Reputation statistics
export interface ReputationStats {
    totalNodes: number;
    averageTrustScore: number;
    minTrustScore: number;
    maxTrustScore: number;
    totalConnections: number;
}

// Singleton instance
let reputationInstance: SocialReputation | null = null;

export function getReputationSystem(): SocialReputation {
    if (!reputationInstance) {
        reputationInstance = new SocialReputation();
    }
    return reputationInstance;
}

export function initReputationSystem(): void {
    reputationInstance = new SocialReputation();
}

export function resetReputationSystem(): void {
    reputationInstance = null;
}