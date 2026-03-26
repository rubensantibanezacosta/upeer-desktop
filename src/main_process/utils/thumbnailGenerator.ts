import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';
import { error as logError } from '../security/secure-logger.js';

/**
 * Genera una miniatura de un video usando ffmpeg
 * @param videoPath Ruta absoluta al archivo de video
 * @returns Data URL de la imagen generada (JPEG)
 */
export async function generateVideoThumbnail(videoPath: string): Promise<string> {
    const tempDir = app.getPath('temp');
    const outputPath = path.join(tempDir, `thumb_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);

    return new Promise((resolve, reject) => {
        // Ejecutar ffmpeg para extraer un frame del segundo 1 (o el que sea representativo)
        // -ss 00:00:01: buscar el segundo 1
        // -i videoPath: archivo de entrada
        // -vframes 1: extraer solo 1 frame
        // -q:v 2: calidad de la imagen
        // -vf scale=320:-1: escalar a 320px de ancho manteniendo aspect ratio
        const ffmpeg = spawn('ffmpeg', [
            '-ss', '00:00:01',
            '-i', videoPath,
            '-vframes', '1',
            '-q:v', '5',
            '-vf', 'scale=320:-1',
            '-f', 'image2',
            '-y', // Sobrescribir si existe
            outputPath
        ]);

        let stderr = '';
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        const timeout = setTimeout(() => {
            ffmpeg.kill();
            reject(new Error(`ffmpeg thumbnail generation timed out. Stderr: ${stderr}`));
        }, 10000);

        ffmpeg.on('close', async (code) => {
            if (code === 0) {
                clearTimeout(timeout);
                try {
                    const buffer = await fs.readFile(outputPath);
                    const base64 = buffer.toString('base64');
                    const dataUrl = `data:image/jpeg;base64,${base64}`;
                    fs.unlink(outputPath).catch(() => { });
                    resolve(dataUrl);
                } catch (err) {
                    reject(err);
                }
            } else {
                logError('[Thumbnail] ffmpeg primer intento falló', { code, stderr });
                // Reintento en el segundo 0
                const ffmpegRetry = spawn('ffmpeg', [
                    '-i', videoPath,
                    '-vframes', '1',
                    '-q:v', '5',
                    '-vf', 'scale=320:-1',
                    '-f', 'image2',
                    '-y',
                    outputPath
                ]);

                let retryStderr = '';
                ffmpegRetry.stderr.on('data', (data) => {
                    retryStderr += data.toString();
                });

                ffmpegRetry.on('close', async (retryCode) => {
                    clearTimeout(timeout);
                    if (retryCode === 0) {
                        try {
                            const buffer = await fs.readFile(outputPath);
                            const base64 = buffer.toString('base64');
                            const dataUrl = `data:image/jpeg;base64,${base64}`;
                            fs.unlink(outputPath).catch(() => { });
                            resolve(dataUrl);
                        } catch (err) {
                            reject(err);
                        }
                    } else {
                        logError('[Thumbnail] ffmpeg reintento falló', { code: retryCode, stderr: retryStderr });
                        reject(new Error(`ffmpeg retry failed with code ${retryCode}. Stderr: ${retryStderr}`));
                    }
                });

                ffmpegRetry.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            }
        });

        ffmpeg.on('error', (err) => {
            clearTimeout(timeout);
            logError('[Thumbnail] Error al ejecutar ffmpeg', { err: String(err), stderr });
            reject(err);
        });
    });
}
