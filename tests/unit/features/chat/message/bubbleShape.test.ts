import { describe, it, expect } from 'vitest';
import {
    BUBBLE_JOIN_RADIUS,
    BUBBLE_RADIUS,
    bubbleRadiusSx,
    resolveBubbleCorners,
} from '../../../../../src/features/chat/message/bubbleShape.js';

const allRounded = {
    topLeft: BUBBLE_RADIUS,
    topRight: BUBBLE_RADIUS,
    bottomLeft: BUBBLE_RADIUS,
    bottomRight: BUBBLE_RADIUS,
};

describe('bubbleShape', () => {
    it('redondea las cuatro esquinas cuando el mensaje va solo', () => {
        expect(resolveBubbleCorners({ isMine: true, isFirstInGroupChain: true, isLastInGroupChain: true })).toEqual(allRounded);
        expect(resolveBubbleCorners({ isMine: false, isFirstInGroupChain: true, isLastInGroupChain: true })).toEqual(allRounded);
    });

    it('afila la esquina inferior derecha en el primer mensaje propio de una cadena', () => {
        expect(resolveBubbleCorners({ isMine: true, isFirstInGroupChain: true, isLastInGroupChain: false })).toEqual({
            ...allRounded,
            bottomRight: BUBBLE_JOIN_RADIUS,
        });
    });

    it('afila la esquina superior derecha en el último mensaje propio de una cadena', () => {
        expect(resolveBubbleCorners({ isMine: true, isFirstInGroupChain: false, isLastInGroupChain: true })).toEqual({
            ...allRounded,
            topRight: BUBBLE_JOIN_RADIUS,
        });
    });

    it('afila las dos esquinas derechas en los mensajes propios intermedios', () => {
        expect(resolveBubbleCorners({ isMine: true, isFirstInGroupChain: false, isLastInGroupChain: false })).toEqual({
            ...allRounded,
            topRight: BUBBLE_JOIN_RADIUS,
            bottomRight: BUBBLE_JOIN_RADIUS,
        });
    });

    it('afila el lado izquierdo en las cadenas del otro usuario', () => {
        expect(resolveBubbleCorners({ isMine: false, isFirstInGroupChain: true, isLastInGroupChain: false })).toEqual({
            ...allRounded,
            bottomLeft: BUBBLE_JOIN_RADIUS,
        });
        expect(resolveBubbleCorners({ isMine: false, isFirstInGroupChain: false, isLastInGroupChain: true })).toEqual({
            ...allRounded,
            topLeft: BUBBLE_JOIN_RADIUS,
        });
        expect(resolveBubbleCorners({ isMine: false, isFirstInGroupChain: false, isLastInGroupChain: false })).toEqual({
            ...allRounded,
            topLeft: BUBBLE_JOIN_RADIUS,
            bottomLeft: BUBBLE_JOIN_RADIUS,
        });
    });

    it('convierte las esquinas a píxeles para el estilo', () => {
        expect(bubbleRadiusSx({ topLeft: 12, topRight: 4, bottomLeft: 12, bottomRight: 4 })).toEqual({
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '4px',
            borderBottomLeftRadius: '12px',
            borderBottomRightRadius: '4px',
        });
    });
});
