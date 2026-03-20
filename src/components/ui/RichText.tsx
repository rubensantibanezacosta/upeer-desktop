import React from 'react';
import { Box, Link, Typography } from '@mui/joy';
import type { TypographyProps } from '@mui/joy';

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;
const MARKDOWN_REGEX = /(\*\*[\s\S]+?\*\*|_[\s\S]+?_|~~[\s\S]+?~~|`[^`]+`)/g;

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

function isSafeUrl(raw: string): boolean {
    try {
        const url = new URL(raw);
        return ALLOWED_PROTOCOLS.includes(url.protocol);
    } catch {
        return false;
    }
}

function renderInlineLinks(text: string, isMe: boolean, keyPrefix: string): React.ReactNode[] {
    const parts = text.split(URL_REGEX);
    return parts.map((part, i) => {
        if (URL_REGEX.test(part) && isSafeUrl(part)) {
            URL_REGEX.lastIndex = 0;
            return (
                <Link
                    key={`${keyPrefix}-link-${i}`}
                    href={part}
                    rel="noopener noreferrer"
                    sx={{
                        wordBreak: 'break-all',
                        color: isMe ? 'primary.solidColor' : 'primary.plainColor',
                        textDecoration: 'underline',
                        '&:hover': { opacity: 0.8 },
                    }}
                    onClick={(e) => {
                        e.preventDefault();
                        window.upeer?.openExternal?.(part);
                    }}
                >
                    {part}
                </Link>
            );
        }
        URL_REGEX.lastIndex = 0;
        return part || null;
    });
}

function renderMarkdownToken(token: string, isMe: boolean, key: string): React.ReactNode {
    if (token.startsWith('**') && token.endsWith('**')) {
        const inner = token.slice(2, -2);
        return (
            <Box key={key} component="span" sx={{ fontWeight: 700 }}>
                {renderInlineLinks(inner, isMe, key)}
            </Box>
        );
    }
    if (token.startsWith('_') && token.endsWith('_')) {
        const inner = token.slice(1, -1);
        return (
            <Box key={key} component="span" sx={{ fontStyle: 'italic' }}>
                {renderInlineLinks(inner, isMe, key)}
            </Box>
        );
    }
    if (token.startsWith('~~') && token.endsWith('~~')) {
        const inner = token.slice(2, -2);
        return (
            <Box key={key} component="span" sx={{ textDecoration: 'line-through' }}>
                {renderInlineLinks(inner, isMe, key)}
            </Box>
        );
    }
    if (token.startsWith('`') && token.endsWith('`')) {
        return (
            <Box
                key={key}
                component="code"
                sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.875em',
                    bgcolor: isMe ? 'rgba(0,0,0,0.2)' : 'neutral.softBg',
                    px: 0.5,
                    py: 0.1,
                    borderRadius: '4px',
                }}
            >
                {token.slice(1, -1)}
            </Box>
        );
    }
    return null;
}

interface RichTextProps extends Omit<TypographyProps, 'children'> {
    children: string;
    isMe?: boolean;
}

export const RichText: React.FC<RichTextProps> = ({ children, isMe = false, ...typographyProps }) => {
    const parts = children.split(MARKDOWN_REGEX);

    const nodes = parts.map((part, i) => {
        if (!part) return null;
        const key = `rt-${i}`;
        if (MARKDOWN_REGEX.test(part)) {
            MARKDOWN_REGEX.lastIndex = 0;
            return renderMarkdownToken(part, isMe, key);
        }
        MARKDOWN_REGEX.lastIndex = 0;
        return renderInlineLinks(part, isMe, key);
    });

    return (
        <Typography {...typographyProps}>
            {nodes}
        </Typography>
    );
};
