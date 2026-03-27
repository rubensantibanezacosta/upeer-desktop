import { getDb, getSchema, and, lt, eq } from "../../storage/shared.js";
import { sql } from "drizzle-orm";
import { info, error, network, warn } from "../../security/secure-logger.js";
import {
    generateSignedLocationBlock,
    AUTO_RENEW_THRESHOLD_MS,
    isYggdrasilAddress,
} from "../utils.js";
import { publishLocationBlock } from "./handlers.js";

type RenewableContact = {
    upeerId: string;
    deviceId?: string | null;
    renewalToken?: string | null;
    knownAddresses?: string | null;
    address?: string | null;
    dhtSeq?: number | null;
    deviceMeta?: string | null;
};

let renewalInterval: NodeJS.Timeout | null = null;
let renewalStarter: NodeJS.Timeout | null = null;

export function startRenewalService() {
    if (renewalInterval || renewalStarter) return;

    info("Starting DHT Renewal Service", undefined, "dht");
    // Comprobar cada 15 minutos
    renewalInterval = setInterval(checkAndRenewBlocks, 15 * 60 * 1000);
    // Primera ejecución tras 10 segundos para no saturar el arranque
    renewalStarter = setTimeout(checkAndRenewBlocks, 10000);
}

export function stopRenewalService() {
    if (renewalInterval) {
        clearInterval(renewalInterval);
        renewalInterval = null;
    }
    if (renewalStarter) {
        clearTimeout(renewalStarter);
        renewalStarter = null;
    }
}

async function checkAndRenewBlocks() {
    const db = getDb();
    const schema = getSchema();
    const now = Math.floor(Date.now() / 1000);
    const threshold = Math.floor(AUTO_RENEW_THRESHOLD_MS / 1000);

    try {
        // 1. Renovar mi bloque local si está cerca de expirar (Autorrenovación del nodo actual)
        // Esto normalmente lo gestiona broadcastDhtUpdate, pero el renewal service 
        // asegura que si la IP no cambia, el bloque no expire por TTL.

        // 2. Renovar bloques de mis dispositivos de confianza (Fideicomiso)
        // Buscamos dispositivos con renewalToken cuya expiración esté cerca
        const contactsToRenew = db.select()
            .from(schema.contacts)
            .where(
                and(
                    lt(schema.contacts.dhtExpiresAt, now + threshold),
                    sql`${schema.contacts.renewalToken} IS NOT NULL`
                )
            )
            .all();

        for (const contact of contactsToRenew) {
            await attemptBlockRenewal(contact);
        }
    } catch (err) {
        error("Error in renewal service", err, "dht");
    }
}

async function attemptBlockRenewal(contact: RenewableContact) {
    try {
        const token = JSON.parse(contact.renewalToken);
        if (!token || !token.signature) return;

        network("Attempting delegated block renewal for trusted device", undefined, {
            upeerId: contact.upeerId,
            deviceId: contact.deviceId
        }, "dht");

        // Obtenemos nuestras propias direcciones para ayudar al dispositivo 
        // (En el futuro, el dispositivo podría haber enviado sus IPs en el token, 
        // pero por ahora usamos las actuales si no hay cambios)
        const rawAddresses = contact.knownAddresses ? JSON.parse(contact.knownAddresses) : [contact.address];
        const addresses = (Array.isArray(rawAddresses) ? rawAddresses : [contact.address]).filter(isYggdrasilAddress);
        if (addresses.length === 0) {
            return;
        }
        const newSeq = (contact.dhtSeq || 0) + 1;

        // El dispositivo de confianza nos dio permiso (token) para firmar en su nombre
        // la renovación de su presencia en la DHT.
        // Nota: En esta fase usamos la identidad del nodo actual para firmar la renovación
        // puesto que somos sus custodios (Fiduciarios).

        const deviceMeta = contact.deviceMeta ? JSON.parse(contact.deviceMeta) : undefined;

        const updatedBlock = generateSignedLocationBlock(
            addresses,
            newSeq,
            undefined, // Default TTL
            token,     // Pasamos el token original
            deviceMeta
        );

        // Publicar el bloque actualizado en la DHT
        await publishLocationBlock(updatedBlock);

        // Actualizar en DB local para no repetir el proceso hasta el próximo umbral
        const db = getDb();
        const schema = getSchema();
        db.update(schema.contacts)
            .set({
                dhtExpiresAt: Math.floor(updatedBlock.expiresAt / 1000),
                dhtSeq: newSeq
            })
            .where(eq(schema.contacts.upeerId, contact.upeerId))
            .run();

        info("Delegated block renewal successful", { upeerId: contact.upeerId }, "dht");
    } catch (err) {
        warn("Failed to renew block for trusted device", { upeerId: contact.upeerId, err }, "dht");
    }
}
