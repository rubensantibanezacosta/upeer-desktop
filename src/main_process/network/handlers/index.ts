// Re-export public API from modular handlers
export { cleanupRateLimiter, handlePacket } from '../handlers.js';

// Optionally re-export individual handlers for external use
export { handleChatMessage, handleAck, handleReadReceipt } from './chat.js';
export { handleHandshakeReq, handleHandshakeAccept } from './contacts.js';
export { handleGroupMessage, handleGroupAck, handleGroupInvite, handleGroupUpdate, handleGroupLeave } from './groups.js';
export { handleVaultDelivery } from './vault.js';
export { handleDhtUpdate, handleDhtExchange, handleDhtQuery, handleDhtResponse } from './dht.js';
export { handleReputationGossip, handleReputationRequest, handleReputationDeliver } from './reputation.js';