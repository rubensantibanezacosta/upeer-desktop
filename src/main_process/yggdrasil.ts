import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import sudo from '@vscode/sudo-prompt';
import { getNetworkAddress } from './network.js';

const YGG_VERSION = 'v0.5.12';

export async function manageYggdrasilInstance(): Promise<void> {
    // Verificar si ya existe una instancia de Yggdrasil corriendo en el sistema
    const existingAddress = getNetworkAddress();
    if (existingAddress) {
        console.log(`[Yggdrasil] Instancia global detectada con IPv6: ${existingAddress}. Omitiendo lanzamiento del Sidecar interno.`);
        return;
    }

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

        // Insert public peers to bootstrap
        const modConf = genconf.replace(
            /(Peers: \[)(.*?)(\])/s,
            `$1\n    "tls://ygg.mkg20001.io:443",\n    "tcp://ygg.tomasgl.ru:10526"\n  $3`
        );
        fs.writeFileSync(confPath, modConf);
        console.log('[Yggdrasil] Configuración generada.');
    }

    console.log('[Yggdrasil] Iniciando proceso local (requerirá permisos de superusuario para crear la red mesh)...');

    return new Promise<void>((resolve, reject) => {
        // Ejecución con privilegios elevados
        const cmd = process.platform === 'win32'
            ? `cd "${userDataPath}" && "${yggPath}" -useconffile "${confPath}"`
            // En Linux/Mac, le pedimos al shell que guarde el PID en el archivo
            : `sh -c '"${yggPath}" -useconffile "${confPath}" > "${userDataPath}/ygg.log" 2>&1 & echo $! > "${pidPath}"'`;

        sudo.exec(cmd, { name: 'RevelNet (Habilitar conexión a la red distribuida)' }, (error, stdout, stderr) => {
            if (error) {
                console.error('[Yggdrasil] Error de inicio:', error);

                // Si el sudo falla, intentar sin sudo (por si IfName: none está configurado)
                // Pero como necesitamos interfaz TUN, fallará en routing.
                reject(error);
                return;
            }
            console.log('[Yggdrasil] Lanzado en background.');

            // Damos unos segundos para que se establezca la interfaz
            setTimeout(resolve, 3000);
        });
    });
}

export function stopYggdrasil() {
    const pidPath = path.join(app.getPath('userData'), 'ygg.pid');
    if (fs.existsSync(pidPath)) {
        const pid = fs.readFileSync(pidPath, 'utf8').trim();
        if (!pid) return;

        console.log(`[Yggdrasil] Deteniendo proceso ${pid}...`);

        // El proceso se ejecutó con root, por lo que requeriremos terminarlo
        const killCmd = process.platform === 'win32'
            ? `taskkill /PID ${pid} /F`
            : `kill -9 ${pid}`;

        sudo.exec(killCmd, { name: 'RevelNet' }, (error) => {
            if (error) {
                console.error('[Yggdrasil] Error al detener:', error);
                // Fallback si no hay sudo prompt
                try { process.kill(parseInt(pid), 9); } catch (e) { }
            } else {
                console.log('[Yggdrasil] Proceso detenido con éxito.');
            }
            try { fs.unlinkSync(pidPath); } catch (e) { }
        });
    }
}
