import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  DocumentUploadFields,
  DocumentView,
  DriverProfileInput,
  MyVerification,
  VehicleInput,
} from '@fi-thnitek/contracts';
import {
  DEFAULT_REQUIRED_DOCUMENTS,
  EXPIRING_DOCUMENTS,
  type VerificationState,
  canEditVerification,
  displayPlate,
  missingDocuments,
  normalizeCin,
  normalizePlate,
  tunisDate,
  verificationMachine,
} from '@fi-thnitek/domain';
import { and, desc, eq, ne } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/api-exception.js';
import { ENV, type Env } from '../config/env.js';
import type { Database, Executor } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { UNIQUE_VIOLATION, pgError } from '../db/pg-errors.js';
import { driverDocuments, driverProfiles, vehicles } from '../db/schema/index.js';
import { InvalidImageError, sanitizeImage } from '../documents/image-sanitizer.js';
import { STORAGE, type StorageService } from '../storage/storage.service.js';
import { CIN_PROTECTOR, type CinProtector } from './cin-crypto.js';

type Profile = typeof driverProfiles.$inferSelect;
type DocumentRow = typeof driverDocuments.$inferSelect;

export function toDocumentView(d: DocumentRow): DocumentView {
  return {
    id: d.id,
    type: d.type,
    status: d.status,
    expiresOn: d.expiresOn,
    rejectionReason: d.reason,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    uploadedAt: d.createdAt.toISOString(),
  };
}

const locked = () =>
  new ApiException(
    'VERIFICATION_LOCKED',
    HttpStatus.CONFLICT,
    'The file cannot be changed in its current state',
  );

/** The driver's side of verification (D1/D2, R-060, R-061, R-064). Every method acts on the caller only. */
@Injectable()
export class VerificationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(STORAGE) private readonly storage: StorageService,
    @Inject(CIN_PROTECTOR) private readonly cin: CinProtector,
    private readonly audit: AuditService,
  ) {}

  async getMine(userId: string, now = new Date()): Promise<MyVerification> {
    const [profile] = await this.db.select().from(driverProfiles).where(eq(driverProfiles.userId, userId));
    if (!profile) {
      return {
        state: 'DRAFT',
        transportType: null,
        legalFirstName: null,
        legalLastName: null,
        cinLast4: null,
        vehicle: null,
        documents: [],
        requiredDocuments: [],
        missingDocuments: [],
        canEdit: true,
        decisionReason: null,
        submittedAt: null,
        reviewedAt: null,
      };
    }
    const [vehicle] = await this.db.select().from(vehicles).where(eq(vehicles.driverUserId, userId));
    const docs = await this.documentsOf(userId);
    return {
      state: profile.status,
      transportType: profile.transportType,
      legalFirstName: profile.legalFirstName,
      legalLastName: profile.legalLastName,
      cinLast4: profile.cinLast4,
      vehicle: vehicle
        ? {
            plateDisplay: vehicle.plateDisplay,
            model: vehicle.model,
            color: vehicle.color,
            seats: vehicle.seats,
          }
        : null,
      documents: docs.map(toDocumentView),
      requiredDocuments: [...DEFAULT_REQUIRED_DOCUMENTS[profile.transportType]],
      missingDocuments: missingDocuments(profile.transportType, docs, tunisDate(now)),
      canEdit: canEditVerification(profile.status),
      decisionReason: profile.decisionReason,
      submittedAt: profile.submittedAt?.toISOString() ?? null,
      reviewedAt: profile.reviewedAt?.toISOString() ?? null,
    };
  }

  /** Newest first, so the latest upload per type is the one that counts. */
  documentsOf(userId: string, db: Executor = this.db): Promise<DocumentRow[]> {
    return db
      .select()
      .from(driverDocuments)
      .where(eq(driverDocuments.driverUserId, userId))
      .orderBy(desc(driverDocuments.createdAt));
  }

  async saveProfile(userId: string, input: DriverProfileInput): Promise<MyVerification> {
    const cin = normalizeCin(input.cin);
    if (!cin) {
      throw new ApiException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Invalid CIN', [
        { path: 'cin', message: 'a Tunisian CIN has 8 digits' },
      ]);
    }
    await this.assertEditableIfExists(userId);
    const values = {
      legalFirstName: input.legalFirstName,
      legalLastName: input.legalLastName,
      cinHmac: this.cin.hmac(cin),
      cinLast4: cin.slice(-4),
      cinEncrypted: this.cin.encrypt(cin),
      transportType: input.transportType,
      updatedAt: new Date(),
    };
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .insert(driverProfiles)
          .values({ userId, ...values })
          .onConflictDoUpdate({ target: driverProfiles.userId, set: values });
        await tx
          .update(vehicles)
          .set({ transportType: input.transportType })
          .where(eq(vehicles.driverUserId, userId));
      });
    } catch (error) {
      const { code, constraint } = pgError(error);
      if (code === UNIQUE_VIOLATION && constraint?.includes('cin_hmac')) {
        throw new ApiException(
          'CIN_ALREADY_REGISTERED',
          HttpStatus.CONFLICT,
          'This CIN is already registered',
        );
      }
      throw error;
    }
    return this.getMine(userId);
  }

  async saveVehicle(userId: string, input: VehicleInput): Promise<MyVerification> {
    const plate = normalizePlate(input.plate);
    if (!plate) {
      throw new ApiException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Invalid plate', [
        { path: 'plate', message: 'unrecognised plate format' },
      ]);
    }
    const profile = await this.assertEditable(userId);
    const values = {
      transportType: profile.transportType,
      plateNormalized: plate,
      plateDisplay: displayPlate(plate),
      model: input.model,
      color: input.color,
      seats: input.seats,
      updatedAt: new Date(),
    };
    try {
      await this.db
        .insert(vehicles)
        .values({ id: uuidv7(), driverUserId: userId, ...values })
        .onConflictDoUpdate({ target: vehicles.driverUserId, set: values });
    } catch (error) {
      const { code, constraint } = pgError(error);
      if (code === UNIQUE_VIOLATION && constraint?.includes('plate')) {
        throw new ApiException(
          'PLATE_ALREADY_REGISTERED',
          HttpStatus.CONFLICT,
          'This plate is already registered',
        );
      }
      throw error;
    }
    return this.getMine(userId);
  }

  async uploadDocument(
    userId: string,
    fields: DocumentUploadFields,
    file: { buffer: Buffer } | undefined,
    now = new Date(),
  ): Promise<DocumentView> {
    if (!file || file.buffer.length === 0) {
      throw new ApiException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'A file is required', [
        { path: 'file', message: 'required' },
      ]);
    }
    if (file.buffer.length > this.env.MAX_UPLOAD_MB * 1024 * 1024) {
      throw new ApiException(
        'FILE_TOO_LARGE',
        HttpStatus.PAYLOAD_TOO_LARGE,
        `Max ${this.env.MAX_UPLOAD_MB} MB`,
      );
    }
    const profile = await this.assertEditable(userId);
    if (!DEFAULT_REQUIRED_DOCUMENTS[profile.transportType].includes(fields.type)) {
      throw new ApiException(
        'VALIDATION_FAILED',
        HttpStatus.BAD_REQUEST,
        'Not required for this vehicle type',
        [{ path: 'type', message: 'not required for this vehicle type' }],
      );
    }
    if (EXPIRING_DOCUMENTS.has(fields.type) && (!fields.expiresOn || fields.expiresOn <= tunisDate(now))) {
      throw new ApiException(
        'VALIDATION_FAILED',
        HttpStatus.BAD_REQUEST,
        'A future expiry date is required',
        [{ path: 'expiresOn', message: 'required and must be in the future' }],
      );
    }

    let image;
    try {
      image = sanitizeImage(file.buffer);
    } catch (error) {
      if (error instanceof InvalidImageError) {
        throw new ApiException(
          'UNSUPPORTED_MEDIA_TYPE',
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
          'Only JPEG or PNG photos',
        );
      }
      throw error;
    }

    const id = uuidv7();
    const storageKey = `documents/${userId}/${id}`;
    await this.storage.put(storageKey, image.bytes, image.contentType);

    // Replace earlier, not-yet-accepted uploads of the same type (the newest counts).
    const replaced = await this.db.transaction(async (tx) => {
      const old = await tx
        .delete(driverDocuments)
        .where(
          and(
            eq(driverDocuments.driverUserId, userId),
            eq(driverDocuments.type, fields.type),
            ne(driverDocuments.status, 'ACCEPTED'),
          ),
        )
        .returning({ storageKey: driverDocuments.storageKey });
      await tx.insert(driverDocuments).values({
        id,
        driverUserId: userId,
        type: fields.type,
        storageKey,
        sha256: createHash('sha256').update(image.bytes).digest('hex'),
        contentType: image.contentType,
        sizeBytes: image.bytes.length,
        expiresOn: EXPIRING_DOCUMENTS.has(fields.type) ? (fields.expiresOn ?? null) : null,
      });
      return old;
    });
    await Promise.allSettled(replaced.map((r) => this.storage.delete(r.storageKey)));

    const [row] = await this.db.select().from(driverDocuments).where(eq(driverDocuments.id, id));
    return toDocumentView(row!);
  }

  async deleteDocument(userId: string, documentId: string): Promise<void> {
    await this.assertEditable(userId);
    const [deleted] = await this.db
      .delete(driverDocuments)
      .where(
        and(
          eq(driverDocuments.id, documentId),
          eq(driverDocuments.driverUserId, userId),
          ne(driverDocuments.status, 'ACCEPTED'),
        ),
      )
      .returning({ storageKey: driverDocuments.storageKey });
    if (!deleted) throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND);
    await this.storage.delete(deleted.storageKey).catch(() => undefined);
  }

  /** R-061: DRAFT / CHANGES_REQUESTED / EXPIRED → UNDER_REVIEW once nothing is missing. */
  async submit(userId: string, now = new Date()): Promise<MyVerification> {
    await this.db.transaction(async (tx) => {
      const [profile] = await tx
        .select()
        .from(driverProfiles)
        .where(eq(driverProfiles.userId, userId))
        .for('update');
      if (!profile) throw new ApiException('VERIFICATION_INCOMPLETE', HttpStatus.CONFLICT, 'Profile missing');
      const next = verificationMachine.transition(profile.status, 'SUBMIT');

      const [vehicle] = await tx
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(eq(vehicles.driverUserId, userId));
      const missing = missingDocuments(
        profile.transportType,
        await this.documentsOf(userId, tx),
        tunisDate(now),
      );
      if (!vehicle || missing.length > 0) {
        throw new ApiException('VERIFICATION_INCOMPLETE', HttpStatus.CONFLICT, 'The file is incomplete', [
          ...(vehicle ? [] : [{ path: 'vehicle', message: 'required' }]),
          ...missing.map((t) => ({ path: `documents.${t}`, message: 'missing' })),
        ]);
      }
      // Conditional update (CLAUDE.md rule 5): only from the state we read.
      const updated = await tx
        .update(driverProfiles)
        .set({ status: next, submittedAt: now, decisionReason: null, updatedAt: now })
        .where(and(eq(driverProfiles.userId, userId), eq(driverProfiles.status, profile.status)))
        .returning({ userId: driverProfiles.userId });
      if (updated.length !== 1) throw locked();
      await this.audit.record(
        {
          actorType: 'USER',
          actorUserId: userId,
          action: 'verification.submit',
          targetType: 'driver',
          targetId: userId,
        },
        tx,
      );
    });
    return this.getMine(userId, now);
  }

  /** The current state, or null if the user never started (for Me and the driver-only rule). */
  async stateOf(userId: string): Promise<VerificationState | null> {
    const [row] = await this.db
      .select({ status: driverProfiles.status })
      .from(driverProfiles)
      .where(eq(driverProfiles.userId, userId));
    return row?.status ?? null;
  }

  /** The caller's profile, which must exist and be editable. */
  private async assertEditable(userId: string): Promise<Profile> {
    const profile = await this.assertEditableIfExists(userId);
    if (!profile)
      throw new ApiException('VERIFICATION_INCOMPLETE', HttpStatus.CONFLICT, 'Fill in your details first');
    return profile;
  }

  /** Like assertEditable, but a missing profile is fine (first save). */
  private async assertEditableIfExists(userId: string): Promise<Profile | undefined> {
    const [profile] = await this.db.select().from(driverProfiles).where(eq(driverProfiles.userId, userId));
    if (profile && !canEditVerification(profile.status)) throw locked();
    return profile;
  }
}
