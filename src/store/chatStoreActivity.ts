import type { ChatSet } from './chatStoreTypes.js';

export const registerTypingActivityListener = (set: ChatSet): void => {
    window.upeer.onTyping((data) => {
        const conversationKey = data.groupId ?? data.upeerId;
        const activity = data.state === 'recording' ? 'recording' : data.state === 'stop' ? null : 'typing';
        set((state) => {
            if (state.typingStatus[conversationKey]) {
                clearTimeout(state.typingStatus[conversationKey]);
            }
            if (!activity) {
                const typingStatus = { ...state.typingStatus };
                delete typingStatus[conversationKey];
                const peerActivity = { ...state.peerActivity };
                delete peerActivity[conversationKey];
                return { typingStatus, peerActivity };
            }
            const timeout = setTimeout(() => {
                set((currentState) => {
                    if (currentState.typingStatus[conversationKey] !== timeout) {
                        return currentState;
                    }
                    const typingStatus = { ...currentState.typingStatus };
                    delete typingStatus[conversationKey];
                    const peerActivity = { ...currentState.peerActivity };
                    delete peerActivity[conversationKey];
                    return { typingStatus, peerActivity };
                });
            }, 4000);
            return {
                typingStatus: { ...state.typingStatus, [conversationKey]: timeout },
                peerActivity: { ...state.peerActivity, [conversationKey]: activity },
            };
        });
    });
};
