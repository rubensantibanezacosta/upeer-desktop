// Re-export all public API functions from modularized server

// Transport layer
export { sendSecureUDPMessage, drainSendQueue, isIPUnreachable } from './transport.js';

// TCP server management
export { startUDPServer, closeUDPServer } from './tcpServer.js';

// Messaging layer (contacts, chat, files, groups, heartbeat)
export { sendContactRequest, acceptContactRequest } from '../messaging/contacts.js';
export { 
    sendUDPMessage, 
    sendTypingIndicator, 
    sendReadReceipt, 
    sendContactCard, 
    sendChatReaction, 
    sendChatUpdate, 
    sendChatDelete 
} from '../messaging/chat.js';
export { sendFile } from '../messaging/files.js';
export { 
    sendGroupMessage, 
    createGroup, 
    inviteToGroup, 
    updateGroup, 
    leaveGroup 
} from '../messaging/groups.js';
export { 
    checkHeartbeat, 
    distributedHeartbeat, 
    wrappedBroadcastDhtUpdate 
} from '../messaging/heartbeat.js';

export { wrappedBroadcastDhtUpdate as broadcastDhtUpdate } from '../messaging/heartbeat.js';