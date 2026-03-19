import { vi } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Mocks para evitar dependencias de @mui/material en tests de componentes Joy UI
vi.mock('@mui/icons-material', () => ({}));
vi.mock('@mui/icons-material/HourglassEmpty', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Done', () => ({ default: () => null }));
vi.mock('@mui/icons-material/DoneAll', () => ({ default: () => null }));
vi.mock('@mui/icons-material/KeyboardArrowDown', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Archive', () => ({ default: () => null }));
vi.mock('@mui/icons-material/NotificationsOff', () => ({ default: () => null }));
vi.mock('@mui/icons-material/PushPin', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Notifications', () => ({ default: () => null }));
vi.mock('@mui/icons-material/MarkChatUnread', () => ({ default: () => null }));
vi.mock('@mui/icons-material/FavoriteBorder', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Block', () => ({ default: () => null }));
vi.mock('@mui/icons-material/DeleteSweep', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Delete', () => ({ default: () => null }));
vi.mock('@mui/icons-material/WarningRounded', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Security', () => ({ default: () => null }));
vi.mock('@mui/icons-material/CheckCircle', () => ({ default: () => null }));
vi.mock('@mui/icons-material/VerifiedUser', () => ({ default: () => null }));
vi.mock('@mui/icons-material/GppMaybe', () => ({ default: () => null }));
vi.mock('@mui/icons-material/NewReleases', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Chat', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Groups', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Settings', () => ({ default: () => null }));
vi.mock('@mui/icons-material/AccountCircle', () => ({ default: () => null }));
vi.mock('@mui/icons-material/ChatBubbleOutline', () => ({ default: () => null }));
vi.mock('@mui/icons-material/StarBorder', () => ({ default: () => null }));
vi.mock('@mui/icons-material/PersonAdd', () => ({ default: () => null }));
vi.mock('@mui/icons-material/GroupAdd', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Search', () => ({ default: () => null }));
vi.mock('@mui/icons-material/MoreVert', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Add', () => ({ default: () => null }));

// Setup test mocks for sodium-native
const __dirname = dirname(fileURLToPath(import.meta.url));

const mockSodium = {
    crypto_secretbox_KEYBYTES: 32,
    crypto_secretbox_NONCEBYTES: 24,
    crypto_secretbox_MACBYTES: 16,
    crypto_sign_SECRETKEYBYTES: 64,
    crypto_sign_PUBLICKEYBYTES: 32,
    crypto_sign_SEEDBYTES: 32,
    crypto_sign_BYTES: 64,
    crypto_box_PUBLICKEYBYTES: 32,
    crypto_box_SECRETKEYBYTES: 32,
    crypto_box_NONCEBYTES: 24,
    crypto_box_MACBYTES: 16,
    crypto_generichash_BYTES: 32,
    crypto_generichash_BYTES_MIN: 16,
    crypto_generichash_BYTES_MAX: 64,

    crypto_sign_seed_keypair(pk, sk, seed) {
        pk.fill(2);
        sk.fill(3);
    },
    crypto_sign_ed25519_sk_to_pk(pk, sk) {
        pk.fill(2);
    },
    crypto_generichash(hash, pk) {
        hash.fill(6);
    },
    crypto_secretbox_easy(cipher, message, nonce, key) {
        cipher.set(message);
    },
    crypto_secretbox_open_easy(message, cipher, nonce, key) {
        // En el mock, cipher incluye el MAC al final pero el mock easy no lo usa
        // Simplemente copiamos el contenido
        message.set(cipher.subarray(0, message.length));
        return true;
    },
    crypto_box_keypair(pk, sk) {
        pk.fill(4);
        sk.fill(5);
    },
    sodium_memzero(buffer) {
        buffer.fill(0);
    },

    randombytes_buf(buffer) {
        for (let i = 0; i < buffer.length; i++) {
            buffer[i] = Math.floor(Math.random() * 256);
        }
    },
};

vi.mock('sodium-native', () => ({
    default: mockSodium,
    ...mockSodium
}));

// Mock Yggdrasil sidecar
vi.mock('../src/main_process/sidecars/yggdrasil-sidecar.js', () => ({
    YggdrasilSidecar: vi.fn().mockImplementation(() => ({
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
        on: vi.fn(),
        getAddress: vi.fn().mockReturnValue('200:test:address'),
        getPublicKey: vi.fn().mockReturnValue('test-public-key'),
    }))
}));

// Mock NetworkManager
vi.mock('../src/main_process/network/network-manager.js', () => ({
    NetworkManager: vi.fn().mockImplementation(() => ({
        init: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
    }))
}));
