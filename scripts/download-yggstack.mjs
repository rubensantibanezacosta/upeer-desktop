/**
 * scripts/download-yggstack.mjs
 *
 * Descarga el binario de yggstack (Yggdrasil user-space sidecar) desde las
 * releases oficiales de GitHub y lo coloca en el directorio correcto dentro
 * de resources/bin/ para que el módulo yggstack.ts pueda encontrarlo.
 *
 * Uso:
 *   node scripts/download-yggstack.mjs           # descarga solo la plataforma actual
 *   node scripts/download-yggstack.mjs --all     # descarga todas las plataformas
 *
 * Plataformas soportadas:
 *   linux-x64  │  linux-arm64
 *   darwin-x64 │  darwin-arm64
 *   win32-x64
 */

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'resources', 'bin');

// ── Configuración de la release ──────────────────────────────────────────────
// Ajusta YGGSTACK_VERSION a la última release disponible en:
// https://github.com/yggdrasil-network/yggstack/releases
// ⚠️  NOTA: este repo usa tags SIN prefijo 'v' (ej: '1.0.4', no 'v1.0.4')
const YGGSTACK_VERSION = '1.0.4';
const GITHUB_REPO = 'yggdrasil-network/yggstack';
const BASE_URL = `https://github.com/${GITHUB_REPO}/releases/download/${YGGSTACK_VERSION}`;

/**
 * Mapa de plataforma+arquitectura de Node.js → nombre del archivo en la release.
 *
 * Los nombres de los assets pueden variar según la versión; ajusta si es necesario
 * consultando: https://github.com/yggdrasil-network/yggstack/releases
 */
const PLATFORM_MAP = {
    'linux-x64': { file: 'yggstack-linux-amd64-static', exe: 'yggstack' },
    'linux-arm64': { file: 'yggstack-linux-arm64-static', exe: 'yggstack' },
    'darwin-x64': { file: 'yggstack-darwin-amd64', exe: 'yggstack' },
    'darwin-arm64': { file: 'yggstack-darwin-arm64', exe: 'yggstack' },
    'win32-x64': { file: 'yggstack-windows-amd64.exe', exe: 'yggstack.exe' },
};

// ── Utilidades ───────────────────────────────────────────────────────────────

function log(msg) {
    console.log(`[download-yggstack] ${msg}`);
}

function err(msg) {
    console.error(`[download-yggstack] ✗ ${msg}`);
}

/**
 * Descarga un archivo desde una URL con soporte de redirecciones (302/301).
 * @param {string} url  URL de origen
 * @param {string} dest Ruta de destino en disco
 * @returns {Promise<void>}
 */
function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);

        const request = (targetUrl) => {
            https.get(targetUrl, (res) => {
                // Seguir redirecciones de GitHub
                if (res.statusCode === 301 || res.statusCode === 302) {
                    file.close();
                    return request(res.headers.location);
                }

                if (res.statusCode !== 200) {
                    file.close();
                    fs.unlink(dest, () => { });
                    return reject(new Error(`HTTP ${res.statusCode} al descargar ${targetUrl}`));
                }

                const total = parseInt(res.headers['content-length'] || '0', 10);
                let downloaded = 0;

                res.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (total > 0) {
                        const pct = Math.round((downloaded / total) * 100);
                        process.stdout.write(`\r  → ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
                    }
                });

                res.pipe(file);
                file.on('finish', () => {
                    process.stdout.write('\n');
                    file.close(resolve);
                });
            }).on('error', (e) => {
                fs.unlink(dest, () => { });
                reject(e);
            });
        };

        request(url);
    });
}

/**
 * Descarga el binario para la plataforma indicada y lo instala en
 * resources/bin/<platform>/<exe>.
 *
 * @param {string} platformKey  Clave del mapa PLATFORM_MAP (ej. 'linux-x64')
 */
async function downloadForPlatform(platformKey) {
    const entry = PLATFORM_MAP[platformKey];
    if (!entry) {
        err(`Plataforma no soportada: ${platformKey}`);
        err(`Plataformas disponibles: ${Object.keys(PLATFORM_MAP).join(', ')}`);
        process.exit(1);
    }

    const destDir = path.join(BIN_DIR, platformKey);
    const destFile = path.join(destDir, entry.exe);
    const url = `${BASE_URL}/${entry.file}`;

    log(`Plataforma: ${platformKey}`);
    log(`URL:        ${url}`);
    log(`Destino:    ${destFile}`);

    // Crear directorio si no existe
    fs.mkdirSync(destDir, { recursive: true });

    // Saltar si el binario ya existe y tiene contenido (evita ETXTBSY si está en uso)
    if (fs.existsSync(destFile) && fs.statSync(destFile).size > 0) {
        log(`⚠ Ya existe, omitiendo: ${destFile}\n`);
        return;
    }
    // Si existe pero está vacío (descarga interrumpida), eliminarlo
    if (fs.existsSync(destFile)) {
        fs.unlinkSync(destFile);
        log('Archivo vacío previo eliminado, reintentando descarga…');
    }

    // Descargar
    log('Descargando…');
    await download(url, destFile);

    // Hacer ejecutable en Linux/macOS
    if (!platformKey.startsWith('win32')) {
        fs.chmodSync(destFile, 0o755);
        log('chmod +x aplicado.');
    }

    log(`✓ ${platformKey} listo en: ${destFile}\n`);
}

// ── Punto de entrada ─────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const downloadAll = args.includes('--all');

    if (downloadAll) {
        log(`Descargando todas las plataformas (yggstack v${YGGSTACK_VERSION})…\n`);
        for (const key of Object.keys(PLATFORM_MAP)) {
            try {
                await downloadForPlatform(key);
            } catch (e) {
                err(`Error descargando ${key}: ${e.message}`);
            }
        }
    } else {
        const currentPlatform = `${process.platform}-${process.arch}`;
        log(`Descargando binario para la plataforma actual: ${currentPlatform}`);
        log(`yggstack versión: ${YGGSTACK_VERSION}\n`);
        try {
            await downloadForPlatform(currentPlatform);
            log('✓ Descarga completada. Ya puedes ejecutar "npm start".');
        } catch (e) {
            err(`Descarga fallida: ${e.message}`);
            err('Revisa la versión en YGGSTACK_VERSION o descarga manualmente desde:');
            err(`https://github.com/${GITHUB_REPO}/releases`);
            process.exit(1);
        }
    }
}

main().catch(e => {
    console.error('[download-yggstack] Error fatal:', e.message);
    process.exit(1);
});
