import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { exec, spawn } from 'node:child_process';
import sudo from '@vscode/sudo-prompt';
import { getNetworkAddress } from '../network/utils.js';

const YGG_VERSION = 'v0.5.12';

/**
 * Verifica si existe un servicio Yggdrasil de sistema activo
 * Esto puede ser un servicio systemd o una instancia global ya corriendo
 */
export async function isSystemYggdrasilAvailable(): Promise<boolean> {
    // Primero verificar si ya hay una interfaz ygg0 activa
    const existingAddress = getNetworkAddress();
    if (existingAddress) {
        console.log(`[Yggdrasil] Instancia global detectada con IPv6: ${existingAddress}`);
        return true;
    }
    
    // Para Linux, verificar si el servicio systemd está activo
    if (process.platform === 'linux') {
        try {
            const checkService = () => {
                return new Promise<boolean>((resolve) => {
                    exec('systemctl is-active revelnest-yggdrasil.service', (error, stdout) => {
                        if (!error && stdout.toString().trim() === 'active') {
                            console.log('[Yggdrasil] Servicio systemd revelnest-yggdrasil está activo');
                            resolve(true);
                        } else {
                            // También verificar si el servicio existe aunque no esté activo
                            exec('systemctl list-unit-files | grep revelnest-yggdrasil', (err) => {
                                if (!err) {
                                    console.log('[Yggdrasil] Servicio systemd instalado pero no activo');
                                    resolve(false);
                                } else {
                                    resolve(false);
                                }
                            });
                        }
                    });
                });
            };
            
            return await checkService();
        } catch (error) {
            console.log('[Yggdrasil] Error verificando servicio systemd:', error);
            return false;
        }
    }
    
    return false;
}

/**
 * Intenta activar el servicio systemd si está instalado pero no activo
 */
export async function activateSystemYggdrasil(): Promise<boolean> {
    if (process.platform !== 'linux') {
        return false;
    }
    
    try {
        return new Promise<boolean>((resolve) => {
            console.log('[Yggdrasil] Intentando activar servicio systemd...');
            exec('sudo systemctl start revelnest-yggdrasil.service', (error) => {
                if (error) {
                    console.log('[Yggdrasil] No se pudo activar el servicio systemd:', error.message);
                    resolve(false);
                } else {
                    // Esperar un momento para que el servicio se inicie
                    setTimeout(async () => {
                        const isActive = await isSystemYggdrasilAvailable();
                        if (isActive) {
                            console.log('[Yggdrasil] Servicio systemd activado correctamente');
                        }
                        resolve(isActive);
                    }, 2000);
                }
            });
        });
    } catch (error) {
        console.log('[Yggdrasil] Error activando servicio systemd:', error);
        return false;
    }
}

export async function manageYggdrasilInstance(): Promise<void> {
    // Estrategia mejorada: primero verificar servicios del sistema
    console.log('[Yggdrasil] Preparando conexión a la red descentralizada RevelNest...');
    
    // 1. Verificar si ya hay una instancia activa (interfaz ygg0)
    const existingAddress = getNetworkAddress();
    if (existingAddress) {
        console.log(`[Yggdrasil] Red mesh ya activa con IPv6: ${existingAddress}`);
        return;
    }
    
    // 2. Verificar servicios systemd (solo Linux)
    if (process.platform === 'linux') {
        const systemServiceAvailable = await isSystemYggdrasilAvailable();
        if (systemServiceAvailable) {
            console.log('[Yggdrasil] Usando servicio de sistema para red mesh');
            return;
        }
        
        // Intentar activar el servicio si está instalado
        const activated = await activateSystemYggdrasil();
        if (activated) {
            console.log('[Yggdrasil] Servicio de sistema activado correctamente');
            return;
        }
        
        console.log('[Yggdrasil] No hay servicio de sistema disponible. Usando modo aplicación.');
        console.log('[Yggdrasil] Nota: Para mejor experiencia, instale el paquete completo del sistema.');
    }
    
    // 3. Fallback al sidecar embebido
    console.log('[Yggdrasil] Configurando red mesh en modo aplicación...');
    
    const userDataPath = app.getPath('userData');
    const confPath = path.join(userDataPath, 'yggdrasil.conf');
    const pidPath = path.join(userDataPath, 'ygg.pid');

    // Determinar plataforma y binario a usar
    const platformFolder = `${process.platform}-${process.arch}`;
    const exeName = process.platform === 'win32' ? 'yggdrasil.exe' : 'yggdrasil';

    // En desarrollo (npm start), app.isPackaged es false y app.getAppPath() apunta a la raíz del proyecto
    // En producción (binario empaquetado), app.isPackaged es true y usamos process.resourcesPath
    const resourcesBasePath = app.isPackaged
        ? path.join(process.resourcesPath, 'bin')
        : path.join(app.getAppPath(), 'resources', 'bin');

    let yggPath = path.join(resourcesBasePath, platformFolder, exeName);

    if (!fs.existsSync(yggPath)) {
        throw new Error(`[Yggdrasil] Archivo de sidecar no encontrado en el paquete: ${yggPath}. Por favor compila/ubica los binarios en resources/bin.`);
    }

    console.log(`[Yggdrasil] Usando ejecutable empaquetado Sidecar: ${yggPath}`);

    if (!fs.existsSync(confPath)) {
        console.log('[Yggdrasil] Generando configuración...');
        const genconf = await new Promise<string>((resolve, reject) => {
            exec(`"${yggPath}" -genconf`, { encoding: 'utf8' }, (err, stdout) => {
                if (err) reject(err);
                else resolve(stdout);
            });
        });

        // Personalización de la configuración para asegurar estabilidad
        let modConf = genconf.replace(
            /(Peers: \[)([\s\S]*?)(\])/,
            `$1\n    "tls://ygg.mkg20001.io:443",\n    "tcp://ygg.tomasgl.ru:10526"\n  $3`
        );

        // Desactivar AdminListen para evitar errores de permisos/directorios inexistentes
        modConf = modConf.replace(/AdminListen: .*/, 'AdminListen: none');
        // Forzar nombre de interfaz coherente
        modConf = modConf.replace(/IfName: .*/, 'IfName: ygg0');

        fs.writeFileSync(confPath, modConf);
        console.log('[Yggdrasil] Configuración generada.');
    }

    // Asegurar que la configuración existente tenga AdminListen: none e IfName: ygg0
    let configContent = fs.readFileSync(confPath, 'utf8');
    let newContent = configContent;
    
    // Reemplazar AdminListen si existe, si no agregarlo después de IfName: ygg0
    if (!newContent.includes('AdminListen:')) {
        // Buscar IfName: ygg0 y agregar AdminListen después
        const ifNameRegex = /IfName: ygg0/;
        const match = ifNameRegex.exec(newContent);
        if (match) {
            const insertPos = match.index + match[0].length;
            newContent = newContent.slice(0, insertPos) + '\n  AdminListen: none' + newContent.slice(insertPos);
        }
    } else {
        newContent = newContent.replace(/AdminListen: .*/, 'AdminListen: none');
    }
    
    // Asegurar IfName: ygg0
    newContent = newContent.replace(/IfName: .*/, 'IfName: ygg0');
    
    if (newContent !== configContent) {
        fs.writeFileSync(confPath, newContent);
        console.log('[Yggdrasil] Configuración actualizada.');
    }

    console.log('[Yggdrasil] Preparando conexión a la red descentralizada RevelNest...');
    console.log('[Yggdrasil] Nota: Se requieren permisos de administrador para crear una red privada segura.');

    return new Promise<void>((resolve, reject) => {
        // Función auxiliar para limpiar archivos propiedad de root
        const cleanRootOwnedFiles = () => {
            try {
                const stat = fs.statSync(pidPath);
                if (stat && (stat.uid === 0 || (stat.mode & 0o200) === 0)) {
                    console.log('[Yggdrasil] Eliminando archivo PID de root...');
                    fs.unlinkSync(pidPath);
                }
            } catch (e) { /* File doesn't exist or can't stat */ }
            
            try {
                const stat = fs.statSync(path.join(userDataPath, 'ygg.log'));
                if (stat && (stat.uid === 0 || (stat.mode & 0o200) === 0)) {
                    console.log('[Yggdrasil] Eliminando archivo log de root...');
                    fs.unlinkSync(path.join(userDataPath, 'ygg.log'));
                }
            } catch (e) { /* File doesn't exist or can't stat */ }
        };

        // Función para ejecutar Yggdrasil sin privilegios elevados
        const spawnWithoutSudo = (): Promise<void> => {
            return new Promise((spawnResolve, spawnReject) => {
                console.log('[Yggdrasil] Intentando conexión con permisos estándar...');
                
                cleanRootOwnedFiles();
                
                if (process.platform === 'win32') {
                    const cmd = `cd "${userDataPath}" && start /B "${yggPath}" -useconffile "${confPath}"`;
                    exec(cmd, { cwd: userDataPath }, (error) => {
                        if (error) {
                            spawnReject(error);
                        } else {
                            console.log('[Yggdrasil] Lanzado en background (modo estándar).');
                            setTimeout(spawnResolve, 3000);
                        }
                    });
                } else {
                    // Linux/Mac: use spawn
                    const child = spawn(yggPath, ['-useconffile', confPath], {
                        cwd: userDataPath,
                        detached: true,
                        stdio: ['ignore', 'pipe', 'pipe']
                    });
                    
                    if (!child?.pid) {
                        spawnReject(new Error('No se pudo crear el proceso Yggdrasil'));
                        return;
                    }
                    
                    // Write PID to file
                    fs.writeFileSync(pidPath, child.pid.toString());
                    
                    child.unref(); // Allow parent to exit independently
                    
                    // Collect stderr to detect early failures
                    let stderrData = '';
                    child.stderr?.on('data', (data) => {
                        stderrData += data.toString();
                        // Check for fatal errors
                        if (stderrData.includes('operation not permitted') || 
                            stderrData.includes('failed to create TUN') ||
                            stderrData.includes('panic:')) {
                            console.error('[Yggdrasil] Error crítico detectado:', stderrData);
                            // Kill the child process if it's still running
                            try { if (child?.pid) process.kill(child.pid, 'SIGKILL'); } catch (e) {}
                            spawnReject(new Error('Yggdrasil falló al crear la interfaz de red'));
                        }
                    });
                    
                    // Log output to file
                    const logStream = fs.createWriteStream(path.join(userDataPath, 'ygg.log'), { flags: 'a' });
                    child.stdout?.pipe(logStream);
                    child.stderr?.pipe(logStream);
                    
                    console.log('[Yggdrasil] Lanzado en background (PID: %d).', child.pid);
                    
                    // Check if process is still alive after a short delay
                    setTimeout(() => {
                        try {
                            if (child.pid) {
                                process.kill(child.pid, 0); // Check if process exists
                                // Process is still running
                                spawnResolve();
                            } else {
                                spawnReject(new Error('No se encontró el PID del proceso'));
                            }
                        } catch (err) {
                            // Process died
                            spawnReject(new Error('El proceso Yggdrasil terminó prematuramente'));
                        }
                    }, 2000);
                }
            });
        };

        // Función para ejecutar con sudo (solo si es necesario)
        const runWithSudo = (): Promise<void> => {
            return new Promise((sudoResolve, sudoReject) => {
                console.log('[Yggdrasil] Se requieren permisos de administrador para la red privada.');
                console.log('[Yggdrasil] Se mostrará un diálogo para ingresar su contraseña.');
                
                const cmd = process.platform === 'win32'
                    ? `cd "${userDataPath}" && "${yggPath}" -useconffile "${confPath}"`
                    : `sh -c '"${yggPath}" -useconffile "${confPath}" > "${userDataPath}/ygg.log" 2>&1 & echo $! > "${pidPath}"'`;

                try {
                    sudo.exec(cmd, { name: 'RevelNest Secure Network' }, (error, stdout, stderr) => {
                        if (error) {
                            console.error('[Yggdrasil] Error con permisos elevados:', error);
                            sudoReject(error);
                        } else {
                            console.log('[Yggdrasil] Lanzado con permisos elevados.');
                            setTimeout(sudoResolve, 3000);
                        }
                    });
                } catch (sudoError) {
                    console.error('[Yggdrasil] Error síncrono en sudo.exec:', sudoError);
                    sudoReject(sudoError);
                }
            });
        };

        // Estrategia: Primero intentar sin sudo, luego con sudo si falla
        spawnWithoutSudo()
            .then(() => {
                console.log('[Yggdrasil] Red descentralizada lista.');
                resolve();
            })
            .catch((spawnError) => {
                console.log('[Yggdrasil] Falló el modo estándar:', spawnError.message);
                console.log('[Yggdrasil] Intentando con permisos elevados...');
                
                runWithSudo()
                    .then(() => {
                        console.log('[Yggdrasil] Red descentralizada lista (con permisos elevados).');
                        resolve();
                    })
                    .catch((sudoError) => {
                        console.error('[Yggdrasil] No se pudo iniciar Yggdrasil:', sudoError.message);
                        reject(new Error(`No se pudo establecer la red descentralizada: ${sudoError.message}`));
                    });
            });
    });
}

export function stopYggdrasil() {
    const pidPath = path.join(app.getPath('userData'), 'ygg.pid');
    if (fs.existsSync(pidPath)) {
        const pid = fs.readFileSync(pidPath, 'utf8').trim();
        if (!pid) return;

        console.log(`[Yggdrasil] Deteniendo proceso ${pid}...`);

        // Try to kill without sudo first
        const killCmd = process.platform === 'win32'
            ? `taskkill /PID ${pid} /F`
            : `kill -9 ${pid} 2>/dev/null || sudo kill -9 ${pid}`;

        exec(killCmd, (error) => {
            if (error) {
                console.error('[Yggdrasil] Error al detener:', error.message);
                // Try alternative approach
                try { process.kill(parseInt(pid), 9); } catch (e) { }
            } else {
                console.log('[Yggdrasil] Proceso detenido con éxito.');
            }
            try { fs.unlinkSync(pidPath); } catch (e) { }
        });
    }
}
