import { getMyPublicKeyHex, getMyUPeerId } from "../../security/identity.js";
import { getContactByUpeerId } from "../../storage/contacts/operations.js";
import { getGroupById } from "../../storage/groups/operations.js";
import { warn } from "../../security/secure-logger.js";
import type { LocationBlock } from "../types.js";
import { validateAddress } from "../addressing.js";
import { verifyLocationBlockWithDHT } from "../locationBlocks.js";

export const GROUP_FANOUT_CONCURRENCY = 8;

export type GroupMemberContact = {
  upeerId: string;
  publicKey?: string;
  status: string;
  address?: string | null;
  knownAddresses?: string | string[] | null;
  deviceId?: string | null;
  devicePublicKey?: string | null;
};

export async function resolveGroupMemberDelivery(
  group: NonNullable<ReturnType<typeof getGroupById>>,
  memberUpeerId: string,
): Promise<{
  contact: GroupMemberContact;
  addresses: string[];
  resolvedViaDht: boolean;
} | null> {
  const rawContact = (await getContactByUpeerId(memberUpeerId)) as
    | GroupMemberContact
    | undefined;
  const isSelf = memberUpeerId === getMyUPeerId();
  const publicKey =
    rawContact?.publicKey ||
    group.memberPublicKeys?.[memberUpeerId] ||
    (isSelf ? getMyPublicKeyHex() : undefined);
  if (!publicKey || rawContact?.status === "blocked") return null;

  const contact: GroupMemberContact = rawContact
    ? { ...rawContact, publicKey }
    : {
        upeerId: memberUpeerId,
        publicKey,
        status: isSelf ? "connected" : "disconnected",
      };
  const addresses: string[] = [];
  let resolvedViaDht = false;
  const addAddress = (address: string) => {
    try {
      validateAddress(address);
      if (!addresses.includes(address)) addresses.push(address);
    } catch {
      warn(
        "Rejected invalid group member address",
        { groupId: group.groupId, memberUpeerId },
        "network",
      );
    }
  };

  if (typeof rawContact?.address === "string" && rawContact.address)
    addAddress(rawContact.address);
  const knownAddresses = rawContact?.knownAddresses;
  if (Array.isArray(knownAddresses)) {
    knownAddresses.forEach((address) => {
      if (typeof address === "string") addAddress(address);
    });
  } else if (typeof knownAddresses === "string") {
    try {
      const parsed: unknown = JSON.parse(knownAddresses);
      if (Array.isArray(parsed))
        parsed.forEach((address) => {
          if (typeof address === "string") addAddress(address);
        });
    } catch {
      warn(
        "Failed to parse known addresses for group member",
        { groupId: group.groupId, memberUpeerId },
        "network",
      );
    }
  }

  if (addresses.length === 0 && !isSelf) {
    try {
      const { getKademliaInstance } = await import("../dht/handlers.js");
      const location = (await getKademliaInstance()?.findLocationBlock(
        memberUpeerId,
      )) as LocationBlock | null | undefined;
      if (
        location &&
        (await verifyLocationBlockWithDHT(memberUpeerId, location, publicKey))
      ) {
        for (const address of location.addresses ?? [location.address])
          addAddress(address);
        resolvedViaDht = addresses.length > 0;
      }
    } catch (err) {
      warn(
        "Failed to resolve group member through DHT",
        { groupId: group.groupId, memberUpeerId, err: String(err) },
        "network",
      );
    }
  }

  return addresses.length > 0 || isSelf
    ? { contact, addresses, resolvedViaDht }
    : null;
}
