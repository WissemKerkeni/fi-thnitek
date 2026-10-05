import {
  AdminAppealList,
  AdminPickupList,
  type AdminPickupQuery,
  AdminReportDetail,
  AdminReportList,
  AdminRiskFlagList,
  AdminStats,
  AdminUserDetail,
  AdminUserList,
  type CreateSanctionInput,
  type ResolveReportInput,
} from '@fi-thnitek/contracts';
import { z } from 'zod';
import { adminSession } from './admin-session';

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  return p.toString();
};

/** Moderation console (anti-abuse §4). Nothing here carries coordinates. */
export const moderationApi = {
  reports: (q: { status?: string; priority?: string; userId?: string; page: number; pageSize: number }) =>
    adminSession.request('GET', `/admin/reports?${qs(q)}`, AdminReportList),
  report: (id: string) => adminSession.request('GET', `/admin/reports/${id}`, AdminReportDetail),
  resolve: (id: string, body: ResolveReportInput) =>
    adminSession.request('POST', `/admin/reports/${id}/resolve`, AdminReportDetail, body),

  /** Audited server-side (who looked, at what, why). */
  pickups: (q: AdminPickupQuery) => adminSession.request('GET', `/admin/pickups?${qs(q)}`, AdminPickupList),

  users: (q: { q?: string; status?: string; page: number; pageSize: number }) =>
    adminSession.request('GET', `/admin/users?${qs(q)}`, AdminUserList),
  user: (id: string) => adminSession.request('GET', `/admin/users/${id}`, AdminUserDetail),
  sanction: (userId: string, body: CreateSanctionInput) =>
    adminSession.request('POST', `/admin/users/${userId}/sanctions`, AdminUserDetail, body),
  revokeSanction: (id: string, reason: string) =>
    adminSession.request('POST', `/admin/sanctions/${id}/revoke`, z.undefined(), { reason }),

  flags: (q: { reviewed?: boolean; userId?: string; page: number; pageSize: number }) =>
    adminSession.request('GET', `/admin/risk-flags?${qs(q)}`, AdminRiskFlagList),
  reviewFlag: (id: string) => adminSession.request('POST', `/admin/risk-flags/${id}/review`, z.undefined()),

  appeals: (q: { status?: string; page: number; pageSize: number }) =>
    adminSession.request('GET', `/admin/appeals?${qs(q)}`, AdminAppealList),
  closeAppeal: (id: string) => adminSession.request('POST', `/admin/appeals/${id}/close`, z.undefined()),

  stats: () => adminSession.request('GET', '/admin/stats', AdminStats),
};

export const CATEGORY = {
  NOBODY_THERE: 'Personne au point',
  FAKE_PROFILE: 'Faux profil',
  HARASSMENT: 'Harcèlement',
  UNSAFE: 'Danger',
  SPAM: 'Spam / abus',
  OTHER: 'Autre',
} as const;

export const SOURCE = {
  DRIVER_MARKER: 'Marqueur chauffeur',
  PASSENGER_MARKER: 'Marqueur passager',
  MY_REQUEST: 'Historique des demandes',
  MY_SESSION: 'Historique des partages',
} as const;

export const SANCTION = {
  WARNING: 'Avertissement',
  REQUEST_PAUSE: 'Pause des demandes',
  SUSPENSION: 'Suspension',
  BAN: 'Bannissement',
} as const;

export const FLAG = {
  MOCK_LOCATION: 'Fausse localisation',
  IMPOSSIBLE_JUMP: 'Saut impossible',
  MULTI_ACCOUNT_DEVICE: 'Plusieurs comptes sur un appareil',
  NOBODY_THERE_CLUSTER: '« Personne au point » répétés',
  REPORTS_CLUSTER: 'Signalements répétés',
} as const;

export const STATUS = {
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  BANNED: 'Banni',
  DELETED: 'Supprimé',
} as const;

export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('fr-TN') : '—');
