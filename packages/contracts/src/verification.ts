import { DOCUMENT_TYPES, TRANSPORT_TYPES, VERIFICATION_STATES } from '@fi-thnitek/domain';
import { z } from 'zod';
import { DisplayName } from './auth.js';

export const TransportType = z.enum(TRANSPORT_TYPES);
export type TransportType = z.infer<typeof TransportType>;

export const DocumentType = z.enum(DOCUMENT_TYPES);
export type DocumentType = z.infer<typeof DocumentType>;

export const VerificationState = z.enum(VERIFICATION_STATES);
export type VerificationState = z.infer<typeof VerificationState>;

export const DocumentStatus = z.enum(['PENDING', 'ACCEPTED', 'REJECTED']);
export type DocumentStatus = z.infer<typeof DocumentStatus>;

export const IsoDate = z.iso.date();

/** PUT /v1/driver/profile. The CIN is checked for 8 digits server-side and never echoed back in full. */
export const DriverProfileInput = z.object({
  legalFirstName: DisplayName,
  legalLastName: DisplayName,
  cin: z.string().min(8).max(16),
  transportType: TransportType,
});
export type DriverProfileInput = z.infer<typeof DriverProfileInput>;

/** PUT /v1/driver/vehicle */
export const VehicleInput = z.object({
  plate: z.string().min(3).max(24),
  model: z.string().trim().min(2).max(60),
  color: z.string().trim().min(2).max(30),
  seats: z.number().int().min(1).max(80),
});
export type VehicleInput = z.infer<typeof VehicleInput>;

/** Multipart fields sent with POST /v1/driver/documents (the file part is `file`). */
export const DocumentUploadFields = z.object({
  type: DocumentType,
  expiresOn: IsoDate.optional(),
});
export type DocumentUploadFields = z.infer<typeof DocumentUploadFields>;

export const DocumentView = z.object({
  id: z.uuid(),
  type: DocumentType,
  status: DocumentStatus,
  expiresOn: IsoDate.nullable(),
  rejectionReason: z.string().nullable(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  uploadedAt: z.iso.datetime(),
});
export type DocumentView = z.infer<typeof DocumentView>;

export const VehicleView = z.object({
  plateDisplay: z.string(),
  model: z.string(),
  color: z.string(),
  seats: z.number().int(),
});
export type VehicleView = z.infer<typeof VehicleView>;

/** GET /v1/driver/verification — the driver's own file (D1/D2). */
export const MyVerification = z.object({
  state: VerificationState,
  transportType: TransportType.nullable(),
  legalFirstName: z.string().nullable(),
  legalLastName: z.string().nullable(),
  cinLast4: z.string().nullable(),
  vehicle: VehicleView.nullable(),
  documents: z.array(DocumentView),
  requiredDocuments: z.array(DocumentType),
  missingDocuments: z.array(DocumentType),
  canEdit: z.boolean(),
  decisionReason: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
});
export type MyVerification = z.infer<typeof MyVerification>;

// ---------- Admin ----------

export const VerificationQueueItem = z.object({
  userId: z.uuid(),
  legalFirstName: z.string(),
  legalLastName: z.string(),
  transportType: TransportType,
  plateDisplay: z.string().nullable(),
  submittedAt: z.iso.datetime(),
  /** Duplicate CIN / plate / document hashes found with other accounts. */
  warnings: z.number().int(),
});
export type VerificationQueueItem = z.infer<typeof VerificationQueueItem>;

export const DuplicateWarning = z.object({
  kind: z.enum(['CIN', 'PLATE', 'DOCUMENT']),
  otherUserId: z.uuid(),
  documentType: DocumentType.optional(),
});
export type DuplicateWarning = z.infer<typeof DuplicateWarning>;

/** GET /v1/admin/verifications/:userId — audited (reveals the full CIN). */
export const AdminVerificationDetail = MyVerification.omit({ cinLast4: true, canEdit: true }).extend({
  userId: z.uuid(),
  cin: z.string().nullable(),
  warnings: z.array(DuplicateWarning),
});
export type AdminVerificationDetail = z.infer<typeof AdminVerificationDetail>;

export const VerificationDecision = z.enum(['APPROVE', 'REQUEST_CHANGES', 'REJECT']);
export type VerificationDecision = z.infer<typeof VerificationDecision>;

/** POST /v1/admin/verifications/:userId/decision (R-062). A reason is required unless approving. */
export const DecisionRequest = z
  .object({
    decision: VerificationDecision,
    reason: z.string().trim().min(3).max(500).optional(),
    documents: z
      .array(
        z.object({
          documentId: z.uuid(),
          status: z.enum(['ACCEPTED', 'REJECTED']),
          reason: z.string().trim().max(300).optional(),
        }),
      )
      .max(50)
      .optional(),
  })
  .refine((d) => d.decision === 'APPROVE' || d.reason !== undefined, {
    path: ['reason'],
    message: 'a reason is required to request changes or reject',
  });
export type DecisionRequest = z.infer<typeof DecisionRequest>;

/** GET /v1/admin/documents/:id/url — a 60-second signed link (audited). */
export const DocumentUrl = z.object({ url: z.url(), expiresAt: z.iso.datetime() });
export type DocumentUrl = z.infer<typeof DocumentUrl>;
