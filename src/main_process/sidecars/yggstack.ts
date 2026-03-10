/**
 * MÓDULO: Yggdrasil User-Space Sidecar (yggstack)
 *
 * ARQUITECTURA — SOCKS5 vs TUN:
 * ─────────────────────────────
 * El modo TUN/TAP clásico crea una interfaz de red virtual (ygg0) a nivel de
 * sistema operativo. Cualquier proceso del host puede enviar y recibir tráfico
 * a través de ella, lo que significa que servicios como SSH (:22), PostgreSQL
 * (:5432) o cualquier otro daemon que escuche en 0.0.0.0 quedan expuestos
 * automáticamente a toda la red Yggdrasil global. Además, requiere privilegios
 * de administrador (root en Linux/macOS, UAC en Windows) y puede ser bloqueado
 * por el firewall del SO.
 *
 * yggstack opera completamente en user-space: NO crea ninguna interfaz de red
 * virtual. En su lugar, expone un proxy SOCKS5 local en 127.0.0.1:9050.
 *
 * VENTAJAS DE SEGURIDAD Y AISLAMIENTO:
 * ─────────────────────────────────────
 *  • Sin privilegios de administrador: el binario es un proceso normal de usuario.
 *  • Exposición mínima: SOLO el tráfico que pasa EXPLÍCITAMENTE por el proxy
 *    SOCKS5 entra/sale de la red Yggdrasil. Los servicios del sistema (SSH,
 *    bases de datos, servidores web locales) siguen siendo accesibles únicamente
 *    desde la red local o desde loopback; NO quedan expuestos a Internet/Yggdrasil.
 *  • El firewall del SO no interfiere porque no hay ninguna interfaz nueva que
 *    inspeccionar o bloquear; el proxy escucha solo en 127.0.0.1.
 *  • Modelo Zero-Config: el usuario final no necesita instalar drivers, configurar
 *    firewalls ni conceder permisos especiales. La app funciona de fábrica.
 *
 * FLUJO DE DATOS:
 *   App (renderer) ──IPC──► main process ──SOCKS5──► yggstack ──► red Yggdrasil
 */

import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { exec, spawn, ChildProcess } from 'node:child_process';
import { warn, info, error } from '../security/secure-logger.js';

import {
    initPeerManager,
    stopPeerManager,
    setOnPeersChanged,
    getActivePeerUris,
} from './peer-manager.js';

// ── Configuración del proxy SOCKS5 ──────────────────────────────────────────
const SOCKS_HOST = '127.0.0.1';
const SOCKS_PORT = 9050;

/**
 * Puerto TCP donde escucha el servidor P2P de la app (server.ts).
 * yggstack expone este puerto en nuestra dirección Yggdrasil con -remote-tcp,
 * de modo que otros nodos pueden conectarse directamente sin TUN/TAP.
 */
const APP_P2P_PORT = 50005;

// ── Regex para detectar dirección IPv6 Yggdrasil ────────────────────────────
/**
 * Las direcciones Yggdrasil pertenecen al rango 200::/7 (es decir, cualquier
 * dirección que empiece por 2xx: o 3xx: dentro del espacio fc00::/7 privado).
 * Capturamos la primera aparición en stdout/stderr del proceso yggstack.
 */
const YGG_IPV6_REGEX = /\b((?:2[0-9a-f]{2}|3[0-9a-f]{2}):[0-9a-f:]{4,}(?::[0-9a-f]{0,4}){1,6})\b/i;

// ── Estado interno del módulo ────────────────────────────────────────────────
let yggstackProcess: ChildProcess | null = null;
let detectedAddress: string | null = null;
let currentConfPath: string | null = null;  // ruta al config activo (para actualizar peers)
let isQuitting = false;               // true cuando stopYggstack() se llama intencionalmente
let restartAttempts = 0;                   // contador de reinicios consecutivos
const MAX_RESTART_ATTEMPTS = 8;
const RESTART_BASE_DELAY_MS = 3_000;       // 3 s × 2^n, máx ~6 min

export type YggStatus = 'connecting' | 'up' | 'down' | 'reconnecting';

type AddressCallback = (address: string) => void;
type StatusCallback = (status: YggStatus, address?: string) => void;

const addressCallbacks: AddressCallback[] = [];
const statusCallbacks: StatusCallback[] = [];

function emitStatus(status: YggStatus, address?: string): void {
    statusCallbacks.forEach(cb => cb(status, address));
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Registra un callback que se invocará cuando yggstack reporte su dirección
 * IPv6 asignada. Si la dirección ya fue detectada, el callback se invoca
 * de inmediato (patrón "late subscriber").
 */
export function onYggstackAddress(cb: AddressCallback): void {
    addressCallbacks.push(cb);
    if (detectedAddress) cb(detectedAddress);
}

/**
 * Registra un callback para cambios de estado de la red Yggdrasil.
 * 'connecting'   → yggstack arrancando (primera vez o tras restart)
 * 'up'           → IPv6 detectada, red operativa
 * 'down'         → proceso caído inesperadamente, en espera de restart
 * 'reconnecting' → restart en curso tras caída
 */
export function onYggstackStatus(cb: StatusCallback): void {
    statusCallbacks.push(cb);
}

/**
 * Devuelve la dirección IPv6 Yggdrasil detectada, o null si aún no se conoce.
 */
export function getYggstackAddress(): string | null {
    return detectedAddress;
}

/** Número de reintentos de auto-restart consecutivos en curso. */
export function getRestartAttempts(): number {
    return restartAttempts;
}

/** Límite máximo de reintentos configurado. */
export function getMaxRestartAttempts(): number {
    return MAX_RESTART_ATTEMPTS;
}

/**
 * Fuerza un reinicio de yggstack desde la UI (p.ej. botón "Reintentar").
 * Resetea el contador de reintentos y arranca el proceso de nuevo.
 */
export async function forceRestart(): Promise<void> {
    if (yggstackProcess) {
        info('forceRestart: process already running, ignoring', undefined, 'yggstack');
        return;
    }
    info('forceRestart: restarting by user request…', undefined, 'yggstack');
    restartAttempts = 0;
    isQuitting = false;
    try {
        await spawnYggstack();
    } catch (err) {
        error('forceRestart: error starting process', err, 'yggstack');
        scheduleRestart();
    }
}

/**
 * Resuelve la ruta absoluta al binario yggstack según la plataforma y
 * arquitectura del sistema en ejecución.
 */
function resolveYggstackPath(): string {
    const platformFolder = `${process.platform}-${process.arch}`;
    const exeName = process.platform === 'win32' ? 'yggstack.exe' : 'yggstack';

    const resourcesBasePath = app.isPackaged
        ? path.join(process.resourcesPath, 'bin')
        : path.join(app.getAppPath(), 'resources', 'bin');

    return path.join(resourcesBasePath, platformFolder, exeName);
}

/**
 * Actualiza el bloque Peers del fichero de configuración existente.
 * Llamado por el PeerManager cuando el health monitor detecta cambios.
 */
function updatePeersInConfig(confPath: string, peers: string[]): void {
    if (!fs.existsSync(confPath)) return;
    const peersHjson = peers.map(p => `    "${p}"`).join('\n');
    let conf = fs.readFileSync(confPath, 'utf8');
    conf = conf.replace(/(Peers:\s*\[)([\s\S]*?)(\])/, `$1\n${peersHjson}\n  $3`);
    fs.writeFileSync(confPath, conf, 'utf8');
    info(`Peers updated in config (${peers.length} nodes) — effective on next restart`, undefined, 'yggstack');
}

/**
 * Genera (o reutiliza) el fichero de configuración de yggstack.
 * Los peers se inyectan en el HJSON generado por `yggstack -genconf`.
 * La PrivateKey persiste entre reinicios en userData.
 */
async function ensureConfig(yggstackPath: string): Promise<string> {
    const userDataPath = app.getPath('userData');
    const confPath = path.join(userDataPath, 'yggstack.conf');
    currentConfPath = confPath;

    // Selección inteligente de peers: geo + latencia + uptime + caché
    const peers = await initPeerManager(userDataPath);
    const peersHjson = peers.map(p => `    "${p}"`).join('\n');

    // Registrar callback: cuando el health monitor rote peers, actualizamos el config
    setOnPeersChanged((newPeers) => {
        if (currentConfPath) updatePeersInConfig(currentConfPath, newPeers);
    });

    if (fs.existsSync(confPath)) {
        // Config existente: actualizar SOLO el bloque Peers (la PrivateKey se conserva)
        info(`Updating peers in existing config: ${confPath}`, undefined, 'yggstack');
        let conf = fs.readFileSync(confPath, 'utf8');
        conf = conf.replace(
            /(Peers:\s*\[)([\s\S]*?)(\])/,
            `$1\n${peersHjson}\n  $3`
        );
        fs.writeFileSync(confPath, conf, 'utf8');
        return confPath;
    }

    // Primera ejecución: generar config base con yggstack -genconf
    info('Generating initial configuration…', undefined, 'yggstack');
    const genconf = await new Promise<string>((resolve, reject) => {
        exec(`"${yggstackPath}" -genconf`, { encoding: 'utf8' }, (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout);
        });
    });

    let conf = genconf.replace(
        /(Peers:\s*\[)([\s\S]*?)(\])/,
        `$1\n${peersHjson}\n  $3`
    );
    // AdminListen: none → no necesitamos socket de administración
    conf = conf.replace(/AdminListen:\s*.*/, 'AdminListen: none');

    fs.writeFileSync(confPath, conf, 'utf8');
    info(`Config saved to: ${confPath}`, undefined, 'yggstack');
    return confPath;
}

/**
 * Lanza el proceso yggstack en user-space con el proxy SOCKS5 configurado.
 *
 * • No requiere privilegios de administrador.
 * • No crea interfaces TUN/TAP.
 * • Escucha conexiones proxy solo en loopback (127.0.0.1), por lo que otros
 *   equipos de la red local NO pueden abusar del proxy.
 *
 * @returns Promise que resuelve cuando el proceso se ha iniciado correctamente.
 */
export async function spawnYggstack(): Promise<void> {
    if (yggstackProcess) {
        info('Process already running, skipping spawn', undefined, 'yggstack');
        return;
    }

    const yggstackPath = resolveYggstackPath();

    if (!fs.existsSync(yggstackPath)) {
        throw new Error(
            `[yggstack] Binario no encontrado en: ${yggstackPath}\n` +
            `Ejecuta 'node scripts/download-yggstack.mjs' para descargarlo.`
        );
    }

    // Garantizar que el binario sea ejecutable en Linux/macOS
    if (process.platform !== 'win32') {
        try {
            fs.chmodSync(yggstackPath, 0o755);
        } catch (e) {
            warn('Could not apply chmod to binary', e, 'yggstack');
        }
    }

    // Generar (o reutilizar) fichero de configuración con peers
    const confPath = await ensureConfig(yggstackPath);

    info('Starting yggstack user-space sidecar', { path: yggstackPath, config: confPath, socks: `${SOCKS_HOST}:${SOCKS_PORT}` }, 'yggstack');

    // ── Spawn del proceso ────────────────────────────────────────────────────
    //
    // Argumentos:
    //   -useconffile   → fichero de configuración con PrivateKey y Peers
    //   -socks         → proxy SOCKS5 en user-space para tráfico SALIENTE
    //   -remote-tcp    → expone APP_P2P_PORT en nuestra dirección Yggdrasil
    //                    para tráfico ENTRANTE TCP (sin TUN/TAP, sin root).
    //                    Yggdrasil peers → [nuestro-ygg-addr]:50005 →
    //                    yggstack reenvía → localhost:50005 → server.ts
    //
    // stdio: ignoramos stdin, capturamos stdout y stderr para detectar la IPv6.
    yggstackProcess = spawn(
        yggstackPath,
        [
            '-useconffile', confPath,
            '-socks', `${SOCKS_HOST}:${SOCKS_PORT}`,
            '-remote-tcp', `${APP_P2P_PORT}`,
        ],
        {
            stdio: ['ignore', 'pipe', 'pipe'],
        }
    );

    if (!yggstackProcess.pid) {
        yggstackProcess = null;
        throw new Error('[yggstack] El sistema operativo no pudo crear el proceso sidecar.');
    }

    info(`Process started with PID: ${yggstackProcess.pid}`, undefined, 'yggstack');
    emitStatus('connecting');

    // ── Captura de stdout: detección de la dirección IPv6 ───────────────────
    yggstackProcess.stdout?.on('data', (chunk: Buffer) => {
        const line = chunk.toString();
        process.stdout.write(`[yggstack] ${line}`);
        tryExtractAddress(line);
    });

    // ── Captura de stderr ────────────────────────────────────────────────────
    yggstackProcess.stderr?.on('data', (chunk: Buffer) => {
        const line = chunk.toString();
        process.stderr.write(`[yggstack:err] ${line}`);
        // yggstack puede escribir la dirección en stderr dependiendo de la versión
        tryExtractAddress(line);
    });

    // ── Manejo de ciclo de vida ──────────────────────────────────────────────
    yggstackProcess.on('exit', (code, signal) => {
        // Salida limpia por stopYggstack() — no reintentar
        if (isQuitting) {
            info('Sidecar stopped intentionally', undefined, 'yggstack');
            yggstackProcess = null;
            return;
        }

        warn(`Process terminated unexpectedly. Code: ${code ?? 'N/A'}, Signal: ${signal ?? 'N/A'}`, undefined, 'yggstack');
        yggstackProcess = null;
        detectedAddress = null;
        emitStatus('down');
        scheduleRestart();
    });

    yggstackProcess.on('error', (err) => {
        error('Sidecar process error', err.message, 'yggstack');
        if (!isQuitting) {
            yggstackProcess = null;
            detectedAddress = null;
            emitStatus('down');
            scheduleRestart();
        }
    });
}

/**
 * Programa un reinicio de yggstack con backoff exponencial.
 * Máx. MAX_RESTART_ATTEMPTS reintentos; después se rinde y deja la app
 * en modo sin-red hasta que el usuario reinicie la aplicación.
 */
function scheduleRestart(): void {
    if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
        error(`Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Yggdrasil network unavailable`, undefined, 'yggstack');
        emitStatus('down');
        return;
    }

    restartAttempts++;
    const delayMs = Math.min(RESTART_BASE_DELAY_MS * 2 ** (restartAttempts - 1), 6 * 60_000); // máx 6 min
    info(`Retry ${restartAttempts}/${MAX_RESTART_ATTEMPTS} in ${Math.round(delayMs / 1000)} s…`, undefined, 'yggstack');
    emitStatus('reconnecting');

    setTimeout(async () => {
        if (isQuitting) return;
        try {
            await spawnYggstack();
        } catch (err) {
            error('Error in automatic restart', err, 'yggstack');
            scheduleRestart();
        }
    }, delayMs);
}

/**
 * Detiene el proceso yggstack de forma ordenada (SIGTERM → SIGKILL).
 * Es idempotente: si no hay proceso activo, no hace nada.
 *
 * Debe llamarse en `app.on('before-quit')` para liberar el puerto SOCKS5
 * correctamente antes de que la aplicación cierre.
 */
export function stopYggstack(): void {
    if (!yggstackProcess) {
        info('stopYggstack: no active process to stop', undefined, 'yggstack');
        return;
    }

    const pid = yggstackProcess.pid;
    info(`Stopping sidecar (PID: ${pid})…`, undefined, 'yggstack');
    isQuitting = true;
    restartAttempts = 0;

    // BUG AW fix: guardar referencia local ANTES de anular yggstackProcess.
    // Sin esto, el forceKillTimer disparaba 3 s después con yggstackProcess === null,
    // haciendo imposible enviar SIGKILL a un proceso que no respondió a SIGTERM.
    // Un proceso colgado quedaba zombi hasta que el usuario matara manualmente la app.
    const proc = yggstackProcess;

    // Limpiar la referencia de módulo ahora para que nuevos spawns puedan arrancar
    yggstackProcess = null;
    detectedAddress = null;
    currentConfPath = null;
    stopPeerManager();

    // Forzar SIGKILL si el proceso no termina en 3 segundos tras SIGTERM
    const forceKillTimer = setTimeout(() => {
        warn('Process did not respond to SIGTERM → forcing SIGKILL…', undefined, 'yggstack');
        try { proc.kill('SIGKILL'); } catch { /* ya terminó */ }
    }, 3000);

    proc.once('exit', () => {
        clearTimeout(forceKillTimer);
        info('Sidecar stopped correctly', undefined, 'yggstack');
    });

    try {
        proc.kill('SIGTERM');
    } catch (err) {
        error('Error sending SIGTERM', err, 'yggstack');
        clearTimeout(forceKillTimer);
    }
}

// ── Helpers privados ─────────────────────────────────────────────────────────

/**
 * Intenta extraer una dirección IPv6 del rango 200::/7 del texto dado.
 * Si la encuentra (y aún no tenemos una dirección), almacena el valor y
 * notifica a todos los callbacks registrados.
 */
function tryExtractAddress(text: string): void {
    if (detectedAddress) return; // ya tenemos la dirección

    const match = YGG_IPV6_REGEX.exec(text);
    if (match) {
        detectedAddress = match[1];
        restartAttempts = 0;  // conexión establecida: resetear contador
        info(`Yggdrasil IPv6 address assigned: ${detectedAddress}`, undefined, 'yggstack');
        addressCallbacks.forEach(cb => cb(detectedAddress!));
        emitStatus('up', detectedAddress);
    }
}