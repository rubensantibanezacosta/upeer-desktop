// Database module - Refactored into semantic components
// This file maintains backward compatibility by re-exporting all functionality

// Re-export everything from the new modular structure
export * from './index.js';

// Note: The actual implementation is now split into:
// - storage/init.ts: initDB, closeDB
// - storage/messages/: message operations, reactions, status
// - storage/contacts/: contact operations, location, status, keys
// - storage/backup/: survival kit functionality
// - storage/shared.ts: shared database instance and utilities