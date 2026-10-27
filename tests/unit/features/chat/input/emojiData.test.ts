import { describe, it, expect } from 'vitest';

import { CATEGORY_KEYS, EMOJI_CATEGORIES, RECENT_LIMIT, TAB_KEYS, pushRecentEmoji, searchEmojis } from '../../../../../src/features/chat/input/emojiData';

describe('emojiData', () => {
    it('pone Recientes como primera pestaña y despues las categorias', () => {
        expect(TAB_KEYS[0]).toBe('recent');
        expect(TAB_KEYS.slice(1)).toEqual(CATEGORY_KEYS);
        expect(CATEGORY_KEYS).toHaveLength(8);
    });

    it('busca por nombre de categoria', () => {
        const results = searchEmojis('comida');
        expect(results).toEqual(EMOJI_CATEGORIES.food.emojis);
    });

    it('busca un emoji literal en todo el catalogo', () => {
        expect(searchEmojis('🍕')).toContain('🍕');
    });

    it('no devuelve nada con una consulta vacia o sin coincidencias', () => {
        expect(searchEmojis('   ')).toEqual([]);
        expect(searchEmojis('zzzz')).toEqual([]);
    });

    it('mueve el emoji al principio de los recientes sin duplicarlo', () => {
        expect(pushRecentEmoji(['👍', '❤️'], '❤️')).toEqual(['❤️', '👍']);
        expect(pushRecentEmoji([], '🙏')).toEqual(['🙏']);
    });

    it('recorta los recientes al limite', () => {
        const full = Array.from({ length: RECENT_LIMIT }, (_, index) => `e${index}`);
        const next = pushRecentEmoji(full, 'nuevo');
        expect(next).toHaveLength(RECENT_LIMIT);
        expect(next[0]).toBe('nuevo');
    });
});
