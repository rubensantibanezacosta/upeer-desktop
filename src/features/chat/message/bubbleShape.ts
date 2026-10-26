export const BUBBLE_RADIUS = 12;

export const BUBBLE_JOIN_RADIUS = 4;

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
    const corners: BubbleCorners = {
        topLeft: BUBBLE_RADIUS,
        topRight: BUBBLE_RADIUS,
        bottomLeft: BUBBLE_RADIUS,
        bottomRight: BUBBLE_RADIUS,
    };
    if (isFirstInGroupChain && isLastInGroupChain) return corners;
    if (isMine) {
        if (!isFirstInGroupChain) corners.topRight = BUBBLE_JOIN_RADIUS;
        if (!isLastInGroupChain) corners.bottomRight = BUBBLE_JOIN_RADIUS;
        return corners;
    }
    if (!isFirstInGroupChain) corners.topLeft = BUBBLE_JOIN_RADIUS;
    if (!isLastInGroupChain) corners.bottomLeft = BUBBLE_JOIN_RADIUS;
    return corners;
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
