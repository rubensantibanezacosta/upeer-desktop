import crypto from "node:crypto";
import {
  getMyPublicKey,
  getMyPublicKeyHex,
  getMyUPeerId,
  sign,
} from "../../security/identity.js";
import type { LinkPreview } from "../../../types/chat.js";
import { getContactByUpeerId } from "../../storage/contacts/operations.js";
import {
  saveMessage,
  updateMessageStatus,
} from "../../storage/messages/operations.js";
import { getGroupById } from "../../storage/groups/operations.js";
import { warn, error } from "../../security/secure-logger.js";
import { buildMessagePayload } from "../messagePayload.js";
import { encryptGroupMessage } from "../groupState.js";
import { canonicalStringify } from "../utils.js";
import { sendSecureUDPMessage } from "../server/transport.js";
import { MAX_MESSAGE_SIZE_BYTES } from "../server/constants.js";
import { VaultManager } from "../vault/manager.js";
import { runWithConcurrencyMap } from "../concurrency.js";
import type { LocationBlock } from "../types.js";
import { validateAddress } from "../addressing.js";
import { verifyLocationBlockWithDHT } from "../locationBlocks.js";
import {
  withGroupOperationLock,
} from "../groupOperationQueue.js";
export {
  createGroup,
  inviteToGroup,
  updateGroup,
  leaveGroup,
  transferGroupAdmin,
  removeGroupMember,
} from "./groupControl.js";

const GROUP_FANOUT_CONCURRENCY = 8;

type GroupMemberContact = {
  upeerId: string;
  publicKey?: string;
  status: string;
  address?: string | null;
  knownAddresses?: string | string[] | null;
};

async function resolveGroupMemberDelivery(
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

/**
 * Send a text message to a group (fan-out to each member).
 * Returns the generated message ID and timestamp.
 */
async function applySendGroupMessage(
  groupId: string,
  message: string,
  replyTo?: string,
  linkPreview?: LinkPreview | null,
): Promise<
  { id: string; timestamp: number; savedMessage: string } | undefined
> {
  // Límite de tamaño para prevenir OOM y JSON bombs
  if (message.length > MAX_MESSAGE_SIZE_BYTES) {
    error(
      `Group message size exceeds limit (${message.length} > ${MAX_MESSAGE_SIZE_BYTES})`,
      { groupId },
      "security",
    );
    return undefined;
  }

  const group = getGroupById(groupId);
  if (!group || group.status === "removed" || group.status === "invited" || !group.senderKey) return undefined;

  const msgId = crypto.randomUUID();
  const myId = getMyUPeerId();
  const timestamp = Date.now();
  const URL_FIRST_RE = /(https?:\/\/[^\s<>"']+)/i;
  const urlMatch = URL_FIRST_RE.exec(message);
  let payload = message;

  if (linkPreview) {
    payload = await buildMessagePayload(message, linkPreview);
  } else if (urlMatch) {
    const { fetchOgPreview } = await import("../og-fetcher.js");
    const preview = await fetchOgPreview(urlMatch[1]);
    if (preview) {
      payload = await buildMessagePayload(message, preview);
    }
  }

  // Save locally first
  const signature = sign(Buffer.from(payload));
  await saveMessage(
    msgId,
    groupId,
    true,
    payload,
    replyTo,
    signature.toString("hex"),
    "sent",
    myId,
    timestamp,
  );
  const { ciphertext, nonce } = encryptGroupMessage(payload, group.senderKey);
  const packet = {
    type: "GROUP_MSG",
    id: msgId,
    groupId,
    senderUpeerId: myId,
    senderPublicKey: getMyPublicKeyHex(),
    timestamp,
    content: ciphertext,
    nonce,
    epoch: group.epoch,
    replyTo,
  };
  const signedPacket = {
    ...packet,
    senderUpeerId: myId,
    signature: sign(Buffer.from(canonicalStringify(packet))).toString("hex"),
  };

  // Fan-out: send to every member including other devices of ours for "Self-Sync"
  const membersWithSelf = [...group.members];
  // Asegurar que no duplicamos el ID pero permitimos el fan-out de IPs adicionales
  const uniqueMembers = Array.from(new Set(membersWithSelf));

  await runWithConcurrencyMap(
    uniqueMembers,
    GROUP_FANOUT_CONCURRENCY,
    async (memberUpeerId) => {
      const isSelf = memberUpeerId === myId;
      if (isSelf) {
        const selfContact = await resolveGroupMemberDelivery(
          group,
          memberUpeerId,
        );
        if (!selfContact) return;
        const selfAddresses = [...selfContact.addresses];
        for (const address of selfAddresses) {
          sendSecureUDPMessage(
            address,
            packet,
            getMyPublicKey().toString("hex"),
            true,
          );
        }
        try {
          const { getKademliaInstance } = await import("../dht/handlers.js");
          const kademlia = getKademliaInstance();
          const myYggAddress = (
            await import("../../sidecars/yggstack.js")
          ).getYggstackAddress();
          for (const node of kademlia
            ?.findClosestContacts(myId, 20)
            .filter(
              (entry) =>
                entry.upeerId === myId && entry.address !== myYggAddress,
            ) ?? []) {
            if (selfAddresses.includes(node.address)) continue;
            selfAddresses.push(node.address);
            sendSecureUDPMessage(
              node.address,
              packet,
              getMyPublicKey().toString("hex"),
              true,
            );
          }
        } catch (err) {
          warn(
            "Failed to discover self addresses for group fan-out",
            { groupId, err: String(err) },
            "network",
          );
        }
        return;
      }

      const resolved = await resolveGroupMemberDelivery(group, memberUpeerId);
      if (
        !resolved ||
        (resolved.contact.status !== "connected" && !resolved.resolvedViaDht)
      )
        return;
      for (const address of resolved.addresses) {
        sendSecureUDPMessage(address, packet, resolved.contact.publicKey);
      }
    },
  );

  // Vault for offline members (we have their pubkey from previous handshake).
  // Incluirnos a nosotros mismos para la sincronización si no hay otros dispositivos online.
  const offlineTargetMembers = [...uniqueMembers];
  await runWithConcurrencyMap(
    offlineTargetMembers,
    GROUP_FANOUT_CONCURRENCY,
    async (memberUpeerId) => {
      const isSelf = memberUpeerId === myId;
      const contact =
        (await getContactByUpeerId(memberUpeerId)) ||
        (isSelf
          ? {
              upeerId: myId,
              publicKey: getMyPublicKeyHex(),
              status: "connected",
            }
          : null);

      if (!contact || !contact.publicKey) return;

      let shouldVault = false;
      if (isSelf) {
        try {
          const { getKademliaInstance } = await import("../dht/handlers.js");
          const kademlia = getKademliaInstance();
          const myYggAddress = (
            await import("../../sidecars/yggstack.js")
          ).getYggstackAddress();
          const otherSelfOnline = kademlia
            ? kademlia
                .findClosestContacts(myId, 20)
                .some((n) => n.upeerId === myId && n.address !== myYggAddress)
            : false;
          if (!otherSelfOnline) shouldVault = true;
        } catch (err) {
          warn(
            "Failed to check self-sync for group vaulting",
            { groupId, memberUpeerId, err: String(err) },
            "network",
          );
          shouldVault = true;
        }
      } else {
        if (contact.status !== "connected") shouldVault = true;
      }

      if (!shouldVault) return;

      const payloadHashOverride = crypto
        .createHash("sha256")
        .update(`group:${msgId}:${memberUpeerId}`)
        .digest("hex");

      const nodes = await VaultManager.replicateToVaults(
        memberUpeerId,
        signedPacket,
        undefined,
        payloadHashOverride,
      );

      if (!isSelf && nodes > 0) {
        if (await updateMessageStatus(msgId, "vaulted")) {
          const { BrowserWindow } = await import("electron");
          BrowserWindow.getAllWindows()[0]?.webContents.send(
            "message-status-updated",
            { id: msgId, status: "vaulted" },
          );
        }
      }
    },
  );

  return { id: msgId, timestamp, savedMessage: payload };
}

export async function sendGroupMessage(
  groupId: string,
  message: string,
  replyTo?: string,
  linkPreview?: LinkPreview | null,
): Promise<
  { id: string; timestamp: number; savedMessage: string } | undefined
> {
  return withGroupOperationLock(groupId, () =>
    applySendGroupMessage(groupId, message, replyTo, linkPreview),
  );
}

async function applySendGroupCallEvent(
  groupId: string,
  message: string,
  timestamp: number,
  messageId: string,
): Promise<void> {
  const group = getGroupById(groupId);
  const senderId = getMyUPeerId();
  if (!group || group.status === "removed" || group.status === "invited")
    throw new Error(`Cannot send call event for inactive group ${groupId}`);
  if (!group.senderKey)
    throw new Error(
      `Cannot encrypt call event for group ${groupId} without sender key`,
    );

  const msgId = messageId;
  const signedContent = message.startsWith("__SYS__|")
    ? message
    : `__SYS__|${message}`;
  const signature = sign(Buffer.from(signedContent)).toString("hex");
  await saveMessage(
    msgId,
    groupId,
    true,
    signedContent,
    undefined,
    signature,
    "sent",
    senderId,
    timestamp,
  );
  const { ciphertext, nonce } = encryptGroupMessage(
    signedContent,
    group.senderKey,
  );
  const packet = {
    type: "GROUP_MSG",
    id: msgId,
    groupId,
    senderUpeerId: senderId,
    senderPublicKey: getMyPublicKeyHex(),
    timestamp,
    content: ciphertext,
    nonce,
    epoch: group.epoch,
  };
  const signedPacket = {
    ...packet,
    signature: sign(Buffer.from(canonicalStringify(packet))).toString("hex"),
  };

  await runWithConcurrencyMap(
    Array.from(new Set(group.members)),
    GROUP_FANOUT_CONCURRENCY,
    async (memberId) => {
      const isSelf = memberId === senderId;
      const rawContact = await getContactByUpeerId(memberId);
      const contact =
        rawContact ||
        (isSelf
          ? {
              upeerId: senderId,
              publicKey: getMyPublicKeyHex(),
              status: "connected",
            }
          : null);
      if (!contact?.publicKey) return;
      const status = contact.status;
      if (status === "connected") {
        const address = rawContact?.address;
        if (typeof address === "string" && address)
          sendSecureUDPMessage(
            address,
            signedPacket,
            isSelf ? getMyPublicKey().toString("hex") : contact.publicKey,
            isSelf,
          );
        return;
      }
      if (isSelf || status === "offline") {
        await VaultManager.replicateToVaults(
          memberId,
          signedPacket,
          undefined,
          crypto
            .createHash("sha256")
            .update(`group:${msgId}:${memberId}`)
            .digest("hex"),
        );
      }
    },
  );

  const { BrowserWindow } = await import("electron");
  BrowserWindow.getAllWindows()[0]?.webContents.send("receive-group-message", {
    id: msgId,
    groupId,
    senderUpeerId: senderId,
    isMine: true,
    message: signedContent.slice(8),
    isSystem: true,
    status: "sent",
    timestamp,
  });
}

export async function sendGroupCallEvent(
  groupId: string,
  message: string,
  timestamp: number,
  messageId: string,
): Promise<void> {
  return withGroupOperationLock(groupId, () =>
    applySendGroupCallEvent(groupId, message, timestamp, messageId),
  );
}
