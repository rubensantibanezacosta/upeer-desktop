import { describe, it, expect } from 'vitest';
import {
    BUBBLE_JOIN_RADIUS,
    BUBBLE_RADIUS,
    BUBBLE_TAIL_RADIUS,
    bubbleRadiusSx,
    resolveBubbleCorners,
} from '../../../../../src/features/chat/message/bubbleShape.js';

describe('bubbleShape', () => {
    it('deja la cola arriba y el resto redondeado cuando el mensaje va solo', () => {
        expect(resolveBubbleCorners({ isMine: true, isFirstInGroupChain: true, isLastInGroupChain: true }))
            .toEqual({ topLeft: BUBBLE_RADIUS, topRight: BUBBLE_TAIL_RADIUS, bottomLeft: BUBBLE_RADIUS, bottomRight: BUBBLE_RADIUS });
        expect(resolveBubbleCorners({ isMine: false, isFirstInGroupChain: true, isLastInGroupChain: true }))
            .toEqual({ topLeft: BUBBLE_TAIL_RADIUS, topRight: BUBBLE_RADIUS, bottomLeft: BUBBLE_RADIUS, bottomRight: BUBBLE_RADIUS });
    });

    it('pega la esquina inferior cuando hay otro mensaje del mismo remitente debajo', () => {
        expect(resolveBubbleCorners({ isMine: true, isFirstInGroupChain: true, isLastInGroupChain: false }))
            .toEqual({ topLeft: BUBBLE_RADIUS, topRight: BUBBLE_TAIL_RADIUS, bottomLeft: BUBBLE_RADIUS, bottomRight: BUBBLE_JOIN_RADIUS });
    });

    it('pega las dos esquinas exteriores en los mensajes intermedios de la cadena', () => {
        expect(resolveBubbleCorners({ isMine: false, isFirstInGroupChain: false, isLastInGroupChain: false }))
            .toEqual({ topLeft: BUBBLE_JOIN_RADIUS, topRight: BUBBLE_RADIUS, bottomLeft: BUBBLE_JOIN_RADIUS, bottomRight: BUBBLE_RADIUS });
    });

    it('cierra la cadena con la esquina inferior redondeada', () => {
        expect(resolveBubbleCorners({ isMine: true, isFirstInGroupChain: false, isLastInGroupChain: true }))
            .toEqual({ topLeft: BUBBLE_RADIUS, topRight: BUBBLE_JOIN_RADIUS, bottomLeft: BUBBLE_RADIUS, bottomRight: BUBBLE_RADIUS });
    });

    it('convierte las esquinas a píxeles para el estilo', () => {
        expect(bubbleRadiusSx({ topLeft: 12, topRight: 4, bottomLeft: 12, bottomRight: 6 })).toEqual({
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '4px',
            borderBottomLeftRadius: '12px',
            borderBottomRightRadius: '6px',
        });
    });
});
