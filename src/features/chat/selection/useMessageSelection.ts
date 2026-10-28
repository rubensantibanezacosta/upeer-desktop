import { useState } from 'react';
import { useChatActionsStore } from '../../../store/useChatActionsStore.js';
import {
    deletableIds,
    forwardableMessages,
    orderedSelection,
    summarizeSelection,
    toggleSelected,
} from './bulkSelection.js';
import type { ChatMessage } from '../../../types/chat.js';

type SelectionHandlers = {
    onDelete: (id: string) => void;
    onForwardMany?: (messages: ChatMessage[]) => void;
};

export const useMessageSelection = (chatHistory: ChatMessage[], { onDelete, onForwardMany }: SelectionHandlers) => {
    const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
    const messagePrefs = useChatActionsStore((state) => state.messagePrefs);
    const setMessageFlag = useChatActionsStore((state) => state.setMessageFlag);

    const summary = summarizeSelection(chatHistory, selected, messagePrefs);
    const clear = () => setSelected(new Set());

    const toggle = (id: string) => setSelected(prev => toggleSelected(prev, id));
    const enter = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
    });

    const applyFlag = (key: 'starred' | 'pinned') => {
        const value = key === 'starred' ? !summary.allStarred : !summary.allPinned;
        for (const message of orderedSelection(chatHistory, selected)) {
            if (message.id) setMessageFlag(message.id, key, value);
        }
        clear();
    };

    const copy = async () => {
        const text = forwardableMessages(chatHistory, selected).map(m => m.message).join('\n');
        clear();
        if (!text) return;
        try {
            await window.upeer.writeClipboardText(text);
        } catch (error) {
            console.warn('No se pudo copiar la selección al portapapeles', error);
        }
    };

    const remove = () => {
        for (const id of deletableIds(chatHistory, selected)) onDelete(id);
        clear();
    };

    const forward = () => {
        const messages = forwardableMessages(chatHistory, selected);
        if (messages.length > 0) onForwardMany?.(messages);
        clear();
    };

    return {
        selectionMode: selected.size > 0,
        selected,
        summary,
        toggle,
        enter,
        clear,
        star: () => applyFlag('starred'),
        pin: () => applyFlag('pinned'),
        copy,
        remove,
        forward,
    };
};
