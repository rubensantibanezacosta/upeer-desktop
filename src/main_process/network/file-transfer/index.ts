// Main export file for file-transfer module
// Provides backward compatibility with the original file-transfer.ts

import { TransferManager } from './transfer-manager.js';
import { FileTransferStore } from './transfer-store.js';
import { FileChunker } from './chunker.js';
import { TransferValidator } from './validator.js';
import { 
    FileTransfer, 
    TransferProgress, 
    TransferConfig, 
    DEFAULT_CONFIG,
    TransferState 
} from './types.js';

// Re-export types for backward compatibility
export type { FileTransfer, TransferProgress, TransferConfig, TransferState };
export { DEFAULT_CONFIG };

// Singleton instance for backward compatibility
const transferManager = new TransferManager();

// Export the singleton instance
export { transferManager as fileTransferManager };

// Export individual components for testing and advanced usage
export { TransferManager, FileTransferStore, FileChunker, TransferValidator };

// Original class compatibility
export class FileTransferManager extends TransferManager {
    constructor() {
        super();
    }
}