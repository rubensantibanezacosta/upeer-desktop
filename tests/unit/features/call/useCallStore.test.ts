import { beforeEach, describe, expect, it } from 'vitest';
import { useCallStore } from '../../../../src/features/call/useCallStore.js';

describe('useCallStore', () => {
    beforeEach(() => {
        useCallStore.getState().reset();
    });

    it('addGroupMember añade un miembro sin duplicar', () => {
        useCallStore.getState().setStarted('c1', 'peer1', 'video', true, ['peer2']);
        useCallStore.getState().addGroupMember('c1', 'peer3');
        useCallStore.getState().addGroupMember('c1', 'peer2');
        expect(useCallStore.getState().calls.c1.groupMembers).toEqual(['peer2', 'peer3']);
    });

    it('removeGroupMember elimina un miembro', () => {
        useCallStore.getState().setStarted('c1', 'peer1', 'video', true, ['peer2', 'peer3']);
        useCallStore.getState().removeGroupMember('c1', 'peer2');
        expect(useCallStore.getState().calls.c1.groupMembers).toEqual(['peer3']);
    });

    it('setRelayUpeer fija y limpia el relay', () => {
        useCallStore.getState().setStarted('c1', 'peer1', 'video', true, ['peer2', 'peer3']);
        useCallStore.getState().setRelayUpeer('c1', 'peer2');
        expect(useCallStore.getState().calls.c1.relayUpeerId).toBe('peer2');
        useCallStore.getState().setRelayUpeer('c1', undefined);
        expect(useCallStore.getState().calls.c1.relayUpeerId).toBeUndefined();
    });
});
