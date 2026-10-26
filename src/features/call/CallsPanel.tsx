import React, { useEffect, useState } from 'react';
import { Avatar, Box, Card, CardContent, Chip, IconButton, List, ListItem, Stack, Tooltip, Typography } from '@mui/joy';
import CallIcon from '@mui/icons-material/Call';
import VideocamIcon from '@mui/icons-material/Videocam';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import type { Contact, Group, RawChatMessage } from '../../types/chat.js';
import { useCallStore } from './useCallStore.js';
import { useCall } from './useCall.js';
import { listRowAvatarSx, listRowButtonSx, listRowDecoratorSx, listRowListItemSx } from '../../components/layout/listRowMetrics.js';
import { EmptyState } from '../../components/layout/sidebar/EmptyState.js';

interface CallsPanelProps {
    contacts: Contact[];
    groups: Group[];
    selfUpeerId?: string;
}

type CallKind = 'audio' | 'video';
type RecentCall = { id: string; chatId: string; timestamp: number; kind: CallKind; duration: string | null; rejected: boolean };

function parseRecentCall(message: RawChatMessage, chatId: string): RecentCall | null {
    const content = message.message.replace(/^__SYS__\|/, '');
    const match = /^(Llamada de voz|Videollamada)(?: · (\d{2,}:\d{2})(?: · (\d{10,}))?| (perdida|rechazada))$/.exec(content);
    if (!match) return null;
    return {
        id: message.id ?? `${chatId}-${message.timestamp}`,
        chatId,
        timestamp: match[3] ? Number(match[3]) : message.timestamp,
        kind: match[1] === 'Videollamada' ? 'video' : 'audio',
        duration: match[2] ?? null,
        rejected: match[4] === 'rechazada',
    };
}

function callPhaseLabel(phase: string): string {
    if (phase === 'incoming-ringing') return 'Llamada entrante';
    if (phase === 'outgoing-ringing') return 'Llamando';
    if (phase === 'negotiating') return 'Conectando';
    return 'En curso';
}

export const CallsPanel: React.FC<CallsPanelProps> = ({ contacts, groups, selfUpeerId }) => {
    const { startCall } = useCall(selfUpeerId);
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
                    {recentCalls.length === 0 ? <EmptyState icon={<CallIcon />} title="Sin llamadas" subtitle="Todavía no has hecho ninguna llamada con tus contactos." /> : <List sx={{ '--ListItemDecorator-size': 'auto', p: 0 }}>
                        {recentCalls.map((call) => {
                            const group = groups.find((item) => item.groupId === call.chatId);
                            const contact = contacts.find((item) => item.upeerId === call.chatId);
                            const name = group?.name || contact?.alias?.trim() || contact?.name || 'Contacto';
                            const participants = getRecentParticipants(call.chatId);
                            const CallIconComponent = call.kind === 'video' ? VideocamIcon : CallIcon;
                            const groupMembers = group?.members.filter((memberId) => memberId !== selfUpeerId) ?? [];
                            const canCallBack = group ? groupMembers.length > 0 : Boolean(contact && contact.upeerId !== selfUpeerId);
                            const callDate = new Date(call.timestamp);
                            const dateLabel = callDate.toLocaleDateString([], { day: 'numeric', month: 'short' });
                            const timeLabel = callDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            return <ListItem key={call.id} sx={listRowListItemSx}>
                                <Box sx={{ ...listRowButtonSx, display: 'flex', alignItems: 'center', width: '100%' }}>
                                    <Box sx={{ ...listRowDecoratorSx, position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                                        <Avatar size="lg" src={group?.avatar || contact?.avatar} sx={listRowAvatarSx}>{name.charAt(0).toUpperCase()}</Avatar>
                                        <Box sx={{ position: 'absolute', right: 0, bottom: 0, display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%', color: call.kind === 'video' ? 'primary.700' : 'success.700', backgroundColor: call.kind === 'video' ? 'primary.softBg' : 'success.softBg', border: '2px solid', borderColor: 'background.body' }}>
                                            <CallIconComponent sx={{ fontSize: 13 }} />
                                        </Box>
                                    </Box>
                                    <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', py: 1 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                                            <Typography level="body-md" sx={{ fontWeight: 500 }} noWrap>{name}</Typography>
                                            <Typography level="body-xs" sx={{ color: 'text.tertiary', whiteSpace: 'nowrap' }}>{dateLabel} · {timeLabel}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 0.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                                                <Typography level="body-sm" noWrap sx={{ color: 'text.secondary' }}>{call.kind === 'video' ? 'Videollamada' : 'Llamada de voz'}</Typography>
                                                {group && <Typography level="body-xs" noWrap sx={{ color: 'text.tertiary' }}>· {participants}</Typography>}
                                            </Box>
                                            <Chip size="sm" variant="soft" color={call.duration ? 'neutral' : call.rejected ? 'warning' : 'danger'} startDecorator={call.duration ? <AccessTimeIcon /> : undefined}>
                                                {call.duration ? call.duration : call.rejected ? 'Rechazada' : 'Perdida'}
                                            </Chip>
                                        </Box>
                                    </Box>
                                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0, pl: 1 }}>
                                        <Tooltip title="Volver a llamar por voz">
                                            <span><IconButton size="sm" variant="soft" color="success" aria-label={`Llamada de voz a ${name}`} disabled={hasActiveCall || !canCallBack} onClick={() => {
                                                if (group) void startCall(group.groupId, 'audio', true, groupMembers, group.groupId);
                                                else if (contact) void startCall(contact.upeerId, 'audio');
                                            }}><CallIcon /></IconButton></span>
                                        </Tooltip>
                                        <Tooltip title="Volver a llamar por vídeo">
                                            <span><IconButton size="sm" variant="soft" color="primary" aria-label={`Videollamada a ${name}`} disabled={hasActiveCall || !canCallBack} onClick={() => {
                                                if (group) void startCall(group.groupId, 'video', true, groupMembers, group.groupId);
                                                else if (contact) void startCall(contact.upeerId, 'video');
                                            }}><VideocamIcon /></IconButton></span>
                                        </Tooltip>
                                    </Stack>
                                </Box>
                            </ListItem>;
                        })}
                    </List>}
                </Stack>}
            </Stack>
        </Box>
    );
};