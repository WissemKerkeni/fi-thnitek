import { describe, expect, it } from 'vitest';
import { InvalidStateTransitionError } from '../state-machines/fsm.js';
import {
  DEFAULT_REQUIRED_DOCUMENTS,
  DEFAULT_SEATS,
  type DocumentSummary,
  expiredDocuments,
  expiringSoon,
  missingDocuments,
  tunisDate,
} from './documents.js';
import { displayPlate, normalizeCin, normalizePlate } from './identifiers.js';
import { canEditVerification, isDriverOnlyAccount, verificationMachine } from './verification.js';

describe('verificationMachine (docs/domain-model.md)', () => {
  it('follows the documented happy path', () => {
    expect(verificationMachine.transition('DRAFT', 'SUBMIT')).toBe('UNDER_REVIEW');
    expect(verificationMachine.transition('UNDER_REVIEW', 'APPROVE')).toBe('VERIFIED');
  });

  it('supports changes requested → resubmit, and renewal after expiry', () => {
    expect(verificationMachine.transition('UNDER_REVIEW', 'REQUEST_CHANGES')).toBe('CHANGES_REQUESTED');
    expect(verificationMachine.transition('CHANGES_REQUESTED', 'SUBMIT')).toBe('UNDER_REVIEW');
    expect(verificationMachine.transition('VERIFIED', 'DOCUMENT_EXPIRED')).toBe('EXPIRED');
    expect(verificationMachine.transition('EXPIRED', 'SUBMIT')).toBe('UNDER_REVIEW');
  });

  it('suspends and reinstates verified drivers', () => {
    expect(verificationMachine.transition('VERIFIED', 'SUSPEND')).toBe('SUSPENDED');
    expect(verificationMachine.transition('SUSPENDED', 'REINSTATE')).toBe('VERIFIED');
  });

  it('makes rejection final and forbids skipping review', () => {
    expect(verificationMachine.allowedEvents('REJECTED')).toEqual([]);
    expect(() => verificationMachine.transition('DRAFT', 'APPROVE')).toThrow(InvalidStateTransitionError);
    expect(() => verificationMachine.transition('CHANGES_REQUESTED', 'APPROVE')).toThrow(
      InvalidStateTransitionError,
    );
    expect(() => verificationMachine.transition('UNDER_REVIEW', 'SUBMIT')).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('lets drivers edit only before review or when asked to', () => {
    expect(['DRAFT', 'CHANGES_REQUESTED', 'EXPIRED'].every((s) => canEditVerification(s as never))).toBe(
      true,
    );
    expect(
      ['UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED'].some((s) => canEditVerification(s as never)),
    ).toBe(false);
  });

  it('makes verified accounts driver-only (ADR-205)', () => {
    expect(isDriverOnlyAccount('VERIFIED')).toBe(true);
    expect(isDriverOnlyAccount('SUSPENDED')).toBe(true);
    expect(isDriverOnlyAccount('UNDER_REVIEW')).toBe(false);
    expect(isDriverOnlyAccount(null)).toBe(false);
  });
});

describe('required documents', () => {
  const today = '2026-10-03';
  const ok = (type: DocumentSummary['type'], expiresOn: string | null = null): DocumentSummary => ({
    type,
    status: 'PENDING',
    expiresOn,
  });

  it('lists everything for an empty taxi file', () => {
    expect(missingDocuments('TAXI', [], today)).toEqual(DEFAULT_REQUIRED_DOCUMENTS.TAXI);
  });

  it('does not ask bus drivers for a professional card or carte grise', () => {
    expect(DEFAULT_REQUIRED_DOCUMENTS.BUS).not.toContain('PROFESSIONAL_CARD');
    expect(DEFAULT_REQUIRED_DOCUMENTS.BUS).toContain('OPERATOR_AUTHORISATION');
  });

  it('keeps the file short: no selfie, insurance or vehicle photo (ADR-216)', () => {
    for (const docs of Object.values(DEFAULT_REQUIRED_DOCUMENTS)) {
      expect(docs).not.toContain('SELFIE');
      expect(docs).not.toContain('INSURANCE');
      expect(docs).not.toContain('VEHICLE_PHOTO');
    }
    expect(DEFAULT_REQUIRED_DOCUMENTS.TAXI).toEqual([
      'CIN_FRONT',
      'CIN_BACK',
      'DRIVING_LICENCE',
      'PROFESSIONAL_CARD',
      'VEHICLE_REGISTRATION',
      'OPERATING_CARD',
    ]);
  });

  it('defaults seats by vehicle type', () => {
    expect(DEFAULT_SEATS).toEqual({ TAXI: 4, LOUAGE: 8, BUS: null });
  });

  it('accepts a complete louage file', () => {
    const docs = DEFAULT_REQUIRED_DOCUMENTS.LOUAGE.map((t) => ok(t, '2027-06-30'));
    expect(missingDocuments('LOUAGE', docs, today)).toEqual([]);
  });

  it('treats rejected, undated or expired expiring documents as missing', () => {
    const docs = DEFAULT_REQUIRED_DOCUMENTS.TAXI.map((t) => ok(t, '2027-06-30'));
    docs[0] = { ...docs[0]!, status: 'REJECTED' }; // CIN_FRONT
    docs[2] = ok('DRIVING_LICENCE', null);
    docs[5] = ok('OPERATING_CARD', today); // expires today = expired
    expect(missingDocuments('TAXI', docs, today)).toEqual(['CIN_FRONT', 'DRIVING_LICENCE', 'OPERATING_CARD']);
  });

  it('counts a re-upload after a rejection', () => {
    const docs = DEFAULT_REQUIRED_DOCUMENTS.BUS.map((t) => ok(t, '2027-06-30'));
    docs.push({ type: 'CIN_BACK', status: 'REJECTED', expiresOn: null });
    expect(missingDocuments('BUS', docs, today)).toEqual([]);
  });

  it('finds accepted documents that expired and those expiring soon', () => {
    const docs: DocumentSummary[] = [
      { type: 'PROFESSIONAL_CARD', status: 'ACCEPTED', expiresOn: '2026-10-02' },
      { type: 'OPERATING_CARD', status: 'ACCEPTED', expiresOn: '2026-10-20' },
      { type: 'DRIVING_LICENCE', status: 'ACCEPTED', expiresOn: '2028-03-01' },
      { type: 'CIN_FRONT', status: 'ACCEPTED', expiresOn: null },
    ];
    expect(expiredDocuments(docs, today)).toEqual(['PROFESSIONAL_CARD']);
    expect(expiringSoon(docs, today, 30)).toEqual(['OPERATING_CARD']);
  });

  it('uses the Tunis calendar day', () => {
    expect(tunisDate(new Date('2026-10-03T22:59:59Z'))).toBe('2026-10-03');
    expect(tunisDate(new Date('2026-10-03T23:00:00Z'))).toBe('2026-10-04');
  });
});

describe('identifiers', () => {
  it('normalises Tunisian CINs', () => {
    expect(normalizeCin('01234567')).toBe('01234567');
    expect(normalizeCin('٠١٢٣٤٥٦٧')).toBe('01234567');
    expect(normalizeCin('0123 4567')).toBe('01234567');
    expect(normalizeCin('1234567')).toBeNull();
    expect(normalizeCin('A1234567')).toBeNull();
  });

  it('normalises Arabic and Latin spellings of the same plate', () => {
    expect(normalizePlate('123 تونس 4567')).toBe('123TU4567');
    expect(normalizePlate('123 tu 4567')).toBe('123TU4567');
    expect(normalizePlate('١٢٣ تونس ٤٥٦٧')).toBe('123TU4567');
    expect(normalizePlate('RS 12345')).toBe('RS12345');
    expect(normalizePlate('!!!')).toBeNull();
    expect(displayPlate('123TU4567')).toBe('123 تونس 4567');
  });
});
