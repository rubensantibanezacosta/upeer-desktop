import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import { getMainWindow } from "../../core/windowManager.js";
import { showDesktopNotification } from "../../utils/desktopNotification.js";
import { focusWindow } from "../../utils/windowFocus.js";
import {
  getGroupById,
  saveGroup,
  updateGroupCrypto,
  updateGroupInfo,
  updateGroupMemberPublicKeys,
  updateGroupMembers,
  updateGroupStatus,
} from "../../storage/groups/operations.js";
import { saveMessage } from "../../storage/messages/operations.js";
import { getContactByUpeerId, isContactBlocked } from "../../storage/contacts/operations.js";
import { getMyUPeerId } from "../../security/identity.js";
import { issueVouch, VouchType } from "../../security/reputation/vouches.js";
import { security, warn } from "../../security/secure-logger.js";
import { withGroupOperationLock } from "../groupOperationQueue.js";
import { isValidGroupEpoch, isValidGroupSenderKey } from "../groupState.js";
import {
  decryptGroupControlPayload,
  GroupPayload,
  normalizeAvatarForCompare,
  sameMembers,
  updateGroupEphemeralKeyIfValid,
  validMemberPublicKeys,
} from "./groupControlShared.js";

interface GroupInvitePacket extends GroupPayload {
  groupId: string;
  adminUpeerId?: string;
  payload: string;
  nonce: string;
  ephemeralPublicKey?: string;
  useRecipientEphemeral?: boolean;
}

async function applyGroupInvite(
  upeerId: string,
  data: GroupInvitePacket,
  win: BrowserWindow | null,
  fromAddress?: string,
  sendResponse?: (ip: string, data: Record<string, unknown>) => void,
): Promise<void> {
  const { groupId, adminUpeerId } = data;
  if (!groupId || !data.payload || !data.nonce) return;

  updateGroupEphemeralKeyIfValid(upeerId, data.ephemeralPublicKey);

  let groupName: string;
  let members: string[];
  let memberPublicKeys: Record<string, string> = {};
  let avatar: string | undefined;
  let epoch: number;
  let senderKey: string;
  let senderDisplayName = upeerId;

  try {
    const contact = await getContactByUpeerId(upeerId);
    senderDisplayName = contact?.name || contact?.alias || upeerId;
    const inner = await decryptGroupControlPayload(
      upeerId,
      data,
      async (reset) => {
        if (!fromAddress || !sendResponse) return;
        sendResponse(fromAddress, reset);
      },
    );
    if (!inner) {
      security(
        "GROUP_INVITE: decryption failed",
        { upeerId, groupId },
        "security",
      );
      return;
    }

    groupName = inner.groupName ?? "";
    members = Array.isArray(inner.members) ? inner.members : [];
    memberPublicKeys = validMemberPublicKeys(inner.memberPublicKeys);
    epoch = inner.epoch as number;
    senderKey = inner.senderKey ?? "";

    if (
      typeof inner.avatar === "string" &&
      inner.avatar.startsWith("data:image/") &&
      inner.avatar.length <= 2_000_000
    ) {
      avatar = inner.avatar;
    }
  } catch (err) {
    security(
      "GROUP_INVITE: parse error after decrypt",
      { upeerId, err: String(err) },
      "security",
    );
    return;
  }

  if (
    typeof groupName !== "string" ||
    groupName.length === 0 ||
    groupName.length > 100 ||
    !Array.isArray(members) ||
    members.length > 500 ||
    !isValidGroupEpoch(epoch) ||
    !isValidGroupSenderKey(senderKey)
  ) {
    security("GROUP_INVITE: invalid payload", { upeerId, groupId }, "security");
    return;
  }
  const actualAdmin = adminUpeerId || upeerId;
  if (!members.includes(actualAdmin)) {
    security(
      "GROUP_INVITE: admin is missing from membership",
      { upeerId, groupId },
      "security",
    );
    return;
  }

  if (upeerId !== actualAdmin) {
    security(
      "Identity mismatch in group invite!",
      { sender: upeerId, claimedAdmin: adminUpeerId },
      "security",
    );
    issueVouch(upeerId, VouchType.MALICIOUS).catch((err) =>
      warn(
        "Failed to issue malicious vouch for group invite",
        err,
        "reputation",
      ),
    );
    return;
  }

  const myId = getMyUPeerId();
  if (!members.includes(myId)) {
    security(
      "GROUP_INVITE without local membership",
      { sender: upeerId, groupId, myId },
      "security",
    );
    issueVouch(upeerId, VouchType.MALICIOUS).catch((err) =>
      warn(
        "Failed to issue malicious vouch for invalid membership invite",
        err,
        "reputation",
      ),
    );
    return;
  }

  const existing = getGroupById(groupId);
  if (isContactBlocked(upeerId) && !existing?.members.includes(upeerId)) return;
  const isRejoining = existing?.status === "removed";
  if (
    isRejoining &&
    (existing.adminUpeerId !== actualAdmin ||
      !existing.members.includes(actualAdmin) ||
      existing.members.includes(myId) ||
      epoch <= existing.epoch)
  ) {
    warn(
      "GROUP_INVITE rejected for removed group without valid rejoin state",
      { sender: upeerId, groupId, epoch, currentEpoch: existing.epoch },
      "security",
    );
    return;
  }
  const isNewGroup = !existing;
  const scopedMemberKeys = Object.fromEntries(
    Object.entries({
      ...(existing?.memberPublicKeys ?? {}),
      ...memberPublicKeys,
    }).filter(([memberId]) => members.includes(memberId)),
  );
  if (!existing) {
    saveGroup(
      groupId,
      groupName,
      actualAdmin,
      members || [upeerId],
      "active",
      avatar,
      { epoch, senderKey, senderKeyCreatedAt: Date.now() },
      scopedMemberKeys,
    );
  } else {
    if (existing.epoch > epoch) {
      warn(
        "Stale GROUP_INVITE ignored",
        { upeerId, groupId, epoch, currentEpoch: existing.epoch },
        "security",
      );
      return;
    }
    if (existing.adminUpeerId !== actualAdmin) {
      security(
        "Group invite from non-admin!",
        { sender: upeerId, groupId },
        "security",
      );
      issueVouch(upeerId, VouchType.MALICIOUS).catch((err) =>
        warn(
          "Failed to issue malicious vouch for non-admin invite",
          err,
          "reputation",
        ),
      );
      return;
    }
    if (!existing.members.includes(upeerId)) {
      security(
        "Group invite from non-member!",
        { sender: upeerId, groupId },
        "security",
      );
      issueVouch(upeerId, VouchType.MALICIOUS).catch((err) =>
        warn(
          "Failed to issue malicious vouch for non-member invite",
          err,
          "reputation",
        ),
      );
      return;
    }

    if (epoch < existing.epoch || (isRejoining && epoch <= existing.epoch)) {
      security(
        "Stale GROUP_INVITE ignored",
        { sender: upeerId, groupId, epoch, currentEpoch: existing.epoch },
        "security",
      );
      return;
    }
    if (epoch === existing.epoch && senderKey !== existing.senderKey) {
      security(
        "GROUP_INVITE with conflicting senderKey for same epoch",
        { sender: upeerId, groupId, epoch },
        "security",
      );
      return;
    }
    if (epoch === existing.epoch && !sameMembers(members, existing.members)) {
      warn(
        "GROUP_INVITE ignored membership change without epoch advance",
        { sender: upeerId, groupId, epoch },
        "security",
      );
      return;
    }
    if (epoch === existing.epoch && actualAdmin !== existing.adminUpeerId) {
      security(
        "GROUP_INVITE ignored administrator change without epoch advance",
        { sender: upeerId, groupId, epoch },
        "security",
      );
      return;
    }

    const memberKeysChanged = Object.entries(scopedMemberKeys).some(
      ([memberId, publicKey]) =>
        existing.memberPublicKeys?.[memberId] !== publicKey,
    );
    if (
      existing.epoch === epoch &&
      existing.senderKey === senderKey &&
      existing.name === groupName &&
      sameMembers(existing.members, members || [upeerId]) &&
      normalizeAvatarForCompare(existing.avatar) ===
        normalizeAvatarForCompare(avatar) &&
      !memberKeysChanged
    ) {
      return;
    }

    updateGroupMembers(groupId, members || [upeerId]);
    if (Object.keys(memberPublicKeys).length > 0) {
      updateGroupMemberPublicKeys(groupId, scopedMemberKeys);
    }
    updateGroupCrypto(groupId, {
      epoch,
      senderKey,
      senderKeyCreatedAt: Date.now(),
    });
    if (isRejoining) updateGroupStatus(groupId, "active");
    if (existing.name !== groupName || avatar !== undefined) {
      updateGroupInfo(groupId, {
        name: groupName,
        ...(avatar !== undefined ? { avatar } : {}),
      });
    }
  }

  if (isNewGroup) {
    const systemMessage = `__SYS__|${senderDisplayName} te añadió al grupo`;
    const inviteMessageId = randomUUID();
    const timestamp = Date.now();
    type SaveMessageResult = { changes?: number };
    const savedInvite = (await saveMessage(
      inviteMessageId,
      groupId,
      false,
      systemMessage,
      undefined,
      undefined,
      "delivered",
      actualAdmin,
      timestamp,
    )) as SaveMessageResult;

    if ((savedInvite?.changes ?? 0) > 0) {
      win?.webContents.send("receive-group-message", {
        id: inviteMessageId,
        groupId,
        senderUpeerId: actualAdmin,
        senderName: senderDisplayName,
        isMine: false,
        message: systemMessage,
        isSystem: true,
        status: "delivered",
        timestamp,
      });
    }

    const notifWin = getMainWindow();
    if (notifWin && !notifWin.isFocused()) {
      showDesktopNotification({
        kind: "requests",
        title: "Nueva invitación de grupo",
        body: `${senderDisplayName} te añadió a ${groupName}`,
        onClick: () => {
          const currentWin = getMainWindow();
          if (!currentWin) return;
          focusWindow(currentWin);
          currentWin.webContents.send("focus-conversation", { groupId });
        },
      });
    }
  }

  win?.webContents.send("group-invite-received", {
    groupId,
    groupName,
    adminUpeerId: actualAdmin,
    members: members || [],
    ...(avatar ? { avatar } : {}),
  });
}

export async function handleGroupInvite(
  upeerId: string,
  data: GroupInvitePacket,
  win: BrowserWindow | null,
  fromAddress?: string,
  sendResponse?: (ip: string, data: Record<string, unknown>) => void,
): Promise<void> {
  if (!data.groupId) return;
  return withGroupOperationLock(data.groupId, () =>
    applyGroupInvite(upeerId, data, win, fromAddress, sendResponse),
  );
}
