import { parseCertificate } from '../../security/deviceCertificate.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { updateContactDeviceCertificate } from '../../storage/contacts/keys.js';

export type LocationDeviceBlock = {
    deviceId?: string;
    deviceCertificate?: unknown;
};

export type ContactDeviceBinding = {
    deviceId: string;
    devicePublicKey: string;
    deviceCertificate: string;
    issuedAt: number;
};

export function deviceBindingFromBlock(block: LocationDeviceBlock): ContactDeviceBinding | null {
    const certificate = parseCertificate(block.deviceCertificate);
    if (!certificate) return null;
    if (block.deviceId && block.deviceId.toLowerCase() !== certificate.deviceId) return null;
    return {
        deviceId: certificate.deviceId,
        devicePublicKey: certificate.devicePublicKey,
        deviceCertificate: JSON.stringify(certificate),
        issuedAt: certificate.issuedAt,
    };
}

export async function rememberContactDevice(upeerId: string, block: LocationDeviceBlock): Promise<boolean> {
    const binding = deviceBindingFromBlock(block);
    if (!binding) return false;
    const contact = await getContactByUpeerId(upeerId);
    if (!contact) return false;
    const stored = parseCertificate(contact.deviceCertificate);
    if (stored) {
        if (stored.devicePublicKey === binding.devicePublicKey) return false;
        if (stored.issuedAt >= binding.issuedAt) return false;
    }
    updateContactDeviceCertificate(upeerId, binding);
    return true;
}
