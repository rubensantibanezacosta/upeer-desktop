import { getDb } from "./shared.js";
import { devices } from "./schema.js";
import { eq, and } from "drizzle-orm";
import { DeviceMetadata } from "../network/types.js";

export async function upsertDevice(upeerId: string, deviceId: string, meta: DeviceMetadata): Promise<void> {
    const db = getDb();
    const now = Date.now();

    await db.insert(devices).values({
        upeerId,
        deviceId,
        clientName: meta.clientName ?? null,
        platform: meta.platform ?? null,
        clientVersion: meta.clientVersion ?? null,
        lastSeen: now,
        isTrusted: false
    }).onConflictDoUpdate({
        target: [devices.upeerId, devices.deviceId],
        set: {
            clientName: meta.clientName ?? null,
            platform: meta.platform ?? null,
            clientVersion: meta.clientVersion ?? null,
            lastSeen: now
        }
    });
}

export async function getDevicesByUPeerId(upeerId: string) {
    const db = getDb();
    return db.select().from(devices).where(eq(devices.upeerId, upeerId));
}

export async function setDeviceTrust(upeerId: string, deviceId: string, isTrusted: boolean): Promise<void> {
    const db = getDb();
    await db.update(devices)
        .set({ isTrusted })
        .where(
            and(
                eq(devices.upeerId, upeerId),
                eq(devices.deviceId, deviceId)
            )
        );
}

export async function deleteDevice(upeerId: string, deviceId: string): Promise<void> {
    const db = getDb();
    await db.delete(devices)
        .where(
            and(
                eq(devices.upeerId, upeerId),
                eq(devices.deviceId, deviceId)
            )
        );
}
