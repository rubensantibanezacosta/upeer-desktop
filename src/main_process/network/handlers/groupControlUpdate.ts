import { BrowserWindow } from "electron";
import { withGroupOperationLock } from "../groupOperationQueue.js";
import {
  getGroupById,
  updateGroupAdmin,
  updateGroupCrypto,
  updateGroupInfo,
  updateGroupMemberPublicKeys,
  updateGroupMembers,
  updateGroupStatus,
} from "../../storage/groups/operations.js";
import { getMyUPeerId } from "../../security/identity.js";
import { security, warn } from "../../security/secure-logger.js";
import { isValidGroupEpoch, isValidGroupSenderKey } from "../groupState.js";
import {
  decryptGroupControlPayload,
  GroupControlPacket,
  normalizeAvatarForCompare,
  sameMembers,
  updateGroupEphemeralKeyIfValid,
  validMemberPublicKeys,
} from "./groupControlShared.js";

async function applyGroupUpdate(
  senderUpeerId: string,
  data: GroupControlPacket,
  win: BrowserWindow | null,
  fromAddress?: string,
  sendResponse?: (ip: string, data: Record<string, unknown>) => void,
): Promise<void> {
  const { groupId, adminUpeerId } = data;
  if (!groupId || !data.payload || !data.nonce) return;
  const myId = getMyUPeerId();

  updateGroupEphemeralKeyIfValid(senderUpeerId, data.ephemeralPublicKey);

  const group = getGroupById(groupId);
  if (!group) return;
  if (group.status === "removed") return;

  const claimedAdmin = adminUpeerId || senderUpeerId;
  if (group.adminUpeerId !== claimedAdmin || senderUpeerId !== claimedAdmin) {
    security(
      "GROUP_UPDATE de no-admin ignorado",
      { sender: senderUpeerId, groupId },
      "security",
    );
    return;
  }

  const fields: { name?: string; avatar?: string | null } = {};
  let members: string[] | undefined;
  let memberPublicKeys: Record<string, string> | undefined;
  let epoch: number | undefined;
  let senderKey: string | undefined;
  let nextAdminUpeerId: string | undefined;

  try {
    const inner = await decryptGroupControlPayload(
      senderUpeerId,
      data,
      async (reset) => {
        if (!fromAddress || !sendResponse) return;
        sendResponse(fromAddress, reset);
      },
    );
    if (!inner) {
      security(
        "GROUP_UPDATE: decryption failed",
        { senderUpeerId, groupId },
        "security",
      );
      return;
    }

    if (
      inner.groupName &&
      typeof inner.groupName === "string" &&
      inner.groupName.length <= 100
    ) {
      fields.name = inner.groupName;
    }
    if (inner.avatar === null) {
      fields.avatar = null;
    } else if (
      typeof inner.avatar === "string" &&
      inner.avatar.startsWith("data:image/") &&
      inner.avatar.length <= 2_000_000
    ) {
      fields.avatar = inner.avatar;
    }
    if (Array.isArray(inner.members) && inner.members.length <= 500) {
      members = inner.members;
    }
    if (inner.memberPublicKeys !== undefined) {
      memberPublicKeys = validMemberPublicKeys(inner.memberPublicKeys);
    }
    if (inner.epoch !== undefined && isValidGroupEpoch(inner.epoch)) {
      epoch = inner.epoch;
    }
    if (
      inner.senderKey !== undefined &&
      isValidGroupSenderKey(inner.senderKey)
    ) {
      senderKey = inner.senderKey;
    }
    if (
      typeof inner.adminUpeerId === "string" &&
      inner.adminUpeerId.length <= 64
    ) {
      nextAdminUpeerId = inner.adminUpeerId;
    }
  } catch (err) {
    security(
      "GROUP_UPDATE: parse error",
      { senderUpeerId, err: String(err) },
      "security",
    );
    return;
  }

  const isRevocation = Boolean(members && !members.includes(myId));
  if ((epoch !== undefined) !== (senderKey !== undefined) && !isRevocation) {
    warn(
      "GROUP_UPDATE ignored partial sender state",
      { senderUpeerId, groupId },
      "security",
    );
    return;
  }

  if (epoch !== undefined && epoch < group.epoch) {
    warn(
      "Stale GROUP_UPDATE ignored",
      { senderUpeerId, groupId, epoch, currentEpoch: group.epoch },
      "security",
    );
    return;
  }
  if (isRevocation) {
    if (!members || epoch === undefined || epoch <= group.epoch) {
      warn(
        "GROUP_UPDATE revocation ignored without a newer epoch",
        { senderUpeerId, groupId, epoch, currentEpoch: group.epoch },
        "security",
      );
      return;
    }
    updateGroupMembers(groupId, members);
    updateGroupStatus(groupId, "removed");
    updateGroupCrypto(groupId, { epoch, ...(senderKey !== undefined ? { senderKey } : {}) });
    win?.webContents.send("group-updated", { groupId, members, status: "removed" });
    return;
  }
  if (
    epoch !== undefined &&
    epoch === group.epoch &&
    members &&
    !sameMembers(members, group.members)
  ) {
    warn(
      "GROUP_UPDATE ignored membership change without epoch advance",
      { senderUpeerId, groupId, epoch },
      "security",
    );
    return;
  }
  if (
    members &&
    !members.includes(group.adminUpeerId) &&
    (!nextAdminUpeerId || !members.includes(nextAdminUpeerId))
  ) {
    warn(
      "GROUP_UPDATE ignored membership change that removes the current administrator without a valid successor",
      { senderUpeerId, groupId, epoch, currentAdmin: group.adminUpeerId },
      "security",
    );
    return;
  }
  if (
    epoch !== undefined &&
    epoch === group.epoch &&
    senderKey !== group.senderKey
  ) {
    security(
      "GROUP_UPDATE with conflicting senderKey for same epoch",
      { senderUpeerId, groupId, epoch },
      "security",
    );
    return;
  }

  const sameName = fields.name === undefined || fields.name === group.name;
  const sameAvatar =
    fields.avatar === undefined ||
    normalizeAvatarForCompare(fields.avatar) ===
      normalizeAvatarForCompare(group.avatar);
  const sameMemberSet = !members || sameMembers(members, group.members);
  const sameEpochState =
    epoch === undefined ||
    (epoch === group.epoch && senderKey === group.senderKey);
  const sameAdmin =
    nextAdminUpeerId === undefined || nextAdminUpeerId === group.adminUpeerId;
  const nextMembers = new Set(members ?? group.members);
  const mergedMemberKeys = {
    ...Object.fromEntries(
      Object.entries(group.memberPublicKeys ?? {}).filter(([memberId]) =>
        nextMembers.has(memberId),
      ),
    ),
    ...Object.fromEntries(
      Object.entries(memberPublicKeys ?? {}).filter(([memberId]) =>
        nextMembers.has(memberId),
      ),
    ),
  };
  const sameMemberKeys =
    JSON.stringify(mergedMemberKeys) ===
    JSON.stringify(group.memberPublicKeys ?? {});
  if (
    sameName &&
    sameAvatar &&
    sameMemberSet &&
    sameEpochState &&
    sameMemberKeys &&
    sameAdmin
  ) {
    return;
  }

  if (
    nextAdminUpeerId &&
    (!group.members.includes(nextAdminUpeerId) ||
      (group.adminUpeerId !== senderUpeerId && nextAdminUpeerId !== group.adminUpeerId))
  ) {
    security(
      "GROUP_UPDATE with invalid administrator transfer",
      { senderUpeerId, groupId, nextAdminUpeerId },
      "security",
    );
    return;
  }

  if (members) {
    updateGroupMembers(groupId, members);
  }
  if (memberPublicKeys || members) {
    updateGroupMemberPublicKeys(groupId, mergedMemberKeys);
  }
  if (epoch !== undefined && senderKey !== undefined) {
    updateGroupCrypto(groupId, {
      epoch,
      senderKey,
      senderKeyCreatedAt: Date.now(),
    });
  }
  if (Object.keys(fields).length > 0) {
    updateGroupInfo(groupId, fields);
  }
  if (nextAdminUpeerId) {
    updateGroupAdmin(groupId, nextAdminUpeerId);
  }

  if (
    Object.keys(fields).length === 0 &&
    !members &&
    !memberPublicKeys &&
    epoch === undefined &&
    !nextAdminUpeerId
  )
    return;

  win?.webContents.send("group-updated", {
    groupId,
    ...(isRevocation ? { status: "removed" } : {}),
    ...(fields.name !== undefined ? { name: fields.name } : {}),
    ...(fields.avatar !== undefined ? { avatar: fields.avatar } : {}),
    ...(members ? { members } : {}),
  });
}

export async function handleGroupUpdate(
  senderUpeerId: string,
  data: GroupControlPacket,
  win: BrowserWindow | null,
  fromAddress?: string,
  sendResponse?: (ip: string, data: Record<string, unknown>) => void,
): Promise<void> {
  if (!data.groupId) return;
  return withGroupOperationLock(data.groupId, () =>
    applyGroupUpdate(senderUpeerId, data, win, fromAddress, sendResponse),
  );
}
