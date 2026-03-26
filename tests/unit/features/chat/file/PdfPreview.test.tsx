import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@mui/icons-material/OpenInNew', () => ({ default: () => <div data-testid="OpenInNewIcon" /> }));

import { PdfPreview } from '../../../../../src/features/chat/file/PdfPreview.js';

describe('PdfPreview', () => {
    it('renders a sandboxed iframe with a hardened PDF URL', () => {
        const { container } = render(<PdfPreview src="media:///tmp/manual.pdf" name="manual.pdf" />);

        const iframe = container.querySelector('iframe');
        expect(iframe).toBeTruthy();
        expect(iframe?.getAttribute('src')).toBe('media:///tmp/manual.pdf#toolbar=0&navpanes=0&scrollbar=1');
        expect(iframe?.getAttribute('sandbox')).toBe('allow-downloads allow-same-origin allow-scripts');
        expect(iframe?.getAttribute('referrerpolicy')).toBe('no-referrer');
        expect(iframe?.getAttribute('loading')).toBe('lazy');
    });

    it('preserves existing fragments when building the PDF URL', () => {
        const { container } = render(<PdfPreview src="media:///tmp/manual.pdf#page=3" name="manual.pdf" />);

        const iframe = container.querySelector('iframe');
        expect(iframe?.getAttribute('src')).toBe('media:///tmp/manual.pdf#page=3&toolbar=0&navpanes=0&scrollbar=1');
    });

    it('calls the external open handler when available', () => {
        const onOpenExternal = vi.fn();
        render(<PdfPreview src="media:///tmp/manual.pdf" name="manual.pdf" onOpenExternal={onOpenExternal} />);

        fireEvent.click(screen.getByRole('button', { name: /abrir en el sistema/i }));
        expect(onOpenExternal).toHaveBeenCalledTimes(1);
    });
});