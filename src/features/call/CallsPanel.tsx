import React, { useEffect, useState } from 'react';
import { Avatar, Box, Card, CardContent, Stack, Typography } from '@mui/joy';
import type { Contact, Group, RawChatMessage } from '../../types/chat.js';
import { useCallStore } from './useCallStore.js';
import type { CallKind } from './useCall.js';

interface CallsPanelProps {
    contacts: Contact[];
    groups: Group[];
}

type RecentCall = { id: string; chatId: string; timestamp: number; kind: CallKind; duration: string | null };

function parseRecentCall(message: RawChatMessage, chatId: string): RecentCall | null {
    const content = message.message.replace(/^__SYS__\|/, '');
    const match = /^(Llamada de voz|Videollamada)(?: · (\d{2,}:\d{2})(?: · (\d{10,}))?| perdida)$/.exec(content);
    if (!match) return null;
    return {
        id: message.id ?? `${chatId}-${message.timestamp}`,
        chatId,
        timestamp: match[3] ? Number(match[3]) : message.timestamp,
        kind: match[1] === 'Videollamada' ? 'video' : 'audio',
        duration: match[2] ?? null,
    };
}

function callPhaseLabel(phase: string): string {
    if (phase === 'incoming-ringing') return 'Llamada entrante';
    if (phase === 'outgoing-ringing') return 'Llamando';
    if (phase === 'negotiating') return 'Conectando';
    return 'En curso';
}

export const CallsPanel: React.FC<CallsPanelProps> = ({ contacts, groups }) => {
    const calls = useCallStore((state) => state.calls);
    const isStartingCall = useCallStore((state) => state.isStartingCall);
    const activeCalls = Object.values(calls);
    const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
    const hasActiveCall = isStartingCall || activeCalls.length > 0;

    useEffect(() => {
        if (hasActiveCall) return;
        let cancelled = false;
        const loadRecentCalls = async () => {
            const conversations = [...contacts.map((contact) => contact.upeerId), ...groups.map((group) => group.groupId)];
            const results = await Promise.all(conversations.map(async (chatId) => {
                try {
                    const messages = await window.upeer.getMessages(chatId);
                    return messages.map((message) => parseRecentCall(message, chatId)).filter((call): call is RecentCall => call !== null);
                } catch (cause) {
                    console.warn(`No se pudo cargar el historial de llamadas de ${chatId}`, cause);
                    return [];
                }
            }));
            if (!cancelled) setRecentCalls(results.flat().sort((a, b) => b.timestamp - a.timestamp).slice(0, 30));
        };
        void loadRecentCalls();
        return () => { cancelled = true; };
    }, [hasActiveCall, contacts, groups]);

    const getRecentParticipants = (chatId: string) => {
        const group = groups.find((item) => item.groupId === chatId);
        if (group) return group.members.map((memberId) => contacts.find((contact) => contact.upeerId === memberId)?.alias?.trim() || contacts.find((contact) => contact.upeerId === memberId)?.name || 'Contacto').join(', ');
        return contacts.find((contact) => contact.upeerId === chatId)?.alias?.trim() || contacts.find((contact) => contact.upeerId === chatId)?.name || 'Contacto';
    };

    return (
        <Box sx={{ width: '100%', height: '100%', overflow: 'auto', p: { xs: 2, md: 4 } }}>
            <Stack spacing={3} sx={{ maxWidth: 960, mx: 'auto' }}>
                <Box>
                    <Typography level="h2">Llamadas y videollamadas</Typography>
                    <Typography level="body-md" color="neutral">Inicia una llamada con tus contactos o grupos.</Typography>
                </Box>

                {hasActiveCall ? <Stack spacing={1.5}>
                    <Typography level="h3">Llamadas activas</Typography>
                    {activeCalls.map((call) => {
                        const group = call.isGroup ? groups.find((item) => item.groupId === call.peerUpeerId) : undefined;
                        const contact = contacts.find((item) => item.upeerId === call.peerUpeerId);
                        const name = group?.name || contact?.name || 'Contacto';
                        return (
                            <Card key={call.callId} variant="outlined">
                                <CardContent>
                                    <Stack direction="row" alignItems="center" spacing={2}>
                                        <Avatar src={group?.avatar || contact?.avatar}>{name.charAt(0).toUpperCase()}</Avatar>
                                        <Box sx={{ flex: 1 }}>
                                            <Typography level="title-md">{name}</Typography>
                                            <Typography level="body-xs">{call.kind === 'video' ? 'Videollamada' : 'Llamada de voz'} · {callPhaseLabel(call.phase)}</Typography>
                                        </Box>
                                    </Stack>
                                </CardContent>
                            </Card>
                        );
                    })}
                </Stack> : <Stack spacing={1.5}>
                    <Typography level="h3">Llamadas recientes</Typography>
                    {recentCalls.length === 0 ? <Card variant="soft"><CardContent><Typography level="body-sm">No hay llamadas recientes.</Typography></CardContent></Card> : recentCalls.map((call) => {
                        const group = groups.find((item) => item.groupId === call.chatId);
                        const contact = contacts.find((item) => item.upeerId === call.chatId);
                        const name = group?.name || contact?.alias?.trim() || contact?.name || 'Contacto';
                        const participants = getRecentParticipants(call.chatId);
                        return <Card key={call.id} variant="outlined">
                            <CardContent>
                                <Stack direction="row" alignItems="center" spacing={2}>
                                    <Avatar src={group?.avatar || contact?.avatar}>{name.charAt(0).toUpperCase()}</Avatar>
                                    <Box sx={{ flex: 1 }}>
                                        <Typography level="title-md">{name}</Typography>
                                        <Typography level="body-xs">{call.kind === 'video' ? 'Videollamada' : 'Llamada de voz'} · {new Date(call.timestamp).toLocaleString()}</Typography>
                                        <Typography level="body-xs">Participantes: {participants}</Typography>
                                        <Typography level="body-xs">Duración: {call.duration ?? 'Perdida'}</Typography>
                                    </Box>
                                </Stack>
                            </CardContent>
                        </Card>;
                    })}
                </Stack>}
            </Stack>
        </Box>
    );
};