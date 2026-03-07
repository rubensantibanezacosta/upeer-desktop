import { ReputationScore, SocialInteraction, TrustGraph, ReputationConfig } from './types.js';
import { info, warn } from '../secure-logger.js';

// Default reputation configuration
const DEFAULT_CONFIG: ReputationConfig = {
    weights: {
        message: 0.1,
        reaction: 0.05,
        contact_request: 0.2,
        contact_accept: 0.3,
        dht_query: 0.05,
        dht_response: 0.1
    },
    decayFactor: 0.95, // 5% decay per time period
    minInteractions: 5,
    maxInteractionAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    maxDepth: 3,
    sybilThreshold: 0.3,
    sybilMinConnections: 3
};

// Social reputation system based on trust graph
export class TrustGraphReputation {
    private graph: TrustGraph;
    private config: ReputationConfig;
    
    constructor(config?: Partial<ReputationConfig>) {
        this.graph = {
            nodes: new Map(),
            edges: new Map()
        };
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    
    // Add or update a node in the graph
    addNode(revelnestId: string, initialScore: number = 0.5): void {
        if (!this.graph.nodes.has(revelnestId)) {
            this.graph.nodes.set(revelnestId, {
                revelnestId,
                score: initialScore,
                confidence: 0.0,
                lastUpdated: Date.now(),
                interactions: 0,
                positiveInteractions: 0,
                negativeInteractions: 0
            });
        }
    }
    
    // Record a social interaction
    recordInteraction(interaction: SocialInteraction): void {
        const { from, to, type, positive, weight, timestamp } = interaction;
        
        // Ensure nodes exist
        this.addNode(from);
        this.addNode(to);
        
        // Add interaction to edges
        const edgeKey = `${from}-${to}`;
        if (!this.graph.edges.has(edgeKey)) {
            this.graph.edges.set(edgeKey, []);
        }
        this.graph.edges.get(edgeKey)!.push(interaction);
        
        // Update node statistics
        this.updateNodeStats(from, to, positive, weight);
        
        // Clean up old interactions
        this.cleanupOldInteractions();
        
        info('Interaction recorded', { from, to, type, positive }, 'reputation');
    }
    
    // Update node statistics based on interaction
    private updateNodeStats(from: string, to: string, positive: boolean, weight: number): void {
        const fromNode = this.graph.nodes.get(from)!;
        const toNode = this.graph.nodes.get(to)!;
        
        // Update interaction counts
        fromNode.interactions++;
        toNode.interactions++;
        
        if (positive) {
            fromNode.positiveInteractions++;
            toNode.positiveInteractions++;
        } else {
            fromNode.negativeInteractions++;
            toNode.negativeInteractions++;
        }
        
        // Update scores with weighted adjustment
        const adjustment = weight * (positive ? 0.1 : -0.1);
        fromNode.score = Math.max(0.0, Math.min(1.0, fromNode.score + adjustment));
        toNode.score = Math.max(0.0, Math.min(1.0, toNode.score + adjustment));
        
        // Update confidence based on number of interactions
        const maxInteractions = Math.max(fromNode.interactions, toNode.interactions);
        fromNode.confidence = Math.min(1.0, maxInteractions / this.config.minInteractions);
        toNode.confidence = Math.min(1.0, maxInteractions / this.config.minInteractions);
        
        fromNode.lastUpdated = Date.now();
        toNode.lastUpdated = Date.now();
    }
    
    // Calculate reputation score for a node
    calculateReputation(revelnestId: string): ReputationScore | null {
        const node = this.graph.nodes.get(revelnestId);
        if (!node) return null;
        
        // Apply time decay
        const timeSinceUpdate = Date.now() - node.lastUpdated;
        const decayPeriod = 7 * 24 * 60 * 60 * 1000; // 1 week
        const decay = Math.pow(this.config.decayFactor, timeSinceUpdate / decayPeriod);
        
        const decayedScore = {
            ...node,
            score: node.score * decay,
            confidence: node.confidence * decay
        };
        
        // If we have enough data, calculate graph-based reputation
        if (node.interactions >= this.config.minInteractions) {
            const graphScore = this.calculateGraphReputation(revelnestId);
            if (graphScore !== null) {
                // Combine direct and graph-based reputation
                const combinedScore = (decayedScore.score * 0.7) + (graphScore * 0.3);
                return {
                    ...decayedScore,
                    score: combinedScore
                };
            }
        }
        
        return decayedScore;
    }
    
    // Calculate reputation based on graph connections
    private calculateGraphReputation(revelnestId: string): number | null {
        const visited = new Set<string>();
        const queue: Array<{ node: string; depth: number; trust: number }> = [];
        let totalTrust = 0;
        let count = 0;
        
        queue.push({ node: revelnestId, depth: 0, trust: 1.0 });
        
        while (queue.length > 0) {
            const { node, depth, trust } = queue.shift()!;
            
            if (visited.has(node) || depth > this.config.maxDepth) {
                continue;
            }
            
            visited.add(node);
            
            // Get direct reputation of this node
            const nodeScore = this.graph.nodes.get(node);
            if (nodeScore && nodeScore.confidence > 0.5) {
                totalTrust += nodeScore.score * trust;
                count++;
            }
            
            // Explore connections
            for (const [edgeKey, interactions] of Array.from(this.graph.edges.entries())) {
                const [from, to] = edgeKey.split('-');
                
                if (from === node && !visited.has(to)) {
                    // Calculate trust in this connection
                    const connectionTrust = this.calculateConnectionTrust(interactions);
                    queue.push({
                        node: to,
                        depth: depth + 1,
                        trust: trust * connectionTrust
                    });
                }
            }
        }
        
        if (count === 0) return null;
        return totalTrust / count;
    }
    
    // Calculate trust in a connection based on interactions
    private calculateConnectionTrust(interactions: SocialInteraction[]): number {
        if (interactions.length === 0) return 0.0;
        
        let totalWeight = 0;
        let positiveWeight = 0;
        
        for (const interaction of interactions) {
            const weight = interaction.weight * this.config.weights[interaction.type];
            totalWeight += weight;
            if (interaction.positive) {
                positiveWeight += weight;
            }
        }
        
        if (totalWeight === 0) return 0.0;
        return positiveWeight / totalWeight;
    }
    
    // Clean up old interactions
    private cleanupOldInteractions(): void {
        const cutoff = Date.now() - this.config.maxInteractionAge;
        
        for (const [edgeKey, interactions] of Array.from(this.graph.edges.entries())) {
            const filtered = interactions.filter(i => i.timestamp >= cutoff);
            if (filtered.length === 0) {
                this.graph.edges.delete(edgeKey);
            } else {
                this.graph.edges.set(edgeKey, filtered);
            }
        }
        
        // Remove nodes with no recent interactions
        for (const [revelnestId, node] of Array.from(this.graph.nodes.entries())) {
            if (node.lastUpdated < cutoff && node.interactions === 0) {
                this.graph.nodes.delete(revelnestId);
            }
        }
    }
    
    // Detect potential Sybil attacks
    detectSybilClusters(): string[][] {
        const clusters: string[][] = [];
        const visited = new Set<string>();
        
        for (const [revelnestId, node] of Array.from(this.graph.nodes.entries())) {
            if (visited.has(revelnestId)) continue;
            
            if (node.confidence < this.config.sybilThreshold && 
                node.interactions < this.config.sybilMinConnections) {
                
                // This might be a Sybil node, explore its cluster
                const cluster = this.exploreCluster(revelnestId);
                if (cluster.length > 1) { // Only report clusters of 2+ nodes
                    clusters.push(cluster);
                    cluster.forEach(id => visited.add(id));
                }
            }
        }
        
        return clusters;
    }
    
    // Explore a cluster of potentially Sybil nodes
    private exploreCluster(startNode: string): string[] {
        const cluster: string[] = [];
        const stack = [startNode];
        const visited = new Set<string>();
        
        while (stack.length > 0) {
            const node = stack.pop()!;
            if (visited.has(node)) continue;
            
            visited.add(node);
            const nodeData = this.graph.nodes.get(node);
            
            if (nodeData && 
                nodeData.confidence < this.config.sybilThreshold && 
                nodeData.interactions < this.config.sybilMinConnections) {
                
                cluster.push(node);
                
                // Explore connections
                for (const edgeKey of Array.from(this.graph.edges.keys())) {
                    const [from, to] = edgeKey.split('-');
                    if (from === node && !visited.has(to)) {
                        stack.push(to);
                    }
                    if (to === node && !visited.has(from)) {
                        stack.push(from);
                    }
                }
            }
        }
        
        return cluster;
    }
    
    // Get all reputation scores
    getAllScores(): ReputationScore[] {
        const scores: ReputationScore[] = [];
        for (const node of Array.from(this.graph.nodes.values())) {
            const score = this.calculateReputation(node.revelnestId);
            if (score) {
                scores.push(score);
            }
        }
        return scores;
    }
    
    // Get statistics about the reputation system
    getStats() {
        return {
            totalNodes: this.graph.nodes.size,
            totalEdges: this.graph.edges.size,
            totalInteractions: Array.from(this.graph.edges.values())
                .reduce((sum, interactions) => sum + interactions.length, 0),
            averageScore: this.getAllScores()
                .reduce((sum, score) => sum + score.score, 0) / this.graph.nodes.size || 0
        };
    }
}