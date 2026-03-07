import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { SocialReputation, ActivityType, ReputationData } from '../src/main_process/security/reputation.js';

describe('Social Reputation System', () => {
    let reputation: SocialReputation;
    
    beforeEach(() => {
        reputation = new SocialReputation();
    });
    
    it('should initialize with empty graph', () => {
        const stats = reputation.getStats();
        assert.strictEqual(stats.totalNodes, 0);
        assert.strictEqual(stats.totalConnections, 0);
        assert.ok(Number.isNaN(stats.averageTrustScore) || stats.averageTrustScore === 0);
    });
    
    it('should add and track connections', () => {
        reputation.addConnection('nodeA', 'nodeB');
        reputation.addConnection('nodeA', 'nodeC');
        reputation.addConnection('nodeB', 'nodeC');
        
        const stats = reputation.getStats();
        assert.strictEqual(stats.totalNodes, 3);
        assert.strictEqual(stats.totalConnections, 6); // 3 connections * 2 directions (undirected)
        
        const reputationA = reputation.calculateReputation('nodeA');
        const reputationB = reputation.calculateReputation('nodeB');
        const reputationC = reputation.calculateReputation('nodeC');
        
        assert.strictEqual(reputationA.connectionCount, 2); // Connected to B and C
        assert.strictEqual(reputationB.connectionCount, 2); // Connected to A and C
        assert.strictEqual(reputationC.connectionCount, 2); // Connected to A and B
        
        assert.ok(reputationA.trustScore >= 50 && reputationA.trustScore <= 100);
        assert.ok(reputationB.trustScore >= 50 && reputationB.trustScore <= 100);
        assert.ok(reputationC.trustScore >= 50 && reputationC.trustScore <= 100);
    });
    
    it('should remove connections', () => {
        reputation.addConnection('nodeA', 'nodeB');
        reputation.addConnection('nodeA', 'nodeC');
        
        const statsBefore = reputation.getStats();
        assert.strictEqual(statsBefore.totalNodes, 3);
        assert.strictEqual(statsBefore.totalConnections, 4);
        
        reputation.removeConnection('nodeA', 'nodeB');
        
        const statsAfter = reputation.getStats();
        assert.strictEqual(statsAfter.totalNodes, 3); // Nodes remain in graph
        assert.strictEqual(statsAfter.totalConnections, 2); // Only A-C connection remains
        
        const reputationA = reputation.calculateReputation('nodeA');
        assert.strictEqual(reputationA.connectionCount, 1); // Now only connected to C
    });
    
    it('should log activities and update trust scores', () => {
        reputation.addConnection('nodeA', 'nodeB');
        
        const initialReputation = reputation.calculateReputation('nodeA');
        const initialTrust = initialReputation.trustScore;
        
        // Log positive activities
        reputation.logActivity('nodeA', ActivityType.MESSAGE_SENT);
        reputation.logActivity('nodeA', ActivityType.HANDSHAKE_COMPLETED);
        reputation.logActivity('nodeA', ActivityType.DHT_UPDATE);
        
        const afterPositiveReputation = reputation.calculateReputation('nodeA');
        assert.ok(afterPositiveReputation.trustScore > initialTrust);
        
        // Log negative activities
        reputation.logActivity('nodeA', ActivityType.SPAM_DETECTED);
        reputation.logActivity('nodeA', ActivityType.MALICIOUS_ACTIVITY);
        
        const afterNegativeReputation = reputation.calculateReputation('nodeA');
        assert.ok(afterNegativeReputation.trustScore < afterPositiveReputation.trustScore);
        
        // Ensure score stays within bounds
        assert.ok(afterNegativeReputation.trustScore >= 0);
        assert.ok(afterNegativeReputation.trustScore <= 100);
    });
    
    it('should detect potential Sybil nodes', () => {
        // A node with few connections and low activity
        reputation.addConnection('sybilNode', 'legitNode');
        reputation.logActivity('sybilNode', ActivityType.INACTIVE_PERIOD);
        
        const isSybil = reputation.isLikelySybil('sybilNode');
        assert.strictEqual(isSybil, true);
        
        // A well-connected active node
        reputation.addConnection('legitNode', 'nodeC');
        reputation.addConnection('legitNode', 'nodeD');
        reputation.logActivity('legitNode', ActivityType.MESSAGE_SENT);
        reputation.logActivity('legitNode', ActivityType.HANDSHAKE_COMPLETED);
        reputation.logActivity('legitNode', ActivityType.DHT_UPDATE);
        
        const isLegitSybil = reputation.isLikelySybil('legitNode');
        assert.strictEqual(isLegitSybil, false);
    });
    
    it('should calculate reputation scores with weighted components', () => {
        reputation.addConnection('nodeA', 'nodeB');
        reputation.addConnection('nodeA', 'nodeC');
        reputation.addConnection('nodeB', 'nodeD');
        reputation.addConnection('nodeC', 'nodeD');
        
        // Log some activities
        reputation.logActivity('nodeA', ActivityType.MESSAGE_SENT);
        reputation.logActivity('nodeA', ActivityType.HANDSHAKE_COMPLETED);
        reputation.logActivity('nodeB', ActivityType.DHT_UPDATE);
        
        const reputationA = reputation.calculateReputation('nodeA');
        const reputationB = reputation.calculateReputation('nodeB');
        const reputationC = reputation.calculateReputation('nodeC');
        const reputationD = reputation.calculateReputation('nodeD');
        
        // Verify all components exist
        assert.ok(reputationA.trustScore >= 0 && reputationA.trustScore <= 100);
        assert.ok(reputationA.centrality >= 0 && reputationA.centrality <= 100);
        assert.ok(reputationA.activityScore >= 0 && reputationA.activityScore <= 100);
        assert.strictEqual(reputationA.connectionCount, 2);
        assert.ok(reputationA.weightedScore >= 0 && reputationA.weightedScore <= 100);
        
        // Node A should have higher activity score than Node C
        assert.ok(reputationA.activityScore > reputationC.activityScore);
        
        // Node A and B should have different trust scores due to different activities
        assert.notStrictEqual(reputationA.trustScore, reputationB.trustScore);
    });
    
    it('should provide connection recommendations', () => {
        // Create a social graph: A-B, B-C, A-D
        reputation.addConnection('nodeA', 'nodeB');
        reputation.addConnection('nodeB', 'nodeC');
        reputation.addConnection('nodeA', 'nodeD');
        
        // Add some activity to make recommendations meaningful
        reputation.logActivity('nodeC', ActivityType.MESSAGE_SENT);
        reputation.logActivity('nodeD', ActivityType.HANDSHAKE_COMPLETED);
        
        // Get recommendations for nodeA (should recommend nodeC through nodeB)
        const recommendations = reputation.getConnectionRecommendations('nodeA', 5);
        
        // NodeA is connected to B and D, so should recommend C (friend of B)
        assert.ok(recommendations.includes('nodeC'));
        // Should not recommend existing connections
        assert.ok(!recommendations.includes('nodeB'));
        assert.ok(!recommendations.includes('nodeD'));
        // Should not recommend self
        assert.ok(!recommendations.includes('nodeA'));
        
        // Recommendations should be limited by limit parameter
        // Add more friends of friends (connect nodeB to nodeE and nodeF)
        reputation.addConnection('nodeB', 'nodeE');
        reputation.addConnection('nodeB', 'nodeF');
        
        const limitedRecommendations = reputation.getConnectionRecommendations('nodeA', 2);
        assert.strictEqual(limitedRecommendations.length, 2);
    });
    
    it('should export and import reputation data', () => {
        // Create some reputation data
        reputation.addConnection('nodeA', 'nodeB');
        reputation.addConnection('nodeB', 'nodeC');
        reputation.logActivity('nodeA', ActivityType.MESSAGE_SENT);
        reputation.logActivity('nodeB', ActivityType.DHT_UPDATE);
        
        const exportData = reputation.exportData();
        
        // Create new reputation system and import data
        const newReputation = new SocialReputation();
        newReputation.importData(exportData);
        
        const importedStats = newReputation.getStats();
        const originalStats = reputation.getStats();
        
        assert.strictEqual(importedStats.totalNodes, originalStats.totalNodes);
        assert.strictEqual(importedStats.totalConnections, originalStats.totalConnections);
        
        // Verify connections were imported
        const importedReputationA = newReputation.calculateReputation('nodeA');
        const originalReputationA = reputation.calculateReputation('nodeA');
        
        assert.strictEqual(importedReputationA.connectionCount, originalReputationA.connectionCount);
        assert.strictEqual(importedReputationA.trustScore, originalReputationA.trustScore);
    });
    
    it('should handle unknown nodes gracefully', () => {
        const reputationForUnknown = reputation.calculateReputation('unknownNode');
        
        assert.strictEqual(reputationForUnknown.trustScore, 50); // Default trust score
        assert.strictEqual(reputationForUnknown.connectionCount, 0);
        assert.strictEqual(reputationForUnknown.activityScore, 0);
        assert.strictEqual(reputationForUnknown.centrality, 0);
        assert.ok(reputationForUnknown.weightedScore >= 0);
    });
    
    it('should maintain activity log limits', () => {
        // Add more than 1000 activities
        for (let i = 0; i < 1500; i++) {
            reputation.logActivity('nodeA', ActivityType.MESSAGE_SENT);
        }
        
        const reputationScore = reputation.calculateReputation('nodeA');
        assert.ok(reputationScore.activityScore > 0);
        assert.ok(reputationScore.activityScore <= 100);
    });
});