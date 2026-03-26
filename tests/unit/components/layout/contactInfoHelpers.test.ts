import { describe, expect, it } from 'vitest';
import { isMediaFile } from '../../../../../src/components/layout/contactInfoHelpers';

describe('contactInfoHelpers', () => {
    it('treats pdf files as previewable shared media', () => {
        expect(isMediaFile('application/pdf', 'manual.pdf')).toBe(true);
    });
});