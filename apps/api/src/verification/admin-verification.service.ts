import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  AdminVerificationDetail,
  DecisionRequest,
  DocumentUrl,
  DuplicateWarning,
  VerificationQueueItem,
  VerificationState,
} from '@fi-thnitek/contracts';
import { type VerificationEvent, missingDocuments, tunisDate, verificationMachine } from '@fi-thnitek/domain';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/api-exception.js';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { driverDocuments, driverProfiles, vehicles } from '../db/schema/index.js';
import { type PushEvent, PushService } from '../notifications/push.service.js';
import { SIGNED_URL_TTL_S, STORAGE, type StorageService } from '../storage/storage.service.js';
import { CIN_PROTECTOR, type CinProtector } from './cin-crypto.js';
import { VerificationService } from './verification.service.js';

const EVENT: Record<DecisionRequest['decision'], VerificationEvent> = {
  APPROVE: 'APPROVE',
  REQUEST_CHANGES: 'REQUEST_CHANGES',
  REJECT: 'REJECT',
};
const PUSH: Record<DecisionRequest['decision'], PushEvent> = {
  APPROVE: 'VERIFICATION_APPROVED',
  REQUEST_CHANGES: 'VERIFICATION_CHANGES_REQUESTED',
  REJECT: 'VERIFICATION_REJECTED',
};

/** Admin review (R-062, PRD §6). Every read of identity data or documents is audited (docs/security.md). */
@Injectable()
export class AdminVerificationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(STORAGE) private readonly storage: StorageService,
    @Inject(CIN_PROTECTOR) private readonly cin: CinProtector,
    private readonly drivers: VerificationService,
    private readonly audit: AuditService,
    private readonly push: PushService,
  ) {}

  /** Oldest submissions first. */
  async queue(state: VerificationState = 'UNDER_REVIEW'): Promise<VerificationQueueItem[]> {
    const rows = await this.db
      .select({
        userId: driverProfiles.userId,
        legalFirstName: driverProfiles.legalFirstName,
        legalLastName: driverProfiles.legalLastName,
        transportType: driverProfiles.transportType,
        submittedAt: driverProfiles.submittedAt,
        updatedAt: driverProfiles.updatedAt,
        plateDisplay: vehicles.plateDisplay,
        warnings: sql<number>`(
          SELECT count(*)::int FROM ${driverDocuments} d
          WHERE d.driver_user_id = ${driverProfiles.userId}
            AND EXISTS (SELECT 1 FROM ${driverDocuments} o WHERE o.sha256 = d.sha256 AND o.driver_user_id <> d.driver_user_id)
        )`,
      })
      .from(driverProfiles)
      .leftJoin(vehicles, eq(vehicles.driverUserId, driverProfiles.userId))
      .where(eq(driverProfiles.status, state))
      .orderBy(asc(driverProfiles.submittedAt));
    return rows.map((r) => ({
      userId: r.userId,
      legalFirstName: r.legalFirstName,
      legalLastName: r.legalLastName,
      transportType: r.transportType,
      plateDisplay: r.plateDisplay,
      submittedAt: (r.submittedAt ?? r.updatedAt).toISOString(),
      warnings: r.warnings,
    }));
  }

  async detail(userId: string, adminId: string): Promise<AdminVerificationDetail> {
    const [profile] = await this.db.select().from(driverProfiles).where(eq(driverProfiles.userId, userId));
    if (!profile) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
    const mine = await this.drivers.getMine(userId);
    const docs = await this.drivers.documentsOf(userId);

    const warnings: DuplicateWarning[] = [];
    if (docs.length > 0) {
      const dupes = await this.db
        .select({ sha256: driverDocuments.sha256, otherUserId: driverDocuments.driverUserId })
        .from(driverDocuments)
        .where(
          and(
            inArray(
              driverDocuments.sha256,
              docs.map((d) => d.sha256),
            ),
            ne(driverDocuments.driverUserId, userId),
          ),
        );
      for (const dupe of dupes) {
        const mineDoc = docs.find((d) => d.sha256 === dupe.sha256);
        warnings.push({ kind: 'DOCUMENT', otherUserId: dupe.otherUserId, documentType: mineDoc?.type });
      }
    }

    await this.audit.record({
      actorType: 'ADMIN',
      actorUserId: adminId,
      action: 'verification.view',
      targetType: 'driver',
      targetId: userId,
    });
    const { cinLast4: _last4, canEdit: _canEdit, ...rest } = mine;
    return { ...rest, userId, cin: this.cin.decrypt(profile.cinEncrypted), warnings };
  }

  async documentUrl(documentId: string, adminId: string): Promise<DocumentUrl> {
    const [doc] = await this.db
      .select({
        storageKey: driverDocuments.storageKey,
        driverUserId: driverDocuments.driverUserId,
        type: driverDocuments.type,
      })
      .from(driverDocuments)
      .where(eq(driverDocuments.id, documentId));
    if (!doc) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
    const url = await this.storage.signedGetUrl(doc.storageKey);
    await this.audit.record({
      actorType: 'ADMIN',
      actorUserId: adminId,
      action: 'document.view',
      targetType: 'driver_document',
      targetId: documentId,
      metadata: { driverUserId: doc.driverUserId, type: doc.type },
    });
    return { url, expiresAt: new Date(Date.now() + SIGNED_URL_TTL_S * 1000).toISOString() };
  }

  /** R-062: one transaction (state + documents + audit), then the push (R-063). */
  async decide(
    userId: string,
    adminId: string,
    req: DecisionRequest,
    now = new Date(),
  ): Promise<AdminVerificationDetail> {
    await this.db.transaction(async (tx) => {
      const [profile] = await tx
        .select()
        .from(driverProfiles)
        .where(eq(driverProfiles.userId, userId))
        .for('update');
      if (!profile) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
      const next = verificationMachine.transition(profile.status, EVENT[req.decision]);

      const docs = await this.drivers.documentsOf(userId, tx);
      const decisions = new Map((req.documents ?? []).map((d) => [d.documentId, d]));
      for (const id of decisions.keys()) {
        if (!docs.some((d) => d.id === id))
          throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND, 'Unknown document');
      }

      if (req.decision === 'APPROVE') {
        if ([...decisions.values()].some((d) => d.status === 'REJECTED')) {
          throw new ApiException(
            'VALIDATION_FAILED',
            HttpStatus.BAD_REQUEST,
            'Cannot approve with rejected documents',
          );
        }
        const missing = missingDocuments(profile.transportType, docs, tunisDate(now));
        if (missing.length > 0) {
          throw new ApiException(
            'VERIFICATION_INCOMPLETE',
            HttpStatus.CONFLICT,
            `Missing: ${missing.join(', ')}`,
          );
        }
      }

      // Approval accepts every pending document of the file; other decisions apply the per-document notes.
      for (const doc of docs) {
        const d = decisions.get(doc.id);
        const status = req.decision === 'APPROVE' && doc.status === 'PENDING' ? 'ACCEPTED' : d?.status;
        if (!status) continue;
        await tx
          .update(driverDocuments)
          .set({ status, reason: status === 'REJECTED' ? (d?.reason ?? null) : null, reviewedAt: now })
          .where(eq(driverDocuments.id, doc.id));
      }

      const updated = await tx
        .update(driverProfiles)
        .set({
          status: next,
          reviewedBy: adminId,
          reviewedAt: now,
          decisionReason: req.decision === 'APPROVE' ? null : (req.reason ?? null),
          updatedAt: now,
        })
        .where(and(eq(driverProfiles.userId, userId), eq(driverProfiles.status, profile.status)))
        .returning({ userId: driverProfiles.userId });
      if (updated.length !== 1)
        throw new ApiException('CONFLICT', HttpStatus.CONFLICT, 'The file changed meanwhile');

      await this.audit.record(
        {
          actorType: 'ADMIN',
          actorUserId: adminId,
          action: 'verification.decide',
          targetType: 'driver',
          targetId: userId,
          metadata: {
            decision: req.decision,
            from: profile.status,
            to: next,
            rejectedDocuments: [...decisions.values()].filter((d) => d.status === 'REJECTED').length,
          },
        },
        tx,
      );
    });

    await this.push.notifyUser(userId, PUSH[req.decision]);
    return this.detail(userId, adminId);
  }
}
