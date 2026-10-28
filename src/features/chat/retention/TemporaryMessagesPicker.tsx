import React from 'react';
import { Button, DialogContent, DialogTitle, Divider, Modal, ModalDialog, Typography } from '@mui/joy';
import { Check, Timer } from 'lucide-react';
import { RETENTION_PRESETS, resolveRetentionId } from '../../../utils/retention.js';

interface TemporaryMessagesPickerProps {
    open: boolean;
    value?: string | null;
    onSelect: (id: string) => void;
    onClose: () => void;
}

export const TemporaryMessagesPicker: React.FC<TemporaryMessagesPickerProps> = ({ open, value, onSelect, onClose }) => {
    const current = resolveRetentionId(value);

    return (
        <Modal open={open} onClose={onClose}>
            <ModalDialog variant="outlined" sx={{ maxWidth: 420, borderRadius: 'md' }}>
                <DialogTitle>
                    <Timer style={{ fontSize: 20 }} />
                    Mensajes temporales
                </DialogTitle>
                <Divider />
                <DialogContent>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1.5 }}>
                        Los mensajes nuevos de esta conversación se borran de este dispositivo al cumplirse el plazo.
                        Los que ya existen no cambian.
                    </Typography>
                    <div role="radiogroup" aria-label="Mensajes temporales">
                        {RETENTION_PRESETS.map((preset) => {
                            const selected = preset.id === current;

                            return (
                                <Button
                                    key={preset.id}
                                    role="radio"
                                    aria-checked={selected}
                                    data-retention-option={preset.id}
                                    variant="plain"
                                    color="neutral"
                                    onClick={() => onSelect(preset.id)}
                                    sx={{
                                        width: '100%',
                                        justifyContent: 'space-between',
                                        mb: 0.5,
                                        borderRadius: 'sm',
                                        bgcolor: selected ? 'background.level1' : 'transparent',
                                        '&:hover': { bgcolor: 'background.level1' },
                                    }}
                                >
                                    <span>{preset.label}</span>
                                    {selected && <Check style={{ fontSize: 16 }} />}
                                </Button>
                            );
                        })}
                    </div>
                </DialogContent>
            </ModalDialog>
        </Modal>
    );
};
