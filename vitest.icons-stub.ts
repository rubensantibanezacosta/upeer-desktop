import type { Plugin } from 'vite';

const VIRTUAL_PREFIX = '\0upeer-icons/';
const ICON_REQUEST = /^@mui\/icons-material\/([A-Za-z][A-Za-z0-9]*)$/;

function renderStub(name: string): string {
    return [
        "import React from 'react';",
        "export default function Icon(props) {",
        "    const { sx, fontSize, color, children, ...rest } = props ?? {};",
        `    return React.createElement('span', { 'data-testid': '${name}Icon', ...rest });`,
        "}",
    ].join('\n');
}

export function iconsStubPlugin(): Plugin {
    return {
        name: 'upeer-icons-stub',
        enforce: 'pre',
        resolveId(id) {
            const match = ICON_REQUEST.exec(id);
            if (!match) return null;
            return VIRTUAL_PREFIX + match[1];
        },
        load(id) {
            if (!id.startsWith(VIRTUAL_PREFIX)) return null;
            return renderStub(id.slice(VIRTUAL_PREFIX.length));
        },
    };
}
