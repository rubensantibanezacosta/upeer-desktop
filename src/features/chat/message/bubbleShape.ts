export const BUBBLE_RADIUS = 12;

export const BUBBLE_TAIL_RADIUS = 4;

export const BUBBLE_JOIN_RADIUS = 6;

export interface BubbleShapeOptions {
    isMine: boolean;
    isFirstInGroupChain: boolean;
    isLastInGroupChain: boolean;
}

export interface BubbleCorners {
    topLeft: number;
    topRight: number;
    bottomLeft: number;
    bottomRight: number;
}

export function resolveBubbleCorners({ isMine, isFirstInGroupChain, isLastInGroupChain }: BubbleShapeOptions): BubbleCorners {
    const outerTop = isFirstInGroupChain ? BUBBLE_TAIL_RADIUS : BUBBLE_JOIN_RADIUS;
    const outerBottom = isLastInGroupChain ? BUBBLE_RADIUS : BUBBLE_JOIN_RADIUS;
    if (isMine) {
        return { topLeft: BUBBLE_RADIUS, topRight: outerTop, bottomLeft: BUBBLE_RADIUS, bottomRight: outerBottom };
    }
    return { topLeft: outerTop, topRight: BUBBLE_RADIUS, bottomLeft: outerBottom, bottomRight: BUBBLE_RADIUS };
}

export function bubbleRadiusSx(corners: BubbleCorners): Record<string, string> {
    const px = (value: number): string => `${value}px`;
    return {
        borderTopLeftRadius: px(corners.topLeft),
        borderTopRightRadius: px(corners.topRight),
        borderBottomLeftRadius: px(corners.bottomLeft),
        borderBottomRightRadius: px(corners.bottomRight),
    };
}
