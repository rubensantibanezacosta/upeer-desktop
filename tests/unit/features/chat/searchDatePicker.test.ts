import { describe, expect, it } from 'vitest';
import {
    buildMonthGrid,
    cursorOf,
    dayKeyFromLabel,
    dayLabelOfDate,
    monthLabel,
    shiftMonth,
    timestampOfDayKey,
    WEEKDAY_LABELS,
} from '../../../../src/features/chat/searchDatePicker.js';

describe('searchDatePicker', () => {
    it('etiqueta el mes en español', () => {
        expect(monthLabel({ year: 2026, month: 9 })).toBe('octubre 2026');
        expect(monthLabel({ year: 2027, month: 0 })).toBe('enero 2027');
    });

    it('retrocede y avanza de año al cambiar de mes', () => {
        expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
        expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    });

    it('coloca los días con la semana empezando en lunes', () => {
        const cells = buildMonthGrid({ year: 2026, month: 9 });
        expect(WEEKDAY_LABELS).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D']);
        expect(cells).toHaveLength(35);
        expect(cells[0]).toBeNull();
        expect(cells[3]?.day).toBe(1);
        expect(cells.filter(Boolean)).toHaveLength(31);
    });

    it('calcula el cursor y la etiqueta de un día', () => {
        const timestamp = new Date(2026, 9, 19, 15, 30).getTime();
        expect(cursorOf(timestamp)).toEqual({ year: 2026, month: 9 });
        expect(dayLabelOfDate(new Date(timestamp))).toBe('19/10/2026');
    });

    it('convierte entre etiqueta y clave de día', () => {
        expect(dayKeyFromLabel('19/10/2026')).toBe('2026-10-19');
        expect(dayKeyFromLabel('2026-10-19')).toBeNull();
        expect(timestampOfDayKey('2026-10-19')).toBe(new Date(2026, 9, 19).getTime());
        expect(timestampOfDayKey('sin-fecha')).toBeNull();
    });
});
