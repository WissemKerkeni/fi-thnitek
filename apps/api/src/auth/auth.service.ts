import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AccountSanction, DeviceInfo, SignInResponse, TokenPair } from '@fi-thnitek/contracts';
import { accountAccess, decideRefresh } from '@fi-thnitek/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ApiException } from '../common/api-exception.js';
import { ENV, type Env } from '../config/env.js';
import type { Database, Tx } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { devices, sessions, users } from '../db/schema/index.js';
import { accountSanction } from '../moderation/account-sanction.js';
import { UsersService } from '../users/users.service.js';
import { GOOGLE_VERIFIER, type GoogleTokenVerifier } from './google-verifier.js';
import { ACCESS_TOKENS, type AccessTokens, hashRefreshToken, newRefreshToken } from './tokens.js';

const DAY_MS = 86_400_000;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(GOOGLE_VERIFIER) private readonly google: GoogleTokenVerifier,
    @Inject(ACCESS_TOKENS) private readonly tokens: AccessTokens,
    private readonly users: UsersService,
  ) {}

  /** POST /v1/auth/google: verify, upsert by google_sub, start a session family. */
  async signInWithGoogle(idToken: string, device?: DeviceInfo): Promise<SignInResponse> {
    const identity = await this.google.verify(idToken);
    const isAdmin = this.env.ADMIN_EMAILS.includes(identity.email);

    const result = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ id: uuidv7(), googleSub: identity.sub, email: identity.email, isAdmin })
        .onConflictDoUpdate({
          target: users.googleSub,
          // Only active accounts are refreshed: a sanctioned, anonymised account must not get its email back.
          set: {
            email: sql`CASE WHEN ${users.status} = 'ACTIVE' THEN excluded.email ELSE ${users.email} END`,
            isAdmin: sql`CASE WHEN ${users.status} = 'ACTIVE' THEN excluded.is_admin ELSE false END`,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!user) throw new Error('user upsert returned nothing');

      const access = accountAccess(user.status);
      if (access !== 'OK') {
        await this.users.revokeAllSessions(user.id, access, tx);
        return { kind: 'denied', access, userId: user.id } as const;
      }

      const deviceId = device ? await this.users.upsertDevice(user.id, device, tx) : null;
      const pair = await this.startFamily(tx, user.id, deviceId);
      return {
        kind: 'ok',
        pair,
        me: this.users.toMe(user, await this.users.driverStateOf(user.id, tx)),
      } as const;
    });

    // Thrown after commit, so the revocation above is kept.
    if (result.kind === 'denied') {
      throw this.accountError(result.access, await accountSanction(this.db, result.userId));
    }
    return { ...result.pair, me: result.me };
  }

  /** POST /v1/auth/refresh: rotate, or revoke the whole family if a rotated token is replayed. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const now = new Date();
    const outcome = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ session: sessions, status: users.status })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.refreshTokenHash, hashRefreshToken(refreshToken)))
        .for('update', { of: sessions });

      // A sanctioned account learns why, whatever the state of this token (R-073).
      if (row && accountAccess(row.status) !== 'OK') {
        const access = accountAccess(row.status) as Exclude<ReturnType<typeof accountAccess>, 'OK'>;
        await this.users.revokeAllSessions(row.session.userId, access, tx);
        return { kind: 'denied', access, userId: row.session.userId } as const;
      }

      const decision = decideRefresh(row?.session, now);
      if (decision === 'REUSED') {
        await tx
          .update(sessions)
          .set({ revokedAt: now, revokeReason: 'REUSE_DETECTED' })
          .where(and(eq(sessions.familyId, row!.session.familyId), isNull(sessions.revokedAt)));
        return { kind: 'error', code: 'REFRESH_TOKEN_REUSED' } as const;
      }
      if (decision !== 'ROTATE' || !row) return { kind: 'error', code: 'REFRESH_TOKEN_INVALID' } as const;

      // Conditional update (CLAUDE.md rule 5): only one concurrent refresh can rotate this token.
      const rotated = await tx
        .update(sessions)
        .set({ rotatedAt: now })
        .where(and(eq(sessions.id, row.session.id), isNull(sessions.rotatedAt), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id });
      if (rotated.length !== 1) return { kind: 'error', code: 'REFRESH_TOKEN_INVALID' } as const;

      return {
        kind: 'ok',
        pair: await this.issue(tx, row.session.userId, row.session.familyId, row.session.deviceId, now),
      } as const;
    });

    if (outcome.kind === 'ok') return outcome.pair;
    if (outcome.kind === 'denied') {
      throw this.accountError(outcome.access, await accountSanction(this.db, outcome.userId));
    }
    throw new ApiException(outcome.code, HttpStatus.UNAUTHORIZED);
  }

  /** POST /v1/auth/logout: end this session family and stop pushes to its device. */
  async logout(userId: string, familyId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const ended = await tx
        .update(sessions)
        .set({ revokedAt: sql`now()`, revokeReason: 'LOGOUT' })
        .where(and(eq(sessions.familyId, familyId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
        .returning({ deviceId: sessions.deviceId });
      const deviceId = ended.find((s) => s.deviceId)?.deviceId;
      if (deviceId) await tx.update(devices).set({ pushToken: null }).where(eq(devices.id, deviceId));
    });
  }

  private startFamily(tx: Tx, userId: string, deviceId: string | null) {
    return this.issue(tx, userId, uuidv7(), deviceId, new Date());
  }

  private async issue(
    tx: Tx,
    userId: string,
    familyId: string,
    deviceId: string | null,
    now: Date,
  ): Promise<TokenPair> {
    const refreshToken = newRefreshToken();
    await tx.insert(sessions).values({
      id: uuidv7(),
      userId,
      deviceId,
      familyId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(now.getTime() + this.env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    });
    return {
      accessToken: await this.tokens.sign({ userId, familyId }, now),
      expiresIn: this.tokens.ttlSeconds,
      refreshToken,
    };
  }

  private accountError(
    access: 'ACCOUNT_SUSPENDED' | 'ACCOUNT_BANNED' | 'ACCOUNT_DELETED',
    sanction?: AccountSanction,
  ): ApiException {
    return access === 'ACCOUNT_DELETED'
      ? new ApiException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED)
      : new ApiException(access, HttpStatus.FORBIDDEN, undefined, undefined, sanction);
  }
}
