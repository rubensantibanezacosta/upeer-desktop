import React, { useState } from 'react';
import { Alert, Box, Button, DialogTitle, Modal, ModalClose, ModalDialog, Tab, TabList, TabPanel, Tabs, Typography } from '@mui/joy';

type ShareSource = { id: string; name: string; type: 'screen' | 'window'; thumbnail: string; appIcon: string | null };
type Props = { open: boolean; sources: ShareSource[]; onClose: () => void; onSelect: () => void; onError: (message: string) => void };

export function ScreenSharePicker({ open, sources, onClose, onSelect, onError }: Props) {
    const [sourceType, setSourceType] = useState<'screen' | 'window'>('screen');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const close = () => {
        void window.upeer.cancelScreenShareSelection();
        onClose();
    };

    const selectSource = async (source: ShareSource) => {
        setLoading(true);
        try {
            const result = await window.upeer.selectScreenShareSource(source.id);
            if (!result.success) {
                setError('La fuente seleccionada ya no está disponible.');
                setLoading(false);
                return;
            }
            onSelect();
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : 'No se pudo seleccionar la fuente.';
            setError(message);
            onError(message);
            setLoading(false);
        }
    };

    return (
        <Modal open={open} onClose={close} keepMounted>
            <ModalDialog sx={{ width: 'min(960px, calc(100vw - 40px))', maxHeight: 'min(760px, calc(100vh - 40px))', p: 3, gap: 2, overflow: 'auto', bgcolor: '#202124', color: 'white', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
                <ModalClose sx={{ color: 'white' }} />
                <DialogTitle sx={{ fontSize: 24, color: 'white' }}>Comparte tu pantalla</DialogTitle>
                <Typography level="body-sm" sx={{ color: 'rgba(255,255,255,0.7)' }}>Selecciona una pantalla o ventana para compartir.</Typography>
                {loading && sources.length === 0 ? <Typography sx={{ py: 6, textAlign: 'center', color: 'white' }}>Buscando pantallas y ventanas…</Typography> : <>
                    <Tabs value={sourceType} onChange={(_event, value) => setSourceType(value as 'screen' | 'window')}>
                        <TabList sx={{ bgcolor: 'transparent', borderBottom: '1px solid rgba(255,255,255,0.16)' }}>
                            <Tab value="screen">Pantallas</Tab><Tab value="window">Ventanas</Tab>
                        </TabList>
                        {(['screen', 'window'] as const).map((type) => (
                            <TabPanel key={type} value={type} sx={{ p: 0, pt: 2 }}>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 2 }}>
                                    {sources.filter((source) => source.type === type).map((source) => (
                                        <Box key={source.id} component="button" disabled={loading} onClick={() => void selectSource(source)} sx={{ minWidth: 0, p: 1, textAlign: 'left', border: '2px solid transparent', borderRadius: 12, bgcolor: '#303134', color: 'white', cursor: 'pointer', '&:hover': { borderColor: '#8ab4f8', bgcolor: '#3c4043' }, '&:focus-visible': { outline: '2px solid #8ab4f8' } }}>
                                            <Box component="img" src={source.thumbnail} alt="" sx={{ display: 'block', width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 8, bgcolor: '#171717' }} />
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.25, px: 0.5 }}>
                                                {source.appIcon && <Box component="img" src={source.appIcon} alt="" sx={{ width: 20, height: 20, objectFit: 'contain' }} />}
                                                <Typography level="title-sm" noWrap sx={{ color: 'white' }}>{source.name}</Typography>
                                            </Box>
                                        </Box>
                                    ))}
                                    {!sources.some((source) => source.type === type) && <Typography sx={{ gridColumn: '1 / -1', py: 5, textAlign: 'center', color: 'rgba(255,255,255,0.65)' }}>No hay {type === 'screen' ? 'pantallas' : 'ventanas'} disponibles.</Typography>}
                                </Box>
                            </TabPanel>
                        ))}
                    </Tabs>
                    {error && <Alert color="danger">{error}</Alert>}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}><Button variant="plain" color="neutral" onClick={close}>Cancelar</Button></Box>
                </>}
            </ModalDialog>
        </Modal>
    );
}