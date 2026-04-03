import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        const listeners = new Set([
            'onGroupUpdated',
            'onGroupMessage',
            'onGroupInvite',
            'onGroupMessageDelivered',
            'onReceive',
            'onPresence',
            'onContactRequest',
            'onHandshakeFinished',
            'onContactUntrustworthy',
            'onReputationUpdated',
            'onKeyChangeAlert',
            'onMessageDelivered',
            'onMessageRead',
            'onMessageReactionUpdated',
            'onMessageUpdated',
            'onMessageDeleted',
            'onChatCleared',
            'onMessageStatusUpdated',
            'onTyping',
            'onFocusConversation',
            'onFileTransferStarted',
            'onFileTransferProgress',
            'onFileTransferCompleted',
            'onFileTransferCancelled',
            'onFileTransferFailed',
            'onYggstackAddress',
            'onYggstackStatus',
        ]);

        const asyncValues: Record<string, unknown> = {
            isPinEnabled: false,
            identityStatus: { isLocked: false },
            getMyNetworkAddress: 'No detectado',
            getMyIdentity: { upeerId: 'self-id', name: 'E2E User', alias: 'E2E User', avatar: undefined },
            getContacts: [],
            getGroups: [],
            getMessages: [],
            getMessagesAround: [],
            searchMessages: [],
            getDevices: [],
            getMyDevices: [],
            getBlockedContacts: [],
            getNetworkStats: {},
            getVaultStats: {},
            getMyReputation: { score: 0 },
            getFileTransfers: { success: true, transfers: [] },
            openFileDialog: { success: true, canceled: true, files: [] },
            fetchOgPreview: null,
            sendMessage: { success: true },
            sendGroupMessage: { success: true },
            sendReadReceipt: { success: true },
            sendTypingIndicator: { success: true },
            sendContactCard: { success: true },
            sendChatReaction: { success: true },
            sendChatUpdate: { success: true },
            sendChatDelete: { success: true },
            createGroup: { success: true },
            updateGroupAvatar: { success: true },
            inviteToGroup: { success: true },
            updateGroup: { success: true },
            toggleFavoriteGroup: { success: true },
            leaveGroup: { success: true },
            addContact: { success: true },
            acceptContactRequest: { success: true },
            deleteContact: { success: true },
            blockContact: { success: true },
            unblockContact: { success: true },
            toggleFavoriteContact: { success: true },
            clearChat: { success: true },
            restartYggstack: { success: true },
            setPin: { success: true },
            disablePin: { success: true },
            verifyPin: { success: true },
        };

        const bridge = new Proxy({}, {
            get(_target, prop: string) {
                if (listeners.has(prop)) {
                    return () => () => undefined;
                }
                if (prop in asyncValues) {
                    return async () => asyncValues[prop];
                }
                if (prop === 'getPathForFile') {
                    return () => '';
                }
                return async () => null;
            },
        });

        Object.defineProperty(window, 'upeer', {
            configurable: true,
            writable: false,
            value: bridge,
        });
    });
});

test('monta la aplicación en el renderer', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/uPeer/i);
    await expect(page.getByTestId('app-root')).toBeVisible();
    await expect(page.getByTestId('app-shell')).toBeVisible();
});
