const ROW_SELECTOR = '[data-search-row]';

export const searchRows = (container: HTMLElement | null): HTMLElement[] =>
    container ? Array.from(container.querySelectorAll<HTMLElement>(ROW_SELECTOR)) : [];

export const closestSearchRow = (target: EventTarget | null): HTMLElement | null =>
    target instanceof HTMLElement ? target.closest<HTMLElement>(ROW_SELECTOR) : null;

export const moveSearchFocus = (container: HTMLElement | null, delta: number, from?: HTMLElement | null): boolean => {
    const rows = searchRows(container);
    if (rows.length === 0) return false;
    const current = from ? rows.indexOf(from) : -1;
    const next = current === -1
        ? (delta > 0 ? 0 : rows.length - 1)
        : Math.min(rows.length - 1, Math.max(0, current + delta));
    rows[next].focus();
    return true;
};

export const activateSearchRow = (row: HTMLElement | null): boolean => {
    const target = row?.querySelector<HTMLElement>('button, [role="button"], a');
    if (!target) return false;
    target.click();
    return true;
};
