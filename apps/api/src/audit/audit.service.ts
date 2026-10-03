import { Inject, Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { DB } from '../db/db.module.js';
import type { Database, Executor } from '../db/client.js';
import { auditLogs } from '../db/schema/index.js';

export interface AuditEntry {
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  actorUserId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  /** IDs and codes only: never PII or coordinates. */
  metadata?: Record<string, unknown>;
}

/** Writes to the insert-only audit.audit_logs (CLAUDE.md rule 5). Pass `tx` to commit with the action. */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(entry: AuditEntry, tx: Executor = this.db): Promise<void> {
    await tx.insert(auditLogs).values({
      id: uuidv7(),
      actorType: entry.actorType,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata ?? {},
    });
  }
}
