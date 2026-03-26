import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { exec } from 'node:child_process';
import { info } from '../security/secure-logger.js';
import { initPeerManager, setOnPeersChanged } from './peer-manager.js';
import { yggstackState } from './yggstackState.js';

export function resolveYggstackPath(): string {
    const platformFolder = `${process.platform}-${process.arch}`;
    const exeName = process.platform === 'win32' ? 'yggstack.exe' : 'yggstack';
    const resourcesBasePath = app.isPackaged
        ? path.join(process.resourcesPath, 'bin')
        : path.join(app.getAppPath(), 'resources', 'bin');

    return path.join(resourcesBasePath, platformFolder, exeName);
}

export function updatePeersInConfig(confPath: string, peers: string[]): void {
    if (!fs.existsSync(confPath)) {
        return;
    }

    const peersHjson = peers.map(peer => `    "${peer}"`).join('\n');
    const updatedConf = fs.readFileSync(confPath, 'utf8').replace(/(Peers:\s*\[)([\s\S]*?)(\])/, `$1\n${peersHjson}\n  $3`);
    fs.writeFileSync(confPath, updatedConf, 'utf8');
    info(`Peers updated in config (${peers.length} nodes) — effective on next restart`, undefined, 'yggstack');
}

export async function ensureConfig(yggstackPath: string): Promise<string> {
    const userDataPath = app.getPath('userData');
    const confPath = path.join(userDataPath, 'yggstack.conf');
    yggstackState.currentConfPath = confPath;

    const peers = await initPeerManager(userDataPath);
    const peersHjson = peers.map(peer => `    "${peer}"`).join('\n');

    setOnPeersChanged((nextPeers) => {
        if (yggstackState.currentConfPath) {
            updatePeersInConfig(yggstackState.currentConfPath, nextPeers);
        }
    });

    if (fs.existsSync(confPath)) {
        info(`Updating peers in existing config: ${confPath}`, undefined, 'yggstack');
        const updatedConf = fs.readFileSync(confPath, 'utf8').replace(/(Peers:\s*\[)([\s\S]*?)(\])/, `$1\n${peersHjson}\n  $3`);
        fs.writeFileSync(confPath, updatedConf, 'utf8');
        return confPath;
    }

    info('Generating initial configuration…', undefined, 'yggstack');
    const generatedConf = await new Promise<string>((resolve, reject) => {
        exec(`"${yggstackPath}" -genconf`, { encoding: 'utf8' }, (err, stdout) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(stdout);
        });
    });

    const conf = generatedConf
        .replace(/(Peers:\s*\[)([\s\S]*?)(\])/, `$1\n${peersHjson}\n  $3`)
        .replace(/AdminListen:\s*.*/, 'AdminListen: none');

    fs.writeFileSync(confPath, conf, 'utf8');
    info(`Config saved to: ${confPath}`, undefined, 'yggstack');
    return confPath;
}