import { describe, expect, it } from 'vitest';
import { getTrustMeta, isMediaFile } from '../../../../src/components/layout/contactInfoHelpers.js';

describe('contactInfoHelpers', () => {
    it('treats pdf files as previewable shared media', () => {
        expect(isMediaFile('application/pdf', 'manual.pdf')).toBe(true);
    });
});

describe('getTrustMeta', () => {
    it('solo devuelve metadatos cuando la reputación es muy mala', () => {
        expect(getTrustMeta(12)?.label).toContain('Reputación baja');
        expect(getTrustMeta(12)?.Icon).toBeDefined();
    });

    it('calla en el umbral, por encima y sin dato', () => {
        expect(getTrustMeta(40)).toBeNull();
        expect(getTrustMeta(50)).toBeNull();
        expect(getTrustMeta(85)).toBeNull();
        expect(getTrustMeta()).toBeNull();
    });
});
