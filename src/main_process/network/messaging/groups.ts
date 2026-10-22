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
import { sendSecurePacket } from "../server/transport.js";
import { MAX_MESSAGE_SIZE_BYTES } from "../server/constants.js";
import { VaultManager } from "../vault/manager.js";
import { runWithConcurrencyMap } from "../concurrency.js";
import {
  withGroupOperationLock,
} from "../groupOperationQueue.js";
import {
  buildDeviceAwareGroupPacket,
  buildGroupMessageVaultPacket,
  getGroupRecipientPublicKey,
} from "./groupControlSupport.js";
import {
  GROUP_FANOUT_CONCURRENCY,
  resolveGroupMemberDelivery,
} from "./groupMessageDelivery.js";
export {
  createGroup,
  inviteToGroup,
  updateGroup,
  leaveGroup,
  transferGroupAdmin,
  removeGroupMember,
} from "./groupControl.js";

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
          sendSecurePacket(
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
            sendSecurePacket(
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
      const deliveryPacket = buildDeviceAwareGroupPacket(
        packet,
        resolved.contact,
      );
      const recipientPublicKey = getGroupRecipientPublicKey(resolved.contact);
      for (const address of resolved.addresses) {
        sendSecurePacket(address, deliveryPacket, recipientPublicKey);
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

      const signedPacket = buildGroupMessageVaultPacket(
        packet,
        isSelf ? null : contact,
        myId,
      );
      const recipientDeviceId = "deviceId" in contact && typeof contact.deviceId === "string"
        ? contact.deviceId
        : undefined;
      const nodes = isSelf || !recipientDeviceId
        ? await VaultManager.replicateToVaults(
          memberUpeerId,
          signedPacket,
          undefined,
          payloadHashOverride,
        )
        : await VaultManager.replicateToVaults(
          memberUpeerId,
          signedPacket,
          undefined,
          payloadHashOverride,
          recipientDeviceId,
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

