import { describe, expect, it } from 'vitest';

import {
    groupRecipients,
    isGroupDeliveryComplete,
    parseDelivered,
    recordDelivered,
} from '../../../src/main_process/storage/messages/groupDelivery.js';

const ME = 'a'.repeat(64);
const IVAN = 'b'.repeat(64);
const DEV = 'c'.repeat(64);

describe('entrega agregada de un mensaje de grupo', () => {
    it('los destinatarios son los miembros menos yo mismo', () => {
        expect([...groupRecipients([ME, IVAN, DEV.toUpperCase()], ME)].sort()).toEqual([IVAN, DEV].sort());
    });

    it('un solo acuse no completa la entrega', () => {
        const { delivered } = recordDelivered(null, IVAN);

        expect(isGroupDeliveryComplete(delivered, groupRecipients([ME, IVAN, DEV], ME))).toBe(false);
    });

    it('la entrega se completa cuando confirman todos los miembros', () => {
        const first = recordDelivered(null, IVAN);
        const second = recordDelivered(first.stored, DEV);

        expect(isGroupDeliveryComplete(second.delivered, groupRecipients([ME, IVAN, DEV], ME))).toBe(true);
    });

    it('el mismo miembro dos veces no adelanta la entrega', () => {
        const first = recordDelivered(null, IVAN);
        const again = recordDelivered(first.stored, IVAN);

        expect([...again.delivered]).toEqual([IVAN]);
        expect(isGroupDeliveryComplete(again.delivered, groupRecipients([ME, IVAN, DEV], ME))).toBe(false);
    });

    it('un acuse de quien no es miembro no completa la entrega', () => {
        const { delivered } = recordDelivered(null, 'd'.repeat(64));

        expect(isGroupDeliveryComplete(delivered, groupRecipients([ME, IVAN, DEV], ME))).toBe(false);
    });

    it('un grupo sin destinatarios nunca se da por entregado', () => {
        const { delivered } = recordDelivered(null, IVAN);

        expect(isGroupDeliveryComplete(delivered, groupRecipients([ME], ME))).toBe(false);
    });

    it('un valor guardado ilegible se trata como sin acuses', () => {
        expect(parseDelivered('no es json').size).toBe(0);
        expect(parseDelivered('{"a":1}').size).toBe(0);
        expect(parseDelivered(null).size).toBe(0);
    });

    it('guarda los acuses ordenados y sin duplicados', () => {
        const first = recordDelivered(null, DEV);
        const second = recordDelivered(first.stored, IVAN);

        expect(JSON.parse(second.stored)).toEqual([IVAN, DEV].sort());
    });
});
