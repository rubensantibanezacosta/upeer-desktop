
export function mergeAddresses(currentJson: string | null | undefined, primary: string, others?: string[]): string {
    let known: string[] = [];
    try {
        known = JSON.parse(currentJson ?? '[]');
    } catch {
        known = [];
    }

    const incoming = others ? [...others] : [];
    if (!incoming.includes(primary)) {
        incoming.push(primary);
    }

    for (const addr of incoming) {
        const idx = known.indexOf(addr);
        if (idx !== -1) {
            known.splice(idx, 1);
        }
        known.unshift(addr);
    }

    // Asegurar que la dirección primaria sea la primera
    const pIdx = known.indexOf(primary);
    if (pIdx !== -1) {
        known.splice(pIdx, 1);
        known.unshift(primary);
    }

    if (known.length > 20) {
        known = known.slice(0, 20);
    }

    return JSON.stringify(known);
}
