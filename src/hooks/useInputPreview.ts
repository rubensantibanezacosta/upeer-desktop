import { useState, useEffect, useRef } from 'react';
import type { LinkPreview } from '../types/chat.js';

const URL_RE = /(https?:\/\/[^\s<>"']+)/i;
const MD_RE = /\*\*[\s\S]+?\*\*|_[\s\S]+?_|~~[\s\S]+?~~|`[^`]+`/;

export function useInputPreview(message: string) {
    const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastUrlRef = useRef('');

    const hasMd = MD_RE.test(message);

    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);

        const urlMatch = URL_RE.exec(message);
        const url = urlMatch ? urlMatch[1] : '';

        if (!url) {
            setLinkPreview(null);
            lastUrlRef.current = '';
            return;
        }

        if (url === lastUrlRef.current) return;

        timerRef.current = setTimeout(async () => {
            lastUrlRef.current = url;
            setIsLoadingPreview(true);
            try {
                const result = await window.upeer?.fetchOgPreview?.(url);
                setLinkPreview(result ?? null);
            } catch {
                setLinkPreview(null);
            } finally {
                setIsLoadingPreview(false);
            }
        }, 600);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [message]);

    const dismissPreview = () => {
        setLinkPreview(null);
        lastUrlRef.current = '';
    };

    return { linkPreview, isLoadingPreview, hasMd, dismissPreview };
}
