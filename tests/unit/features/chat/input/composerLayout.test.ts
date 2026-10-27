import { describe, expect, it } from 'vitest';
import {
    CHAT_COMPOSER_ACTION_SIZE,
    CHAT_COMPOSER_BAR_HEIGHT,
    CHAT_COMPOSER_ICON_SIZE,
    CHAT_COMPOSER_PILL_HEIGHT,
    CHAT_COMPOSER_PILL_PADDING,
    CHAT_COMPOSER_SEND_SIZE,
    CHAT_COMPOSER_STAGE_PADDING,
} from '../../../../../src/features/chat/input/composerLayout';

describe('Composer geometry', () => {
    it('keeps the same gap above and to the side of every pill action', () => {
        expect(CHAT_COMPOSER_PILL_HEIGHT - CHAT_COMPOSER_ACTION_SIZE).toBe(8);
        expect(CHAT_COMPOSER_PILL_PADDING).toBe(4);
        expect((CHAT_COMPOSER_PILL_HEIGHT - CHAT_COMPOSER_ACTION_SIZE) / 2).toBe(CHAT_COMPOSER_PILL_PADDING);
    });

    it('fits the send button in the bar without clipping it', () => {
        expect(CHAT_COMPOSER_SEND_SIZE).toBe(CHAT_COMPOSER_PILL_HEIGHT);
        expect(CHAT_COMPOSER_BAR_HEIGHT - CHAT_COMPOSER_SEND_SIZE).toBe(CHAT_COMPOSER_STAGE_PADDING * 2);
    });

    it('leaves room for the icon inside the action button', () => {
        expect(CHAT_COMPOSER_ICON_SIZE).toBeLessThan(CHAT_COMPOSER_ACTION_SIZE);
        expect(CHAT_COMPOSER_ACTION_SIZE - CHAT_COMPOSER_ICON_SIZE).toBeGreaterThanOrEqual(12);
    });
});
