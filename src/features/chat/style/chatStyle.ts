export type ChatStyleId = 'default' | 'ocean' | 'forest' | 'sunset' | 'night' | 'paper';

export interface ChatStylePreset {
    id: ChatStyleId;
    label: string;
    description: string;
    layers: readonly string[];
}

export const CHAT_STYLE_PRESETS: readonly ChatStylePreset[] = [
    {
        id: 'default',
        label: 'Predeterminado',
        description: 'El fondo del tema, sin mezcla',
        layers: [],
    },
    {
        id: 'ocean',
        label: 'Océano',
        description: 'Azul y turquesa',
        layers: [
            'radial-gradient(120% 90% at 10% 0%, rgba(56, 132, 255, 0.22), transparent 62%)',
            'radial-gradient(110% 85% at 90% 100%, rgba(0, 198, 190, 0.18), transparent 60%)',
        ],
    },
    {
        id: 'forest',
        label: 'Bosque',
        description: 'Verde y oliva',
        layers: [
            'radial-gradient(120% 95% at 15% 5%, rgba(46, 170, 110, 0.20), transparent 60%)',
            'radial-gradient(100% 80% at 85% 95%, rgba(150, 190, 70, 0.16), transparent 58%)',
        ],
    },
    {
        id: 'sunset',
        label: 'Atardecer',
        description: 'Naranja y rosa',
        layers: [
            'radial-gradient(125% 95% at 12% 0%, rgba(255, 138, 64, 0.20), transparent 60%)',
            'radial-gradient(110% 85% at 88% 100%, rgba(228, 74, 140, 0.18), transparent 62%)',
        ],
    },
    {
        id: 'night',
        label: 'Noche',
        description: 'Índigo y violeta',
        layers: [
            'radial-gradient(120% 90% at 8% 0%, rgba(96, 96, 240, 0.24), transparent 62%)',
            'radial-gradient(110% 85% at 92% 100%, rgba(170, 80, 220, 0.20), transparent 60%)',
        ],
    },
    {
        id: 'paper',
        label: 'Papel',
        description: 'Rayado tenue',
        layers: [
            'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.035) 0 2px, transparent 2px 12px)',
            'radial-gradient(120% 100% at 50% 0%, rgba(160, 160, 170, 0.14), transparent 70%)',
        ],
    },
];

export const DEFAULT_CHAT_STYLE: ChatStyleId = 'default';

const PRESET_BY_ID = new Map<string, ChatStylePreset>(CHAT_STYLE_PRESETS.map((preset) => [preset.id, preset]));

export function resolveChatStyleId(value?: string | null): ChatStyleId {
    if (value && PRESET_BY_ID.has(value)) {
        return value as ChatStyleId;
    }
    return DEFAULT_CHAT_STYLE;
}

export function getChatStylePreset(value?: string | null): ChatStylePreset {
    return PRESET_BY_ID.get(resolveChatStyleId(value)) ?? CHAT_STYLE_PRESETS[0];
}

export function chatStyleSx(value?: string | null): { backgroundImage?: string } {
    const preset = getChatStylePreset(value);
    if (preset.layers.length === 0) {
        return {};
    }

    return { backgroundImage: preset.layers.join(', ') };
}
