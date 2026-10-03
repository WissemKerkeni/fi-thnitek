import {
  AdminVerificationDetail,
  DocumentView,
  Me,
  MyVerification,
  ProblemDetails,
  SignInResponse,
  VerificationQueueItem,
} from '@fi-thnitek/contracts';
import { DEFAULT_REQUIRED_DOCUMENTS, EXPIRING_DOCUMENTS, type DocumentType } from '@fi-thnitek/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DocumentExpiryJob } from '../src/verification/document-expiry.job.js';
import { SECRET_EXIF, jpegWithExif } from './images.js';
import { TEST_ADMIN_EMAIL, TEST_TERMS_VERSION, type TestApp, startTestApp } from './test-app.js';

let t: TestApp;
let admin: SignInResponse;

beforeAll(async () => {
  t = await startTestApp();
  admin = await signIn('admin-1', TEST_ADMIN_EMAIL);
});

afterAll(async () => {
  await t?.close();
});

const bearer = (s: SignInResponse) => ({ Authorization: `Bearer ${s.accessToken}` });
const problem = (body: unknown) => ProblemDetails.parse(body);
const FUTURE = '2030-06-30';
let n = 0;

async function signIn(sub = `driver-${++n}`, email = `${sub}@example.tn`): Promise<SignInResponse> {
  const idToken = await t.googleToken({ sub, email });
  const res = await request(t.server()).post('/v1/auth/google').send({ idToken }).expect(200);
  const s = SignInResponse.parse(res.body);
  await request(t.server())
    .patch('/v1/me')
    .set(bearer(s))
    .send({ displayName: 'Sami', acceptTermsVersion: TEST_TERMS_VERSION })
    .expect(200);
  return s;
}

function upload(s: SignInResponse, type: DocumentType, file: Buffer, expiresOn?: string) {
  const req = request(t.server())
    .post('/v1/driver/documents')
    .set(bearer(s))
    .field('type', type)
    .attach('file', file, { filename: 'photo.jpg', contentType: 'image/jpeg' });
  return expiresOn ? req.field('expiresOn', expiresOn) : req;
}

/** A driver with a complete taxi file, ready to submit. Returns the uploaded document views. */
async function completeFile(s: SignInResponse, cin: string, plate: string): Promise<DocumentView[]> {
  await request(t.server())
    .put('/v1/driver/profile')
    .set(bearer(s))
    .send({ legalFirstName: 'Hédi', legalLastName: 'Ben Salah', cin, transportType: 'TAXI' })
    .expect(200);
  await request(t.server()).put('/v1/driver/vehicle').set(bearer(s)).send({ plate }).expect(200);
  const docs: DocumentView[] = [];
  for (const type of DEFAULT_REQUIRED_DOCUMENTS.TAXI) {
    const res = await upload(
      s,
      type,
      jpegWithExif(`${cin}-${type}`),
      EXPIRING_DOCUMENTS.has(type) ? FUTURE : undefined,
    ).expect(201);
    docs.push(DocumentView.parse(res.body));
  }
  return docs;
}

describe('driver file (R-060, R-064)', () => {
  it('starts empty and reports what is missing', async () => {
    const s = await signIn();
    const res = await request(t.server()).get('/v1/driver/verification').set(bearer(s)).expect(200);
    expect(MyVerification.parse(res.body)).toMatchObject({ state: 'DRAFT', canEdit: true, documents: [] });
  });

  it('stores the CIN only encrypted and hashed, and echoes back the last 4 digits', async () => {
    const s = await signIn();
    const res = await request(t.server())
      .put('/v1/driver/profile')
      .set(bearer(s))
      .send({ legalFirstName: 'Hédi', legalLastName: 'Ben Salah', cin: '0911 2233', transportType: 'LOUAGE' })
      .expect(200);
    expect(MyVerification.parse(res.body).cinLast4).toBe('2233');
    const { rows } = await t.pool.query<{ row: string }>(
      'SELECT row_to_json(p)::text AS row FROM driver_profiles p WHERE user_id = $1',
      [s.me.id],
    );
    expect(rows[0]?.row).not.toContain('09112233');
  });

  it('rejects a CIN or plate already used by another driver, whatever the spelling', async () => {
    const a = await signIn();
    await request(t.server())
      .put('/v1/driver/profile')
      .set(bearer(a))
      .send({ legalFirstName: 'Ali', legalLastName: 'Trabelsi', cin: '07778899', transportType: 'TAXI' })
      .expect(200);
    await request(t.server())
      .put('/v1/driver/vehicle')
      .set(bearer(a))
      .send({ plate: '200 تونس 1234' })
      .expect(200);

    const b = await signIn();
    let res = await request(t.server())
      .put('/v1/driver/profile')
      .set(bearer(b))
      .send({ legalFirstName: 'Ali', legalLastName: 'Trabelsi', cin: '0777 8899', transportType: 'TAXI' })
      .expect(409);
    expect(problem(res.body).code).toBe('CIN_ALREADY_REGISTERED');

    await request(t.server())
      .put('/v1/driver/profile')
      .set(bearer(b))
      .send({ legalFirstName: 'Ali', legalLastName: 'Trabelsi', cin: '07778800', transportType: 'TAXI' })
      .expect(200);
    res = await request(t.server())
      .put('/v1/driver/vehicle')
      .set(bearer(b))
      .send({ plate: '200 TU 1234' })
      .expect(409);
    expect(problem(res.body).code).toBe('PLATE_ALREADY_REGISTERED');
  });

  it('accepts only JPEG/PNG, requires future expiry dates, and caps document types per vehicle type', async () => {
    const s = await signIn();
    await request(t.server())
      .put('/v1/driver/profile')
      .set(bearer(s))
      .send({ legalFirstName: 'Mehdi', legalLastName: 'Jaziri', cin: '05554433', transportType: 'BUS' })
      .expect(200);

    let res = await upload(s, 'CIN_FRONT', Buffer.from('%PDF-1.7 fake')).expect(415);
    expect(problem(res.body).code).toBe('UNSUPPORTED_MEDIA_TYPE');
    res = await upload(s, 'DRIVING_LICENCE', jpegWithExif('x')).expect(400);
    expect(problem(res.body).errors?.[0]?.path).toBe('expiresOn');
    await upload(s, 'DRIVING_LICENCE', jpegWithExif('x'), '2020-01-01').expect(400);
    res = await upload(s, 'PROFESSIONAL_CARD', jpegWithExif('x'), FUTURE).expect(400); // not for buses
    expect(problem(res.body).errors?.[0]?.path).toBe('type');
  });

  it('asks only for the plate and sets seats from the vehicle type (ADR-216)', async () => {
    const s = await signIn();
    await request(t.server())
      .put('/v1/driver/profile')
      .set(bearer(s))
      .send({ legalFirstName: 'Karim', legalLastName: 'Dridi', cin: '06665544', transportType: 'LOUAGE' })
      .expect(200);
    let res = await request(t.server())
      .put('/v1/driver/vehicle')
      .set(bearer(s))
      .send({ plate: '210 تونس 777' })
      .expect(200);
    expect(MyVerification.parse(res.body).vehicle).toEqual({ plateDisplay: '210 تونس 777', seats: 8 });

    res = await request(t.server())
      .put('/v1/driver/profile')
      .set(bearer(s))
      .send({ legalFirstName: 'Karim', legalLastName: 'Dridi', cin: '06665544', transportType: 'TAXI' })
      .expect(200);
    expect(MyVerification.parse(res.body).vehicle?.seats).toBe(4);
  });

  it('refuses to submit an incomplete file', async () => {
    const s = await signIn();
    await request(t.server())
      .put('/v1/driver/profile')
      .set(bearer(s))
      .send({ legalFirstName: 'Nour', legalLastName: 'Gharbi', cin: '04443322', transportType: 'TAXI' })
      .expect(200);
    const res = await request(t.server()).post('/v1/driver/verification/submit').set(bearer(s)).expect(409);
    expect(problem(res.body).code).toBe('VERIFICATION_INCOMPLETE');
    expect(problem(res.body).errors?.map((e) => e.path)).toContain('vehicle');
  });
});

describe('review flow (R-061…R-063)', () => {
  let driver: SignInResponse;
  let docs: DocumentView[];

  beforeAll(async () => {
    driver = await signIn();
    await request(t.server())
      .put('/v1/me/device')
      .set(bearer(driver))
      .send({
        installId: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a99',
        platform: 'android',
        appVersion: '0.3.0',
        pushToken: 'fcm-1',
      })
      .expect(204);
    docs = await completeFile(driver, '01020304', '150 تونس 9876');
  });

  it('submits to UNDER_REVIEW and locks the file', async () => {
    const res = await request(t.server())
      .post('/v1/driver/verification/submit')
      .set(bearer(driver))
      .expect(200);
    expect(MyVerification.parse(res.body)).toMatchObject({
      state: 'UNDER_REVIEW',
      canEdit: false,
      missingDocuments: [],
    });
    const locked = await upload(driver, 'CIN_BACK', jpegWithExif('again')).expect(409);
    expect(problem(locked.body).code).toBe('VERIFICATION_LOCKED');
    const me = await request(t.server()).get('/v1/me').set(bearer(driver)).expect(200);
    expect(Me.parse(me.body).driverVerification).toBe('UNDER_REVIEW');
  });

  it('keeps the admin endpoints admin-only', async () => {
    const res = await request(t.server()).get('/v1/admin/verifications').set(bearer(driver)).expect(403);
    expect(problem(res.body).code).toBe('ADMIN_REQUIRED');
    await request(t.server()).get(`/v1/admin/documents/${docs[0]!.id}/url`).set(bearer(driver)).expect(403);
  });

  it('lists the file in the admin queue and reveals the CIN in the audited detail', async () => {
    const queue = await request(t.server()).get('/v1/admin/verifications').set(bearer(admin)).expect(200);
    const items = VerificationQueueItem.array().parse(queue.body);
    expect(items.map((i) => i.userId)).toContain(driver.me.id);

    const res = await request(t.server())
      .get(`/v1/admin/verifications/${driver.me.id}`)
      .set(bearer(admin))
      .expect(200);
    expect(AdminVerificationDetail.parse(res.body).cin).toBe('01020304');
    const audit = await t.pool.query(
      `SELECT action FROM audit.audit_logs WHERE target_id = $1 AND action = 'verification.view'`,
      [driver.me.id],
    );
    expect(audit.rowCount).toBeGreaterThan(0);
  });

  it('serves documents through audited 60-second links, with the EXIF removed', async () => {
    const res = await request(t.server())
      .get(`/v1/admin/documents/${docs[0]!.id}/url`)
      .set(bearer(admin))
      .expect(200);
    const { url } = res.body as { url: string };
    expect(url).toMatch(/X-Amz-Expires=60/);
    const stored = Buffer.from(await (await fetch(url)).arrayBuffer());
    expect(stored.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(stored.toString('latin1')).not.toContain(SECRET_EXIF);
    const audit = await t.pool.query(
      `SELECT 1 FROM audit.audit_logs WHERE action = 'document.view' AND target_id = $1`,
      [docs[0]!.id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('needs a reason to request changes, then records per-document rejections', async () => {
    let res = await request(t.server())
      .post(`/v1/admin/verifications/${driver.me.id}/decision`)
      .set(bearer(admin))
      .send({ decision: 'REQUEST_CHANGES' })
      .expect(400);
    expect(problem(res.body).code).toBe('VALIDATION_FAILED');

    const selfie = docs.find((d) => d.type === 'CIN_BACK')!;
    res = await request(t.server())
      .post(`/v1/admin/verifications/${driver.me.id}/decision`)
      .set(bearer(admin))
      .send({
        decision: 'REQUEST_CHANGES',
        reason: 'CIN verso floue',
        documents: [{ documentId: selfie.id, status: 'REJECTED', reason: 'Photo illisible' }],
      })
      .expect(200);
    expect(AdminVerificationDetail.parse(res.body).state).toBe('CHANGES_REQUESTED');

    const mine = MyVerification.parse(
      (await request(t.server()).get('/v1/driver/verification').set(bearer(driver)).expect(200)).body,
    );
    expect(mine).toMatchObject({
      state: 'CHANGES_REQUESTED',
      canEdit: true,
      decisionReason: 'CIN verso floue',
      missingDocuments: ['CIN_BACK'],
    });
    expect(mine.documents.find((d) => d.id === selfie.id)?.rejectionReason).toBe('Photo illisible');
    expect(t.push.sent.at(-1)?.data.event).toBe('VERIFICATION_CHANGES_REQUESTED');
  });

  it('accepts a corrected file and approves it: VERIFIED, all documents accepted, push sent', async () => {
    await upload(driver, 'CIN_BACK', jpegWithExif('new cin back')).expect(201);
    await request(t.server()).post('/v1/driver/verification/submit').set(bearer(driver)).expect(200);

    const res = await request(t.server())
      .post(`/v1/admin/verifications/${driver.me.id}/decision`)
      .set(bearer(admin))
      .send({ decision: 'APPROVE' })
      .expect(200);
    const detail = AdminVerificationDetail.parse(res.body);
    expect(detail.state).toBe('VERIFIED');
    expect(detail.documents.every((d) => d.status === 'ACCEPTED')).toBe(true);

    const me = Me.parse((await request(t.server()).get('/v1/me').set(bearer(driver)).expect(200)).body);
    expect(me.driverVerification).toBe('VERIFIED');

    const push = t.push.sent.at(-1)!;
    expect(push.data.event).toBe('VERIFICATION_APPROVED');
    expect(push.tokens).toEqual(['fcm-1']);
    // Rule 8: no names, CIN or plate in push payloads.
    const payload = JSON.stringify(push);
    for (const pii of ['Hédi', 'Ben Salah', '01020304', '9876', 'Sami']) expect(payload).not.toContain(pii);

    const audit = await t.pool.query(
      `SELECT metadata->>'decision' AS decision FROM audit.audit_logs WHERE action = 'verification.decide' AND target_id = $1 ORDER BY created_at`,
      [driver.me.id],
    );
    expect(audit.rows.map((r: { decision: string }) => r.decision)).toEqual(['REQUEST_CHANGES', 'APPROVE']);
  });

  it('refuses decisions that skip the state machine', async () => {
    const res = await request(t.server())
      .post(`/v1/admin/verifications/${driver.me.id}/decision`)
      .set(bearer(admin))
      .send({ decision: 'APPROVE' })
      .expect(409);
    expect(problem(res.body).code).toBe('INVALID_STATE_TRANSITION');
  });

  it('flags the same document photo used by another account', async () => {
    const other = await signIn();
    await request(t.server())
      .put('/v1/driver/profile')
      .set(bearer(other))
      .send({ legalFirstName: 'Copy', legalLastName: 'Cat', cin: '09998877', transportType: 'TAXI' })
      .expect(200);
    await upload(other, 'CIN_FRONT', jpegWithExif('01020304-CIN_FRONT')).expect(201); // same bytes as the driver's
    const res = await request(t.server())
      .get(`/v1/admin/verifications/${other.me.id}`)
      .set(bearer(admin))
      .expect(200);
    expect(AdminVerificationDetail.parse(res.body).warnings).toEqual([
      { kind: 'DOCUMENT', otherUserId: driver.me.id, documentType: 'CIN_FRONT' },
    ]);
  });

  it('expires the driver when an accepted document expires, reminding once beforehand (job)', async () => {
    const job = t.app.get(DocumentExpiryJob);
    // The operating card expires on 2031-01-20; the other dated documents much later.
    await t.pool.query(
      `UPDATE driver_documents
       SET expires_on = CASE WHEN type = 'OPERATING_CARD' THEN DATE '2031-01-20' ELSE DATE '2033-06-30' END, reminded_at = NULL
       WHERE driver_user_id = $1 AND expires_on IS NOT NULL`,
      [driver.me.id],
    );
    expect(await job.run(new Date('2031-01-01T08:00:00Z'))).toEqual({ expired: 0, reminded: 1 });
    expect(await job.run(new Date('2031-01-02T08:00:00Z'))).toEqual({ expired: 0, reminded: 0 });
    expect(t.push.sent.at(-1)?.data.event).toBe('DOCUMENT_EXPIRING');

    expect(await job.run(new Date('2031-01-20T08:00:00Z'))).toEqual({ expired: 1, reminded: 0 });
    const mine = MyVerification.parse(
      (await request(t.server()).get('/v1/driver/verification').set(bearer(driver)).expect(200)).body,
    );
    // The job ran at a simulated date; the file is now EXPIRED and editable for renewal.
    expect(mine).toMatchObject({ state: 'EXPIRED', canEdit: true });
    expect(t.push.sent.at(-1)?.data.event).toBe('DOCUMENT_EXPIRED');
    expect(await job.run(new Date('2031-01-21T08:00:00Z'))).toEqual({ expired: 0, reminded: 0 });
  });
});
