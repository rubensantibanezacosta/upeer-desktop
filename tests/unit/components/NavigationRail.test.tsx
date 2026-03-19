import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mocking icons to avoid @mui/material dependency issues in tests
vi.mock('@mui/icons-material/Chat', () => ({ default: () => <div data-testid="ChatIcon" /> }));
vi.mock('@mui/icons-material/DonutLarge', () => ({ default: () => <div data-testid="DonutLargeIcon" /> }));
vi.mock('@mui/icons-material/Groups', () => ({ default: () => <div data-testid="GroupsIcon" /> }));
vi.mock('@mui/icons-material/Settings', () => ({ default: () => <div data-testid="SettingsIcon" /> }));

import { NavigationRail } from '../../../src/components/layout/NavigationRail';

describe('NavigationRail Component', () => {
    const defaultProps = {
        myIp: '127.0.0.1',
        myInitial: 'R',
        activeView: 'chat' as const
    };

    it('renders navigation icons', () => {
        render(<NavigationRail {...defaultProps} />);
        expect(screen.getByTestId('ChatIcon')).toBeDefined();
        expect(screen.getByTestId('SettingsIcon')).toBeDefined();
    });

    it('calls onOpenSettings when settings icon is clicked', () => {
        const onOpenSettings = vi.fn();
        render(<NavigationRail {...defaultProps} onOpenSettings={onOpenSettings} />);

        const settingsButton = screen.getByLabelText('Ajustes');
        fireEvent.click(settingsButton);

        expect(onOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenIdentity when avatar is clicked', () => {
        const onOpenIdentity = vi.fn();
        render(<NavigationRail {...defaultProps} onOpenIdentity={onOpenIdentity} />);

        const avatar = screen.getByText('R');
        fireEvent.click(avatar);

        expect(onOpenIdentity).toHaveBeenCalledTimes(1);
    });

    it('shows current initial if no avatar is provided', () => {
        render(<NavigationRail {...defaultProps} myInitial="JD" />);
        expect(screen.getByText('JD')).toBeDefined();
    });

    it('highlights active view', () => {
        const { rerender } = render(<NavigationRail {...defaultProps} activeView="chat" />);
        const chatButton = screen.getByLabelText('Chats');
        const actualButton = chatButton.tagName === 'BUTTON' ? chatButton : chatButton.querySelector('button') || chatButton;
        expect(actualButton.className).toContain('MuiIconButton-variantSoft');

        rerender(<NavigationRail {...defaultProps} activeView="settings" />);
        const settingsButton = screen.getByLabelText('Ajustes');
        const actualSettingsButton = settingsButton.tagName === 'BUTTON' ? settingsButton : settingsButton.querySelector('button') || settingsButton;
        expect(actualSettingsButton.className).toContain('MuiIconButton-variantSoft');
    });
});
