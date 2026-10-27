import { dayKeyOf, dayLabelOf } from './chatSearchResults.js';

export interface CalendarDay {
    key: string;
    day: number;
    month: number;
    year: number;
    timestamp: number;
}

export interface MonthCursor {
    year: number;
    month: number;
}

const MONTH_NAMES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export const monthLabel = ({ year, month }: MonthCursor): string =>
    `${MONTH_NAMES[month]} ${year}`;

export const cursorOf = (timestamp: number): MonthCursor => {
    const date = new Date(timestamp);
    return { year: date.getFullYear(), month: date.getMonth() };
};

export const shiftMonth = ({ year, month }: MonthCursor, delta: number): MonthCursor => {
    const shifted = new Date(year, month + delta, 1);
    return { year: shifted.getFullYear(), month: shifted.getMonth() };
};

export const dayKeyOfDate = (date: Date): string => dayKeyOf(date.getTime());

export const dayLabelOfDate = (date: Date): string => dayLabelOf(date.getTime());

export const dayKeyFromLabel = (label: string): string | null => {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(label);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};

export const timestampOfDayKey = (key: string): number | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
};

export const buildMonthGrid = ({ year, month }: MonthCursor): (CalendarDay | null)[] => {
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: (CalendarDay | null)[] = Array.from({ length: firstWeekday }, () => null);

    for (let day = 1; day <= totalDays; day += 1) {
        const date = new Date(year, month, day);
        cells.push({
            key: dayKeyOfDate(date),
            day,
            month,
            year,
            timestamp: date.getTime(),
        });
    }

    while (cells.length % 7 !== 0) {
        cells.push(null);
    }

    return cells;
};
