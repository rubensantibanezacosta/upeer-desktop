import { VaultManager } from '../src/main_process/network/vault/manager.js';
import { setKademliaInstance, KademliaDHT } from '../src/main_process/network/dht/kademlia/index.js';
import { getMyUPeerId } from '../src/main_process/security/identity.js';

async function testDHTPointers() {
    console.log("Starting Vault/DHT Pointer Test...");

    // 1. Mock Kademlia
    const mockKademlia = {
        storeValue: async (key, value, publisher) => {
            console.log("✅ DHT_STORE called:", {
                key: key.toString('hex'),
                value,
                publisher
            });
        },
        findValue: async (key) => {
            console.log("🔍 DHT_FIND_VALUE called for key:", key.toString('hex'));
            return null;
        },
        upeerId: "my-fake-id"
    } as any;

    // Set the instance so VaultManager can find it
    const { setKademliaInstance: setShared } = await import('../src/main_process/network/dht/shared.js');
    setShared(mockKademlia);

    const recipient = "c4dbaa1ee2fb18278a8e17f2f3ace96b"; // Carlos
    const packet = { type: 'CHAT', content: 'Test offline message' };

    console.log("\n--- Testing replicateToVaults ---");
    // We expect this to try to replicate to Alice (she is online in docker)
    // and then call storeValue on our mockKademlia.
    await VaultManager.replicateToVaults(recipient, packet);

    console.log("\n--- Testing queryOwnVaults ---");
    // We expect this to call findValue on our mockKademlia for our own ID.
    await VaultManager.queryOwnVaults();

    console.log("\nTest complete.");
}

testDHTPointers().catch(console.error);
