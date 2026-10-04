import {
  AdminVerificationDetail,
  type DecisionRequest,
  DocumentUrl,
  VerificationQueueItem,
  type VerificationState,
} from '@fi-thnitek/contracts';
import { adminSession } from './admin-session';

export const verificationsApi = {
  queue: (state: VerificationState = 'UNDER_REVIEW') =>
    adminSession.request('GET', `/admin/verifications?state=${state}`, VerificationQueueItem.array()),
  /** Audited on the server (reveals the CIN). */
  detail: (userId: string) =>
    adminSession.request('GET', `/admin/verifications/${userId}`, AdminVerificationDetail),
  /** Audited on the server; the link expires after 60 seconds. */
  documentUrl: (documentId: string) =>
    adminSession.request('GET', `/admin/documents/${documentId}/url`, DocumentUrl),
  decide: (userId: string, decision: DecisionRequest) =>
    adminSession.request(
      'POST',
      `/admin/verifications/${userId}/decision`,
      AdminVerificationDetail,
      decision,
    ),
};
