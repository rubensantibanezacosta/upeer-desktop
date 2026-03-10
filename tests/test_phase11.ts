import { initDB, saveMessage, getMessages, getContacts, addOrUpdateContact } from '../src/main_process/storage/db.js';
import { handlePacket } from '../src/main_process/network/handlers.js';
import { initIdentity, sign, getMyUPeerId, getMyPublicKeyHex } from '../src/main_process/security/identity.js';
import { canonicalStringify } from '../src/main_process/network/utils.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// Test directory
const tempDir = path.join(os.tmpdir(), 'upeer-test-' + Date.now());
fs.mkdirSync(tempDir, { recursive: true });

async function runTest() {
    console.log("--- Iniciando Test de Fase 11 ---");

    // 1. Init DB e Identidad
    initIdentity(tempDir);
    await initDB(tempDir);

    const myId = getMyUPeerId();
    const myPk = getMyPublicKeyHex();

    // 2. Crear un contacto de prueba (Simulamos que ya hubo handshake)
    const peerId = "peer_test_id_1234567890abcdef";
    const peerPk = myPk; // Usamos nuestra propia PK para facilitar la firma en el test
    addOrUpdateContact(peerId, "::1", "Test Peer", peerPk, 'connected');

    console.log("DB inicializada con peer:", peerId);

    // 3. Crear un mensaje original para reaccionar/editar/borrar
    const msgId = "msg_original_001";
    saveMessage(msgId, peerId, false, "Este es el mensaje original para la prueba");

    console.log("Mensaje original guardado:", msgId);

    // Mock functions
    const mockWin = {
        webContents: {
            send: (channel: string, data: any) => {
                console.log(`[EVENT] Renderer recibió: ${channel}`, data);
            }
        }
    } as any;

    const sendResponse = (ip: string, data: any) => {
        console.log(`[SEND] Respuesta enviada a ${ip}:`, data.type);
    };

    const startDhtSearch = (id: string) => { };

    // Helper para emular la recepción de un paquete firmado
    const simulatePacket = async (data: any) => {
        const signature = sign(Buffer.from(canonicalStringify(data))).toString('hex');
        const packet = {
            ...data,
            senderUpeerId: peerId,
            signature: signature
        };
        const buffer = Buffer.from(JSON.stringify(packet));
        await handlePacket(buffer, { address: "::1" }, mockWin, sendResponse, startDhtSearch);
    };

    // --- TEST 1: REACCIÓN ---
    console.log("\n>>> Test 1: CHAT_REACTION");
    await simulatePacket({
        type: 'CHAT_REACTION',
        msgId: msgId,
        emoji: '👍',
        remove: false
    });

    const msgsWithReaction = getMessages(peerId);
    const reactions = msgsWithReaction.find(m => m.id === msgId)?.reactions;
    console.log("Resultado DB reacciones:", reactions);

    // --- TEST 2: EDICIÓN ---
    console.log("\n>>> Test 2: CHAT_UPDATE");
    // Para simplificar el test usamos texto plano (el handler soporta plano si no hay nonce)
    await simulatePacket({
        type: 'CHAT_UPDATE',
        msgId: msgId,
        content: "Este mensaje ha sido editado por el bot",
    });

    const msgsAfterUpdate = getMessages(peerId);
    const updatedMsg = msgsAfterUpdate.find(m => m.id === msgId);
    console.log("Resultado DB edición:", updatedMsg?.message, "Edited:", updatedMsg?.isEdited);

    // --- TEST 3: ELIMINACIÓN ---
    console.log("\n>>> Test 3: CHAT_DELETE");
    await simulatePacket({
        type: 'CHAT_DELETE',
        msgId: msgId
    });

    const msgsAfterDelete = getMessages(peerId);
    const deletedMsg = msgsAfterDelete.find(m => m.id === msgId);
    console.log("Resultado DB eliminación:", deletedMsg?.message, "Deleted:", deletedMsg?.isDeleted);

    console.log("\n--- Test Finalizado ---");
    process.exit(0);
}

runTest().catch(err => {
    console.error("Test falló:", err);
    process.exit(1);
});
