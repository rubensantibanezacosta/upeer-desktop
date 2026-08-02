import React, { useState } from 'react';
import {
    Box,
    Typography,
    ListItem,
    ListItemButton,
    ListItemDecorator,
} from '@mui/joy';
import { Group } from '../../types/chat.js';
import { highlightText } from '../../utils/highlightText.js';
import { GroupItemActions } from './GroupItemActions.js';
import { GroupItemLeaveDialog } from './GroupItemLeaveDialog.js';
import { formatGroupItemTime, GroupAvatar, GroupItemStatusIcon, renderGroupLastMessage } from './groupItemSupport.js';

interface GroupItemProps {
    group: Group;
    isSelected: boolean;
    onSelect: (groupId: string) => void;
    onToggleFavorite: (groupId: string) => void;
    onLeaveGroup?: (groupId: string) => void;
    onClearChat?: (groupId: string) => void;
    highlight?: string;
}

export const GroupItem: React.FC<GroupItemProps> = ({ group, isSelected, onSelect, onToggleFavorite, onLeaveGroup, onClearChat, highlight = '' }) => {
    const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
    const timeStr = formatGroupItemTime(group.lastMessageTime);

    return (
        <ListItem sx={{ p: 0 }}>
            <ListItemButton
                aria-label={`Abrir grupo ${group.name}`}
                selected={isSelected}
                onClick={() => onSelect(group.groupId)}
                sx={{
                    height: '72px',
                    px: 1.5,
                    borderRadius: 0,
                    margin: 0,
                }}
            >
                <ListItemDecorator sx={{ mr: 2 }}>
                    <GroupAvatar avatar={group.avatar} size="lg" />
                </ListItemDecorator>
                <Box sx={{
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    justifyContent: 'center',
                    pb: 1,
                    pt: 1,
                    overflow: 'hidden',
                    position: 'relative',
                    '&:hover .group-options-btn, .group-options-btn:has(button[aria-expanded="true"])': {
                        display: 'flex'
                    }
                }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Typography level="body-md" sx={{ fontWeight: 500 }} noWrap>
                            {highlight ? highlightText(group.name, highlight) : group.name}
                        </Typography>
                        <Typography level="body-xs" color="neutral" sx={{ ml: 1, minWidth: 'max-content' }}>
                            {timeStr}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                        <Typography
                            level="body-sm"
                            color="neutral"
                            noWrap
                            component="div"
                            sx={{
                                flexGrow: 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                overflow: 'hidden',
                            }}
                        >
                            {group.lastMessageIsMine && group.lastMessage && (
                                <Box component="span" sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                    <GroupItemStatusIcon group={group} />
                                </Box>
                            )}
                            <Typography
                                level="body-sm"
                                noWrap
                                component="span"
                                sx={{
                                    color: 'inherit',
                                    display: 'block',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {renderGroupLastMessage(group, highlight)}
                            </Typography>
                        </Typography>
                    </Box>

                    <GroupItemActions groupId={group.groupId} isFavorite={group.isFavorite} onToggleFavorite={onToggleFavorite} onLeaveRequest={() => setConfirmLeaveOpen(true)} onClearChat={onClearChat ? () => onClearChat(group.groupId) : undefined} />
                </Box>
            </ListItemButton>

            <GroupItemLeaveDialog open={confirmLeaveOpen} groupName={group.name} onClose={() => setConfirmLeaveOpen(false)} onConfirm={() => {
                onLeaveGroup?.(group.groupId);
                setConfirmLeaveOpen(false);
            }} />
        </ListItem>
    );
};
