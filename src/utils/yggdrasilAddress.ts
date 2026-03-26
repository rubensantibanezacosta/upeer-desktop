function expandIPv6(address: string): string | null {
    const candidate = address.trim().toLowerCase();
    if (!candidate || candidate.includes('.')) return null;

    const parts = candidate.split('::');
    if (parts.length > 2) return null;

    const parseSegments = (value: string): string[] | null => {
        if (!value) return [];
        const segments = value.split(':');
        if (segments.some(segment => !/^[0-9a-f]{1,4}$/i.test(segment))) return null;
        return segments;
    };

    const left = parseSegments(parts[0]);
    const right = parseSegments(parts[1] ?? '');
    if (!left || !right) return null;

    if (parts.length === 1) {
        if (left.length !== 8) return null;
        return left.map(segment => segment.padStart(4, '0')).join(':');
    }

    const missingSegments = 8 - (left.length + right.length);
    if (missingSegments < 1) return null;

    return [...left, ...Array.from({ length: missingSegments }, () => '0'), ...right]
        .map(segment => segment.padStart(4, '0'))
        .join(':');
}

export function isValidIPv6Address(address: string): boolean {
    return expandIPv6(address) !== null;
}

export function isYggdrasilAddress(address: string): boolean {
    const expanded = expandIPv6(address);
    if (!expanded) return false;

    const firstHextet = Number.parseInt(expanded.slice(0, 4), 16);
    return Number.isFinite(firstHextet) && firstHextet >= 0x0200 && firstHextet <= 0x03ff;
}