/**
 * Verification documents (R-060; docs/research-tunisia.md recommendations). The list per transport type
 * is the default; it becomes admin-configurable ("Content → required documents") and needs legal sign-off.
 */
export const TRANSPORT_TYPES = ['TAXI', 'LOUAGE', 'BUS'] as const;
export type TransportType = (typeof TRANSPORT_TYPES)[number];

export const DOCUMENT_TYPES = [
  'CIN_FRONT',
  'CIN_BACK',
  'SELFIE',
  'DRIVING_LICENCE',
  /** Carte professionnelle (taxi, louage). */
  'PROFESSIONAL_CARD',
  /** Carte grise. */
  'VEHICLE_REGISTRATION',
  'INSURANCE',
  /** Carte d'exploitation (taxi, louage). */
  'OPERATING_CARD',
  /** Bus: authorisation from the operator (e.g. SNTRI or a regional company). */
  'OPERATOR_AUTHORISATION',
  /** A photo of the vehicle showing the plate. */
  'VEHICLE_PHOTO',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const IDENTITY: DocumentType[] = ['CIN_FRONT', 'CIN_BACK', 'SELFIE', 'DRIVING_LICENCE'];

export const DEFAULT_REQUIRED_DOCUMENTS: Readonly<Record<TransportType, readonly DocumentType[]>> = {
  TAXI: [
    ...IDENTITY,
    'PROFESSIONAL_CARD',
    'VEHICLE_REGISTRATION',
    'INSURANCE',
    'OPERATING_CARD',
    'VEHICLE_PHOTO',
  ],
  LOUAGE: [
    ...IDENTITY,
    'PROFESSIONAL_CARD',
    'VEHICLE_REGISTRATION',
    'INSURANCE',
    'OPERATING_CARD',
    'VEHICLE_PHOTO',
  ],
  BUS: [...IDENTITY, 'OPERATOR_AUTHORISATION', 'VEHICLE_PHOTO'],
};

/** Documents that carry an expiry date the driver must enter (R-064 reminders and expiry). */
export const EXPIRING_DOCUMENTS: ReadonlySet<DocumentType> = new Set<DocumentType>([
  'DRIVING_LICENCE',
  'PROFESSIONAL_CARD',
  'INSURANCE',
  'OPERATING_CARD',
  'OPERATOR_AUTHORISATION',
]);

export type DocumentStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface DocumentSummary {
  type: DocumentType;
  status: DocumentStatus;
  /** ISO date (YYYY-MM-DD), required for EXPIRING_DOCUMENTS. */
  expiresOn: string | null;
}

/** Calendar date in Africa/Tunis (UTC+1, no DST) as YYYY-MM-DD. */
export function tunisDate(now: Date): string {
  return new Date(now.getTime() + 3_600_000).toISOString().slice(0, 10);
}

function isExpired(doc: DocumentSummary, today: string): boolean {
  return EXPIRING_DOCUMENTS.has(doc.type) && (doc.expiresOn === null || doc.expiresOn <= today);
}

/**
 * Required document types still missing before the file can be submitted: absent, rejected by an admin,
 * or (for expiring types) without a future expiry date. The latest upload per type is the one that counts.
 */
export function missingDocuments(
  transportType: TransportType,
  documents: readonly DocumentSummary[],
  today: string,
  required: Readonly<Record<TransportType, readonly DocumentType[]>> = DEFAULT_REQUIRED_DOCUMENTS,
): DocumentType[] {
  return required[transportType].filter((type) => {
    const usable = documents.filter(
      (d) => d.type === type && d.status !== 'REJECTED' && !isExpired(d, today),
    );
    return usable.length === 0;
  });
}

/** Accepted documents of a verified driver that have expired (→ DOCUMENT_EXPIRED, no sharing). */
export function expiredDocuments(documents: readonly DocumentSummary[], today: string): DocumentType[] {
  return documents.filter((d) => d.status === 'ACCEPTED' && isExpired(d, today)).map((d) => d.type);
}

/** Accepted documents expiring within `withinDays` (reminder push), excluding already-expired ones. */
export function expiringSoon(
  documents: readonly DocumentSummary[],
  today: string,
  withinDays: number,
): DocumentType[] {
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + withinDays);
  const until = limit.toISOString().slice(0, 10);
  return documents
    .filter(
      (d) =>
        d.status === 'ACCEPTED' &&
        EXPIRING_DOCUMENTS.has(d.type) &&
        d.expiresOn !== null &&
        d.expiresOn > today &&
        d.expiresOn <= until,
    )
    .map((d) => d.type);
}
