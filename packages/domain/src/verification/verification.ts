import { defineMachine } from '../state-machines/fsm.js';

/** docs/domain-model.md § Drivers: driver verification status. */
export const VERIFICATION_STATES = [
  'DRAFT',
  'UNDER_REVIEW',
  'VERIFIED',
  'CHANGES_REQUESTED',
  'REJECTED',
  'EXPIRED',
  'SUSPENDED',
] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export type VerificationEvent =
  'SUBMIT' | 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT' | 'DOCUMENT_EXPIRED' | 'SUSPEND' | 'REINSTATE';

export const verificationMachine = defineMachine<VerificationState, VerificationEvent>(
  'driver_verification',
  {
    DRAFT: { SUBMIT: 'UNDER_REVIEW' },
    UNDER_REVIEW: { APPROVE: 'VERIFIED', REQUEST_CHANGES: 'CHANGES_REQUESTED', REJECT: 'REJECTED' },
    CHANGES_REQUESTED: { SUBMIT: 'UNDER_REVIEW' },
    VERIFIED: { DOCUMENT_EXPIRED: 'EXPIRED', SUSPEND: 'SUSPENDED' },
    EXPIRED: { SUBMIT: 'UNDER_REVIEW' },
    SUSPENDED: { REINSTATE: 'VERIFIED' },
    REJECTED: {},
  },
);

/** The driver may edit their file (profile, vehicle, documents) only in these states. */
export function canEditVerification(state: VerificationState): boolean {
  return state === 'DRAFT' || state === 'CHANGES_REQUESTED' || state === 'EXPIRED';
}

/** ADR-205: once VERIFIED the account is driver-only (no passenger requests), including while suspended/expired. */
export function isDriverOnlyAccount(state: VerificationState | null | undefined): boolean {
  return state === 'VERIFIED' || state === 'EXPIRED' || state === 'SUSPENDED';
}
