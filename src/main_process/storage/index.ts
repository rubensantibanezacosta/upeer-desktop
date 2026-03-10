// Re-export everything from modules for backward compatibility
export * from './init.js';
export * from './messages/index.js';
export * from './contacts/index.js';
export * from './backup/index.js';
export * from './groups/index.js';
export * from './vault/index.js';
export * from './reputation/index.js';


// Export shared utilities
export { eq, desc, or, and, clearUserData } from './shared.js';