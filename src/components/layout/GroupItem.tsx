import React, { useState } from 'react';
import {
    Box,
    Typography,
    ListItem,
    ListItemButton,
    ListItemDecorator,
    Avatar,
} from '@mui/joy';
import GroupsIcon from '@mui/icons-material/Groups';
import { Group } from '../../types/chat.js';
import { highlightText } from '../../utils/highlightText.js';
import { GroupItemActions } from './GroupItemActions.js';
import { GroupItemLeaveDialog } from './GroupItemLeaveDialog.js';
import { formatGroupItemTime, GroupItemStatusIcon, renderGroupLastMessage } from './groupItemSupport.js';

interface GroupItemProps {
    group: Group;
    isSelected: boolean;
    onSelect: (groupId: string) => void;
    onToggleFavorite: (groupId: string) => void;
    onLeaveGroup?: (groupId: string) => void;
    highlight?: string;
}

export const GroupItem: React.FC<GroupItemProps> = ({ group, isSelected, onSelect, onToggleFavorite, onLeaveGroup, highlight = '' }) => {
    const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
    const timeStr = formatGroupItemTime(group.lastMessageTime);

    return (
        <ListItem sx={{ p: 0 }}>
            <ListItemButton
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
                    <Avatar
                        size="lg"
                        src={group.avatar || undefined}
                        color="primary"
                        variant="soft"
                        sx={{
                            borderRadius: 'md',
                            ...(!group.avatar ? { background: 'linear-gradient(135deg, var(--joy-palette-primary-500), var(--joy-palette-primary-700))' } : {})
                        }}
                    >
                        {!group.avatar && <GroupsIcon sx={{ fontSize: 24, color: 'white' }} />}
                    </Avatar>
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

                    <GroupItemActions groupId={group.groupId} isFavorite={group.isFavorite} onToggleFavorite={onToggleFavorite} onLeaveRequest={() => setConfirmLeaveOpen(true)} />
                </Box>
            </ListItemButton>

            <GroupItemLeaveDialog open={confirmLeaveOpen} groupName={group.name} onClose={() => setConfirmLeaveOpen(false)} onConfirm={() => {
                onLeaveGroup?.(group.groupId);
                setConfirmLeaveOpen(false);
            }} />
        </ListItem>
    );
};
