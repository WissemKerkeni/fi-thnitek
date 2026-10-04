import {
  ADMIN_SANCTION_TYPES,
  REPORT_CATEGORIES,
  REPORT_SOURCES,
  REPORT_STATUSES,
  RISK_FLAG_TYPES,
  SANCTION_TYPES,
} from '@fi-thnitek/domain';
import { z } from 'zod';
import { TransportType } from './verification.js';

export const ReportCategory = z.enum(REPORT_CATEGORIES);
export type ReportCategory = z.infer<typeof ReportCategory>;
export const ReportSource = z.enum(REPORT_SOURCES);
export type ReportSource = z.infer<typeof ReportSource>;
export const ReportStatus = z.enum(REPORT_STATUSES);
export type ReportStatus = z.infer<typeof ReportStatus>;
export const SanctionType = z.enum(SANCTION_TYPES);
export type SanctionType = z.infer<typeof SanctionType>;
export const AdminSanctionType = z.enum(ADMIN_SANCTION_TYPES);
export type AdminSanctionType = z.infer<typeof AdminSanctionType>;
export const RiskFlagType = z.enum(RISK_FLAG_TYPES);
export type RiskFlagType = z.infer<typeof RiskFlagType>;
export const ReportPriority = z.enum(['HIGH', 'NORMAL']);
export type ReportPriority = z.infer<typeof ReportPriority>;

const description = z.string().trim().max(500).default('');

/**
 * What a report or a block points at. The phone never knows user ids: a driver marker is its sharing
 * session id (`MapDriver.id`), a passenger marker its request id (`MapPassenger.id`).
 */
export const MarkerRef = z.discriminatedUnion('source', [
  z.object({ source: z.literal('DRIVER_MARKER'), sessionId: z.uuid() }),
  z.object({ source: z.literal('PASSENGER_MARKER'), requestId: z.uuid() }),
]);
export type MarkerRef = z.infer<typeof MarkerRef>;

/**
 * POST /v1/reports (R-070). From history the other person is unknown: the admin finds them through the
 * pick-up records. `block` (R-071) applies to marker reports only.
 */
export const CreateReportInput = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('DRIVER_MARKER'),
    sessionId: z.uuid(),
    category: ReportCategory,
    description,
    block: z.boolean().default(false),
  }),
  z.object({
    source: z.literal('PASSENGER_MARKER'),
    requestId: z.uuid(),
    category: ReportCategory,
    description,
    block: z.boolean().default(false),
  }),
  z.object({ source: z.literal('MY_REQUEST'), requestId: z.uuid(), category: ReportCategory, description }),
  z.object({
    source: z.literal('MY_SESSION'),
    sessionId: z.uuid(),
    /** "Around what time?" (R-070), inside the session. */
    approxAt: z.iso.datetime(),
    category: ReportCategory,
    description,
  }),
]);
export type CreateReportInput = z.input<typeof CreateReportInput>;

export const ReportCreated = z.object({ id: z.uuid(), blocked: z.boolean() });
export type ReportCreated = z.infer<typeof ReportCreated>;

/** POST /v1/blocks (R-071): hides both people from each other's map (R-027). */
export const CreateBlockInput = MarkerRef;
export type CreateBlockInput = z.infer<typeof CreateBlockInput>;

/** GET /v1/blocks. A blocked passenger has no name here unless they had chosen to show it. */
export const BlockView = z.object({
  id: z.uuid(),
  kind: z.enum(['DRIVER', 'PASSENGER']),
  name: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type BlockView = z.infer<typeof BlockView>;
export const BlockList = z.object({ blocks: z.array(BlockView) });
export type BlockList = z.infer<typeof BlockList>;

/**
 * Added to the 403 ACCOUNT_SUSPENDED / ACCOUNT_BANNED problem (R-073): the person learns why and until
 * when, and can write to us with an appeal.
 */
export const AccountSanction = z.object({
  type: z.enum(['SUSPENSION', 'BAN']),
  reason: z.string(),
  endsAt: z.iso.datetime().nullable(),
});
export type AccountSanction = z.infer<typeof AccountSanction>;

/**
 * POST /v1/auth/appeal (R-073, the contact form): a suspended or banned person cannot sign in, so they
 * prove who they are with a fresh Google ID token. One open appeal at a time.
 */
export const AppealInput = z.object({
  idToken: z.string().min(1),
  message: z.string().trim().min(10).max(1000),
});
export type AppealInput = z.infer<typeof AppealInput>;

// ---------------------------------------------------------------------------------------------- admin

const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};
const bool = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const AdminPerson = z.object({ id: z.uuid(), name: z.string().nullable() });
export type AdminPerson = z.infer<typeof AdminPerson>;

export const AdminReportQuery = z.object({
  status: ReportStatus.optional(),
  priority: ReportPriority.optional(),
  userId: z.uuid().optional(),
  ...page,
});
export type AdminReportQuery = z.input<typeof AdminReportQuery>;

export const AdminReport = z.object({
  id: z.uuid(),
  source: ReportSource,
  category: ReportCategory,
  priority: ReportPriority,
  status: ReportStatus,
  description: z.string(),
  reporter: AdminPerson,
  /** Null for reports from history: the admin identifies the person through pick-up records. */
  target: AdminPerson.nullable(),
  requestId: z.uuid().nullable(),
  sessionId: z.uuid().nullable(),
  approxAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  handledBy: AdminPerson.nullable(),
  handledAt: z.iso.datetime().nullable(),
  resolutionNote: z.string().nullable(),
});
export type AdminReport = z.infer<typeof AdminReport>;
export const AdminReportList = z.object({ reports: z.array(AdminReport), total: z.number().int() });
export type AdminReportList = z.infer<typeof AdminReportList>;

/** The linked request, without positions. */
export const AdminRequestSummary = z.object({
  id: z.uuid(),
  passenger: AdminPerson,
  status: z.string(),
  types: z.array(TransportType),
  destinationName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
});
export type AdminRequestSummary = z.infer<typeof AdminRequestSummary>;

export const AdminSessionSummary = z.object({
  id: z.uuid(),
  driver: AdminPerson,
  transportType: TransportType,
  plateDisplay: z.string().nullable(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  endReason: z.string().nullable(),
});
export type AdminSessionSummary = z.infer<typeof AdminSessionSummary>;

export const AdminReportDetail = AdminReport.extend({
  request: AdminRequestSummary.nullable(),
  session: AdminSessionSummary.nullable(),
  /** Other reports on the same person in the last 30 days. */
  targetReports30d: z.number().int(),
});
export type AdminReportDetail = z.infer<typeof AdminReportDetail>;

export const ResolveReportInput = z.object({
  status: z.enum(['ACTIONED', 'DISMISSED']),
  note: z.string().trim().max(500).default(''),
});
export type ResolveReportInput = z.input<typeof ResolveReportInput>;

/**
 * GET /admin/pickups (R-039, NFR-06): by request, or by driver around a time (a session report).
 * Every read is audited.
 */
export const AdminPickupQuery = z
  .object({
    requestId: z.uuid().optional(),
    driverUserId: z.uuid().optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    /** Why the admin is looking (kept in the audit log). */
    reportId: z.uuid().optional(),
  })
  .refine((q) => q.requestId !== undefined || (q.driverUserId !== undefined && q.from && q.to), {
    message: 'requestId, or driverUserId with from and to',
  });
export type AdminPickupQuery = z.input<typeof AdminPickupQuery>;

export const AdminPickupRecord = z.object({
  requestId: z.uuid(),
  passenger: AdminPerson,
  driver: AdminPerson,
  transportType: TransportType.nullable(),
  plateDisplay: z.string().nullable(),
  minDistanceM: z.number().int(),
  recordedAt: z.iso.datetime(),
});
export type AdminPickupRecord = z.infer<typeof AdminPickupRecord>;
export const AdminPickupList = z.object({ records: z.array(AdminPickupRecord) });
export type AdminPickupList = z.infer<typeof AdminPickupList>;

export const AdminSanction = z.object({
  id: z.uuid(),
  type: SanctionType,
  reason: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
  /** Null when automation applied it (REQUEST_PAUSE only). */
  createdBy: AdminPerson.nullable(),
  revokedAt: z.iso.datetime().nullable(),
  active: z.boolean(),
});
export type AdminSanction = z.infer<typeof AdminSanction>;

export const CreateSanctionInput = z
  .object({
    type: AdminSanctionType,
    reason: z.string().trim().min(5).max(500),
    /** Suspensions only: 1–365 days. */
    days: z.number().int().min(1).max(365).nullable().default(null),
    /** The report this answers; it is marked ACTIONED. */
    reportId: z.uuid().nullable().default(null),
  })
  .refine((s) => (s.type === 'SUSPENSION') === (s.days !== null), {
    message: 'days is required for a suspension and only for it',
    path: ['days'],
  });
export type CreateSanctionInput = z.input<typeof CreateSanctionInput>;

export const RevokeSanctionInput = z.object({ reason: z.string().trim().min(5).max(500) });
export type RevokeSanctionInput = z.infer<typeof RevokeSanctionInput>;

export const AdminRiskFlag = z.object({
  id: z.uuid(),
  user: AdminPerson,
  type: RiskFlagType,
  sessionId: z.uuid().nullable(),
  requestId: z.uuid().nullable(),
  /** Measurements only (speeds, intervals, counts), never coordinates. */
  evidence: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
});
export type AdminRiskFlag = z.infer<typeof AdminRiskFlag>;
export const AdminRiskFlagQuery = z.object({ reviewed: bool, userId: z.uuid().optional(), ...page });
export type AdminRiskFlagQuery = z.input<typeof AdminRiskFlagQuery>;
export const AdminRiskFlagList = z.object({ flags: z.array(AdminRiskFlag), total: z.number().int() });
export type AdminRiskFlagList = z.infer<typeof AdminRiskFlagList>;

export const AdminAppeal = z.object({
  id: z.uuid(),
  user: AdminPerson,
  sanction: AdminSanction.nullable(),
  message: z.string(),
  status: z.enum(['OPEN', 'CLOSED']),
  createdAt: z.iso.datetime(),
  handledAt: z.iso.datetime().nullable(),
});
export type AdminAppeal = z.infer<typeof AdminAppeal>;
export const AdminAppealQuery = z.object({ status: z.enum(['OPEN', 'CLOSED']).optional(), ...page });
export type AdminAppealQuery = z.input<typeof AdminAppealQuery>;
export const AdminAppealList = z.object({ appeals: z.array(AdminAppeal), total: z.number().int() });
export type AdminAppealList = z.infer<typeof AdminAppealList>;

export const AdminUserQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED']).optional(),
  ...page,
});
export type AdminUserQuery = z.input<typeof AdminUserQuery>;

export const AdminUserRow = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED']),
  /** The driver file status, or null for passengers. */
  driverStatus: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminUserRow = z.infer<typeof AdminUserRow>;
export const AdminUserList = z.object({ users: z.array(AdminUserRow), total: z.number().int() });
export type AdminUserList = z.infer<typeof AdminUserList>;

/** GET /admin/users/:id: everything a moderator needs to decide, without positions. */
export const AdminUserDetail = AdminUserRow.extend({
  sanctions: z.array(AdminSanction),
  reportsAgainst: z.number().int(),
  reportsFiled: z.number().int(),
  /** How many people blocked them. */
  blockedBy: z.number().int(),
  openFlags: z.number().int(),
  requestsLast30d: z.number().int(),
  sessionsLast30d: z.number().int(),
});
export type AdminUserDetail = z.infer<typeof AdminUserDetail>;

/** GET /admin/stats (PRD §6). */
export const AdminStats = z.object({
  users: z.object({ total: z.number().int(), verifiedDrivers: z.number().int(), new7d: z.number().int() }),
  live: z.object({ sharing: z.number().int(), onBreak: z.number().int(), openRequests: z.number().int() }),
  today: z.object({
    requests: z.number().int(),
    movedAway: z.number().int(),
    expired: z.number().int(),
    sessions: z.number().int(),
  }),
  moderation: z.object({
    openReports: z.number().int(),
    highPriorityOpen: z.number().int(),
    unreviewedFlags: z.number().int(),
    openAppeals: z.number().int(),
    suspended: z.number().int(),
    banned: z.number().int(),
  }),
});
export type AdminStats = z.infer<typeof AdminStats>;
