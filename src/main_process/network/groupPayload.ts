import sharp from 'sharp';

type GroupInvitePayload = {
    groupName: string;
    members: string[];
    avatar?: string;
};

type GroupUpdatePayload = {
    groupName?: string;
    avatar?: string | null;
};

const MAX_SERIALIZED_GROUP_PAYLOAD_CHARS = 90_000;
const GROUP_AVATAR_TARGET_BYTES = 18 * 1024;
const GROUP_AVATAR_SIDES = [320, 240, 160];
const GROUP_AVATAR_QUALITIES = [60, 45, 30];

function serializePayload(payload: GroupInvitePayload | GroupUpdatePayload): string | null {
    const serialized = JSON.stringify(payload);
    return serialized.length <= MAX_SERIALIZED_GROUP_PAYLOAD_CHARS ? serialized : null;
}

function parseDataUrlImage(dataUrl: string): Buffer | null {
    const match = /^data:[^;,]+;base64,(.+)$/s.exec(dataUrl);
    if (!match) return null;

    try {
        return Buffer.from(match[1], 'base64');
    } catch {
        return null;
    }
}

async function shrinkAvatar(avatar: string): Promise<string | null> {
    const input = parseDataUrlImage(avatar);
    if (!input) return null;
    if (input.length <= GROUP_AVATAR_TARGET_BYTES) return avatar;

    let bestBuffer: Buffer | null = null;

    try {
        for (const side of GROUP_AVATAR_SIDES) {
            for (const quality of GROUP_AVATAR_QUALITIES) {
                const candidate = await sharp(input, { animated: false, limitInputPixels: 16_000_000 })
                    .rotate()
                    .resize({ width: side, height: side, fit: 'cover', position: 'centre', withoutEnlargement: true })
                    .webp({ quality })
                    .toBuffer();

                if (!bestBuffer || candidate.length < bestBuffer.length) {
                    bestBuffer = candidate;
                }

                if (candidate.length <= GROUP_AVATAR_TARGET_BYTES) {
                    return `data:image/webp;base64,${candidate.toString('base64')}`;
                }
            }
        }
    } catch {
        return null;
    }

    return bestBuffer ? `data:image/webp;base64,${bestBuffer.toString('base64')}` : null;
}

export async function buildGroupInvitePayload(groupName: string, members: string[], avatar?: string): Promise<string> {
    const fullPayload = serializePayload({ groupName, members, ...(avatar ? { avatar } : {}) });
    if (fullPayload) {
        return fullPayload;
    }

    if (avatar) {
        const shrunkAvatar = await shrinkAvatar(avatar);
        if (shrunkAvatar && shrunkAvatar !== avatar) {
            const shrunkPayload = serializePayload({ groupName, members, avatar: shrunkAvatar });
            if (shrunkPayload) {
                return shrunkPayload;
            }
        }

        const withoutAvatarPayload = serializePayload({ groupName, members });
        if (withoutAvatarPayload) {
            return withoutAvatarPayload;
        }
    }

    return JSON.stringify({ groupName, members });
}

export async function buildGroupUpdatePayload(fields: GroupUpdatePayload): Promise<string> {
    const fullPayload = serializePayload(fields);
    if (fullPayload) {
        return fullPayload;
    }

    if (typeof fields.avatar === 'string') {
        const shrunkAvatar = await shrinkAvatar(fields.avatar);
        if (shrunkAvatar && shrunkAvatar !== fields.avatar) {
            const shrunkPayload = serializePayload({ ...fields, avatar: shrunkAvatar });
            if (shrunkPayload) {
                return shrunkPayload;
            }
        }

        const { avatar: _avatar, ...withoutAvatar } = fields;
        const withoutAvatarPayload = serializePayload(withoutAvatar);
        if (withoutAvatarPayload) {
            return withoutAvatarPayload;
        }
    }

    return JSON.stringify(typeof fields.avatar === 'string' ? { ...fields, avatar: undefined } : fields);
}