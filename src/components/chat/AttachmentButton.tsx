import React from 'react';
import {
    IconButton,
    Menu,
    MenuItem,
    ListItemDecorator,
    ListDivider,
    Typography,
    Dropdown,
    MenuButton
} from '@mui/joy';
import AddIcon from '@mui/icons-material/Add';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ImageIcon from '@mui/icons-material/Image';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import DescriptionIcon from '@mui/icons-material/Description';


export type AttachmentType =
    | 'any'
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'file'
    | 'folder';

interface AttachmentButtonProps {
    onSelect: (type: AttachmentType) => void;
    disabled?: boolean;
}

const ATTACHMENT_OPTIONS: Array<{
    type: AttachmentType;
    label: string;
    icon: React.ReactNode;
    description: string;
}> = [
        {
            type: 'any',
            label: 'Cualquier archivo',
            icon: <AttachFileIcon />,
            description: 'Selecciona cualquier tipo de archivo'
        },
        {
            type: 'image',
            label: 'Imagen',
            icon: <ImageIcon />,
            description: 'JPG, PNG, GIF, WebP'
        },
        {
            type: 'video',
            label: 'Video',
            icon: <VideoFileIcon />,
            description: 'MP4, MOV, AVI, WebM'
        },
        {
            type: 'audio',
            label: 'Audio',
            icon: <AudioFileIcon />,
            description: 'MP3, WAV, OGG'
        },
        {
            type: 'document',
            label: 'Documento',
            icon: <DescriptionIcon />,
            description: 'PDF, Word, Excel, PowerPoint'
        }
    ];

export const AttachmentButton: React.FC<AttachmentButtonProps> = ({
    onSelect,
    disabled = false
}) => {
    return (
        <Dropdown>
            <MenuButton
                slots={{ root: IconButton }}
                slotProps={{
                    root: {
                        variant: "plain",
                        color: "neutral",
                        disabled: disabled,
                        sx: {
                            '&:hover': {
                                backgroundColor: 'background.level1',
                                color: 'primary.plainColor'
                            }
                        }
                    }
                }}
            >
                <AddIcon />
            </MenuButton>

            <Menu
                placement="top-start"
                size="sm"
                sx={{
                    minWidth: 240,
                    borderRadius: 'lg',
                    boxShadow: 'lg',
                    zIndex: 1000
                }}
            >
                <MenuItem disabled sx={{ cursor: 'default', '&:hover': { backgroundColor: 'transparent' } }}>
                    <Typography level="body-sm" sx={{ fontWeight: 600, color: 'text.primary' }}>
                        Adjuntar archivo
                    </Typography>
                </MenuItem>
                <ListDivider />

                {ATTACHMENT_OPTIONS.map((option) => (
                    <MenuItem
                        key={option.type}
                        onClick={() => onSelect(option.type)}
                        sx={{
                            py: 1,
                            borderRadius: 'md',
                            mx: 1,
                            my: 0.5,
                        }}
                    >
                        <ListItemDecorator>
                            {option.icon}
                        </ListItemDecorator>
                        <div>
                            <Typography level="body-sm" sx={{ fontWeight: 500 }}>
                                {option.label}
                            </Typography>
                            <Typography level="body-xs" sx={{ opacity: 0.7 }}>
                                {option.description}
                            </Typography>
                        </div>
                    </MenuItem>
                ))}

                <ListDivider />
                <MenuItem disabled sx={{
                    cursor: 'default',
                    '&:hover': { backgroundColor: 'transparent' },
                    justifyContent: 'center',
                    py: 1
                }}>
                    <Typography level="body-xs" sx={{ opacity: 0.6 }}>
                        Límite: 100MB por archivo
                    </Typography>
                </MenuItem>
            </Menu>
        </Dropdown>
    );
};