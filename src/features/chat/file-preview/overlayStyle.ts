export const ATTACHMENT_SHEET_SX = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'rgba(var(--joy-palette-neutral-900Channel, 0 0 0) / 0.95)',
    backdropFilter: 'blur(10px)',
    zIndex: 1300,
};

export const CAMERA_SHEET_Z_INDEX = 1400;

export const SHEET_HEADER_SX = {
    p: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)',
};

export const SHEET_FOOTER_SX = {
    p: 2,
    backgroundColor: 'background.surface',
    borderTop: '1px solid',
    borderColor: 'divider',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
};
