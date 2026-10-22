import crypto from "node:crypto";
import {
  getMyPublicKey,
  getMyPublicKeyHex,
  getMyUPeerId,
  sign,
} from "../../security/identity.js";
import { getContactByUpeerId } from "../../storage/contacts/operations.js";
import { saveMessage } from "../../storage/messages/operations.js";
import { getGroupById } from "../../storage/groups/operations.js";
import { encryptGroupMessage } from "../groupState.js";
import { sendSecurePacket } from "../server/transport.js";
import { VaultManager } from "../vault/manager.js";
import { runWithConcurrencyMap } from "../concurrency.js";
import { withGroupOperationLock } from "../groupOperationQueue.js";
import {
  buildDeviceAwareGroupPacket,
  buildGroupMessageVaultPacket,
  getGroupRecipientPublicKey,
} from "./groupControlSupport.js";
import { GROUP_FANOUT_CONCURRENCY } from "./groupMessageDelivery.js";

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
        if (typeof address === "string" && address) {
          const deliveryPacket = isSelf
            ? packet
            : buildDeviceAwareGroupPacket(packet, contact);
          sendSecurePacket(
            address,
            deliveryPacket,
            isSelf
              ? getMyPublicKey().toString("hex")
              : getGroupRecipientPublicKey(contact),
            isSelf,
          );
        }
        return;
      }
      if (isSelf || status === "offline") {
        const signedPacket = buildGroupMessageVaultPacket(
          packet,
          isSelf ? null : contact,
          senderId,
        );
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
