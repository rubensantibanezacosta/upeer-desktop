import React from 'react';
import { Avatar, Box, Button, Card, CardContent, Divider, Stack, Typography } from '@mui/joy';
import CallIcon from '@mui/icons-material/Call';
import VideocamIcon from '@mui/icons-material/Videocam';
import type { Contact, Group } from '../../types/chat.js';
import { useCallStore } from './useCallStore.js';
import type { CallKind } from './useCall.js';

interface CallsPanelProps {
    contacts: Contact[];
    groups: Group[];
    selfUpeerId?: string;
    onStartCall: (peerUpeerId: string, kind: CallKind, isGroup?: boolean, groupMembers?: string[]) => Promise<unknown>;
}

function callPhaseLabel(phase: string): string {
    if (phase === 'incoming-ringing') return 'Llamada entrante';
    if (phase === 'outgoing-ringing') return 'Llamando';
    if (phase === 'negotiating') return 'Conectando';
    return 'En curso';
}

export const CallsPanel: React.FC<CallsPanelProps> = ({ contacts, groups, selfUpeerId, onStartCall }) => {
    const calls = useCallStore((state) => state.calls);
    const isStartingCall = useCallStore((state) => state.isStartingCall);
    const activeCalls = Object.values(calls);
    const availableContacts = contacts.filter((contact) => contact.upeerId !== selfUpeerId && ['connected', 'offline'].includes(contact.status));
    const callUnavailable = isStartingCall || activeCalls.length > 0;

    return (
        <Box sx={{ width: '100%', height: '100%', overflow: 'auto', p: { xs: 2, md: 4 } }}>
            <Stack spacing={3} sx={{ maxWidth: 960, mx: 'auto' }}>
                <Box>
                    <Typography level="h2">Llamadas y videollamadas</Typography>
                    <Typography level="body-md" color="neutral">Inicia una llamada con tus contactos o grupos.</Typography>
                </Box>

                <Stack spacing={1.5}>
                    <Typography level="h3">Llamadas activas</Typography>
                    {activeCalls.length === 0 ? (
                        <Card variant="soft"><CardContent><Typography level="body-sm">No hay llamadas activas.</Typography></CardContent></Card>
                    ) : activeCalls.map((call) => {
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
                </Stack>

                <Divider />

                <Stack spacing={1.5}>
                    <Typography level="h3">Contactos</Typography>
                    {availableContacts.length === 0 ? <Typography level="body-sm">No hay contactos disponibles para llamar.</Typography> : availableContacts.map((contact) => (
                        <Card key={contact.upeerId} variant="outlined">
                            <CardContent>
                                <Stack direction="row" alignItems="center" spacing={2}>
                                    <Avatar src={contact.avatar}>{contact.name.charAt(0).toUpperCase()}</Avatar>
                                    <Typography level="title-md" sx={{ flex: 1 }}>{contact.name}</Typography>
                                    <Button aria-label={`Llamar a ${contact.name}`} disabled={callUnavailable} variant="soft" startDecorator={<CallIcon />} onClick={() => void onStartCall(contact.upeerId, 'audio')}>Llamar</Button>
                                    <Button aria-label={`Videollamar a ${contact.name}`} disabled={callUnavailable} variant="soft" startDecorator={<VideocamIcon />} onClick={() => void onStartCall(contact.upeerId, 'video')}>Vídeo</Button>
                                </Stack>
                            </CardContent>
                        </Card>
                    ))}
                </Stack>

                <Stack spacing={1.5}>
                    <Typography level="h3">Grupos</Typography>
                    {groups.filter((group) => group.status === 'active').map((group) => (
                        <Card key={group.groupId} variant="outlined">
                            <CardContent>
                                <Stack direction="row" alignItems="center" spacing={2}>
                                    <Avatar src={group.avatar || undefined}>{group.name.charAt(0).toUpperCase()}</Avatar>
                                    <Box sx={{ flex: 1 }}>
                                        <Typography level="title-md">{group.name}</Typography>
                                        <Typography level="body-xs">{group.members.length} miembros</Typography>
                                    </Box>
                                    <Button aria-label={`Llamar al grupo ${group.name}`} disabled={callUnavailable} variant="soft" startDecorator={<CallIcon />} onClick={() => void onStartCall(group.groupId, 'audio', true, group.members)}>Llamar</Button>
                                    <Button aria-label={`Videollamar al grupo ${group.name}`} disabled={callUnavailable} variant="soft" startDecorator={<VideocamIcon />} onClick={() => void onStartCall(group.groupId, 'video', true, group.members)}>Vídeo</Button>
                                </Stack>
                            </CardContent>
                        </Card>
                    ))}
                </Stack>
            </Stack>
        </Box>
    );
};