import { describe, it, expect } from 'vitest';
import {
    CHAT_STYLE_PRESETS,
    DEFAULT_CHAT_STYLE,
    chatStyleSx,
    getChatStylePreset,
    resolveChatStyleId,
} from '../../../../src/features/chat/style/chatStyle.js';

describe('chatStyle', () => {
    it('cae al estilo predeterminado cuando no hay valor o no existe', () => {
        expect(resolveChatStyleId(undefined)).toBe(DEFAULT_CHAT_STYLE);
        expect(resolveChatStyleId(null)).toBe(DEFAULT_CHAT_STYLE);
        expect(resolveChatStyleId('inventado')).toBe(DEFAULT_CHAT_STYLE);
        expect(resolveChatStyleId('')).toBe(DEFAULT_CHAT_STYLE);
    });

    it('acepta cada preset declarado', () => {
        for (const preset of CHAT_STYLE_PRESETS) {
            expect(resolveChatStyleId(preset.id)).toBe(preset.id);
            expect(getChatStylePreset(preset.id).label).toBe(preset.label);
        }
    });

    it('el predeterminado no pinta nada', () => {
        expect(chatStyleSx('default')).toEqual({});
        expect(chatStyleSx(undefined)).toEqual({});
    });

    it('los demás presets devuelven las capas en orden', () => {
        const preset = getChatStylePreset('ocean');
        const sx = chatStyleSx('ocean');

        expect(preset.layers.length).toBeGreaterThan(0);
        expect(sx.backgroundImage).toBe(preset.layers.join(', '));
    });

    it('todas las capas son degradados', () => {
        for (const preset of CHAT_STYLE_PRESETS) {
            for (const layer of preset.layers) {
                expect(layer).toMatch(/gradient\(/);
            }
        }
    });
});
