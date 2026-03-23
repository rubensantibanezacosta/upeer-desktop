import { describe, it, expect } from 'vitest';
import { toMediaUrl, fromMediaUrl } from '../../../src/utils/fileUtils.js';
import { getInlineVideoUnsupportedReason, isVideoFile, supportsInlineVideoPlayback } from '../../../src/utils/videoPlayback.js';

describe('toMediaUrl', () => {
    it('convierte ruta Linux absoluta', () => {
        expect(toMediaUrl('/home/user/assets/photo.jpg')).toBe('media:///home/user/assets/photo.jpg');
    });

    it('convierte ruta Windows con backslashes', () => {
        expect(toMediaUrl('C:\\Users\\user\\assets\\photo.jpg')).toBe('media://C/Users/user/assets/photo.jpg');
    });

    it('convierte ruta Windows con forward slashes', () => {
        expect(toMediaUrl('C:/Users/user/assets/photo.jpg')).toBe('media://C/Users/user/assets/photo.jpg');
    });

    it('no duplica el prefijo si ya es media://', () => {
        expect(toMediaUrl('media:///home/user/assets/photo.jpg')).toBe('media:///home/user/assets/photo.jpg');
    });

    it('no duplica el prefijo en URL Windows ya convertida', () => {
        expect(toMediaUrl('media://C/Users/user/photo.jpg')).toBe('media://C/Users/user/photo.jpg');
    });
});

describe('fromMediaUrl', () => {
    it('reconstruye ruta Linux desde media://', () => {
        expect(fromMediaUrl('media:///home/user/assets/photo.jpg')).toBe('/home/user/assets/photo.jpg');
    });

    it('reconstruye ruta Windows con letra de unidad', () => {
        expect(fromMediaUrl('media://C/Users/user/assets/photo.jpg')).toBe('C:/Users/user/assets/photo.jpg');
    });

    it('reconstruye ruta Windows con letra minúscula', () => {
        expect(fromMediaUrl('media://c/Users/user/assets/photo.jpg')).toBe('c:/Users/user/assets/photo.jpg');
    });

    it('devuelve el valor original si no empieza por media://', () => {
        expect(fromMediaUrl('/home/user/assets/photo.jpg')).toBe('/home/user/assets/photo.jpg');
    });

    it('decodifica espacios en la ruta', () => {
        expect(fromMediaUrl('media:///home/user/my%20assets/photo.jpg')).toBe('/home/user/my assets/photo.jpg');
    });

    it('es la inversa exacta de toMediaUrl en Linux', () => {
        const original = '/home/user/AppData/chat-p2p/assets/received/photo.jpg';
        expect(fromMediaUrl(toMediaUrl(original))).toBe(original);
    });

    it('es la inversa exacta de toMediaUrl en Windows (forward slashes)', () => {
        const original = 'C:/Users/user/AppData/Roaming/chat-p2p/assets/received/photo.jpg';
        expect(fromMediaUrl(toMediaUrl(original))).toBe(original);
    });
});

describe('videoPlayback', () => {
    it('detecta AVI como vídeo', () => {
        expect(isVideoFile('video/x-msvideo', 'clip.avi')).toBe(true);
    });

    it('marca AVI como no reproducible inline', () => {
        expect(supportsInlineVideoPlayback('video/x-msvideo', 'clip.avi')).toBe(false);
        expect(getInlineVideoUnsupportedReason('video/x-msvideo', 'clip.avi')).toContain('no es compatible');
    });

    it('mantiene MP4 como reproducible inline', () => {
        expect(supportsInlineVideoPlayback('video/mp4', 'clip.mp4')).toBe(true);
        expect(getInlineVideoUnsupportedReason('video/mp4', 'clip.mp4')).toBeNull();
    });
});
