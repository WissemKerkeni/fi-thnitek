/**
 * DEV ONLY: fills Teboulba with fake drivers moving along its real main roads, fake waiting passengers
 * and regular trips, and keeps them alive while it runs (every 5 s), so the app can be looked at with
 * real data.
 *
 *   pnpm --filter @fi-thnitek/api sim:demo                      start (Ctrl+C stops)
 *   pnpm --filter @fi-thnitek/api sim:demo -- --around 36.80,10.18   the same scene elsewhere
 *   pnpm --filter @fi-thnitek/api sim:demo -- --clean           delete every fake account
 *
 * Writes straight to the local database (no API, no push). Refuses anything but a local database.
 * Fake accounts use e-mails @sim.fi-thnitek.test, never sign in, and are removed by --clean. Each start
 * first ends the previous fake sessions and requests, so nothing stays behind from an older scene.
 * Routes: OpenStreetMap roads (ODbL, © OpenStreetMap contributors) in sim-teboulba-routes.json.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { v7 as uuidv7 } from 'uuid';

const url = process.env.DATABASE_URL ?? '';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  process.stderr.write('Refusing: the simulator only runs against a local development database.\n');
  process.exit(1);
}
const pool = new Pool({ connectionString: url });
// A dropped idle connection (database restart) must not end the simulation.
pool.on('error', (error) => process.stderr.write(`db pool: ${error.message}\n`));
const DOMAIN = 'sim.fi-thnitek.test';
const TICK_MS = 5_000;

type LatLng = [number, number];
/** Teboulba centre (the taxi, louage and bus stations are within 500 m). */
const CENTRE: LatLng = [35.6418, 10.9658];

// --around lat,lng moves the whole scene (handy to see it next to you).
const aroundArg = process.argv[process.argv.indexOf('--around') + 1];
const around: LatLng | null =
  process.argv.includes('--around') && aroundArg ? (aroundArg.split(',').map(Number) as LatLng) : null;
const shift = (p: LatLng): LatLng =>
  around ? [p[0] - CENTRE[0] + around[0], p[1] - CENTRE[1] + around[1]] : p;

/** Teboulba's main roads (OSM geometry); drivers go back and forth along them. */
const ROAD_FILE = path.resolve(__dirname, 'sim-teboulba-routes.json');
const ROUTES: Record<string, LatLng[]> = {
  ...(JSON.parse(readFileSync(ROAD_FILE, 'utf8')) as { routes: Record<string, LatLng[]> }).routes,
  // Parked at the louage station, nudging forward as the queue moves.
  station: [
    [35.6424, 10.9665],
    [35.64255, 10.96672],
  ],
};

interface DriverSpec {
  key: string;
  name: string;
  type: 'TAXI' | 'LOUAGE' | 'BUS';
  route: string;
  speedMps: number;
  /** Start somewhere along the route (0–1). */
  offset: number;
  full?: boolean;
  onBreak?: boolean;
  heading?: string;
  line?: string;
  routine?: { to: string; time: string };
}

const DRIVERS: DriverSpec[] = [
  { key: 'karim', name: 'Karim', type: 'TAXI', route: 'centre', speedMps: 8, offset: 0 },
  { key: 'hedi', name: 'Hedi', type: 'TAXI', route: 'coast', speedMps: 10, offset: 0.3, heading: 'airport' },
  { key: 'sonia', name: 'Sonia', type: 'TAXI', route: 'south', speedMps: 9, offset: 0.5, full: true },
  { key: 'anis', name: 'Anis', type: 'TAXI', route: 'east', speedMps: 7, offset: 0.55 },
  {
    key: 'mourad',
    name: 'Mourad',
    type: 'TAXI',
    route: 'moknine',
    speedMps: 12,
    offset: 0.2,
    heading: 'Moknine',
  },
  {
    key: 'ridha',
    name: 'Ridha',
    type: 'LOUAGE',
    route: 'moknine',
    speedMps: 14,
    offset: 0.6,
    heading: 'Sousse',
    routine: { to: 'Tunis', time: '07:30' },
  },
  {
    key: 'fathi',
    name: 'Fathi',
    type: 'LOUAGE',
    route: 'station',
    speedMps: 0.2,
    offset: 0,
    heading: 'Tunis',
    routine: { to: 'Sousse', time: '17:00' },
  },
  {
    key: 'nabil',
    name: 'Nabil',
    type: 'LOUAGE',
    route: 'south',
    speedMps: 12,
    offset: 0.1,
    heading: 'Mahdia',
  },
  { key: 'lotfi', name: 'Lotfi', type: 'BUS', route: 'west', speedMps: 7, offset: 0.7, line: 'L23' },
  { key: 'walid', name: 'Walid', type: 'TAXI', route: 'centre', speedMps: 8, offset: 0.2, onBreak: true },
];

interface PassengerSpec {
  key: string;
  name: string;
  at: LatLng;
  types: ('TAXI' | 'LOUAGE')[];
  seats: number;
  to: string;
  showIdentity: boolean;
  note?: string;
}

const PASSENGERS: PassengerSpec[] = [
  {
    key: 'amel',
    name: 'Amel',
    at: [35.6421, 10.9662],
    types: ['TAXI'],
    seats: 1,
    to: 'airport',
    showIdentity: true,
    note: 'Avec une valise',
  },
  {
    key: 'p2',
    name: 'Sami',
    at: [35.6401, 10.9686],
    types: ['TAXI'],
    seats: 2,
    to: 'Sousse',
    showIdentity: false,
  },
  {
    key: 'youssef',
    name: 'Youssef',
    at: [35.64265, 10.96675],
    types: ['LOUAGE'],
    seats: 3,
    to: 'Tunis',
    showIdentity: true,
    note: 'On est trois',
  },
  {
    key: 'p4',
    name: 'Hela',
    at: [35.6445, 10.9632],
    types: ['TAXI'],
    seats: 1,
    to: 'Moknine',
    showIdentity: false,
  },
  {
    key: 'ines',
    name: 'Ines',
    at: [35.6382, 10.9614],
    types: ['TAXI'],
    seats: 2,
    to: 'Mahdia',
    showIdentity: true,
  },
  {
    key: 'p6',
    name: 'Omar',
    at: [35.6429, 10.9673],
    types: ['LOUAGE'],
    seats: 1,
    to: 'Mahdia',
    showIdentity: false,
  },
];

const q = async <T extends object = Record<string, unknown>>(text: string, values: unknown[] = []) =>
  (await pool.query<T>(text, values)).rows;
const geo = (p: LatLng) => `SRID=4326;POINT(${p[1]} ${p[0]})`;
const emailOf = (key: string) => `sim-${key}@${DOMAIN}`;

/** A destination by name: 'airport' (Monastir's), 'station' (the louage station nearest the scene) or a town. */
async function placeId(name: string): Promise<{ id: string; at: LatLng } | null> {
  const centre = geo(shift(CENTRE));
  const [row] = await q<{ id: string; lat: number; lng: number }>(
    name === 'airport'
      ? `SELECT id, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM places
         WHERE kind = 'AIRPORT' AND name_fr ILIKE '%Monastir%' LIMIT 1`
      : name === 'station'
        ? `SELECT id, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM places
           WHERE kind = 'LOUAGE_STATION' ORDER BY location <-> $1::geography LIMIT 1`
        : `SELECT id, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM places
           WHERE kind = 'CITY' AND name_fr = $1 LIMIT 1`,
    name === 'airport' ? [] : name === 'station' ? [centre] : [name],
  );
  return row ? { id: row.id, at: [row.lat, row.lng] } : null;
}

async function userFor(key: string, name: string): Promise<string> {
  const [existing] = await q<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [emailOf(key)]);
  if (existing) {
    await q(`UPDATE users SET status = 'ACTIVE', display_name = $2 WHERE id = $1`, [existing.id, name]);
    return existing.id;
  }
  const id = uuidv7();
  await q(
    `INSERT INTO users (id, email, display_name, status, created_at) VALUES ($1, $2, $3, 'ACTIVE', now() - interval '30 days')`,
    [id, emailOf(key), name],
  );
  return id;
}

interface LiveDriver {
  spec: DriverSpec;
  userId: string;
  sessionId: string;
  path: LatLng[];
  /** Metres travelled along the back-and-forth path. */
  travelled: number;
  length: number;
}

const toRad = (d: number) => (d * Math.PI) / 180;
function metres(a: LatLng, b: LatLng): number {
  const x = toRad(b[1] - a[1]) * Math.cos(toRad((a[0] + b[0]) / 2));
  const y = toRad(b[0] - a[0]);
  return Math.sqrt(x * x + y * y) * 6_371_000;
}
function pathLength(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += metres(path[i - 1]!, path[i]!);
  return total;
}
/** Position and heading after `d` metres on the path, going back once the end is reached. */
function along(path: LatLng[], length: number, d: number): { at: LatLng; heading: number } {
  const lap = d % (2 * length);
  const forward = lap <= length;
  let rest = forward ? lap : 2 * length - lap;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const seg = metres(a, b);
    if (rest <= seg || i === path.length - 1) {
      const f = seg === 0 ? 0 : Math.min(1, rest / seg);
      const at: LatLng = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      const [from, to] = forward ? [a, b] : [b, a];
      const heading =
        (Math.atan2(toRad(to[1] - from[1]) * Math.cos(toRad(from[0])), toRad(to[0] - from[0])) * 180) /
        Math.PI;
      return { at, heading: (heading + 360) % 360 };
    }
    rest -= seg;
  }
  return { at: path[0]!, heading: 0 };
}

async function setUpDriver(spec: DriverSpec): Promise<LiveDriver> {
  const userId = await userFor(spec.key, spec.name);
  await q(
    `INSERT INTO driver_profiles (user_id, legal_first_name, legal_last_name, cin_hmac, cin_last4, cin_encrypted, transport_type, status)
     VALUES ($1, $2, 'Sim', $3, '0000', 'sim', $4, 'VERIFIED')
     ON CONFLICT (user_id) DO UPDATE SET status = 'VERIFIED', transport_type = EXCLUDED.transport_type, cooldown_until = NULL`,
    [userId, spec.name, `sim-${userId}`, spec.type],
  );
  let [vehicle] = await q<{ id: string }>(`SELECT id FROM vehicles WHERE driver_user_id = $1`, [userId]);
  if (!vehicle) {
    vehicle = { id: uuidv7() };
    const plate = `${100 + DRIVERS.indexOf(spec)} تونس ${4000 + DRIVERS.indexOf(spec)}`;
    await q(
      `INSERT INTO vehicles (id, driver_user_id, transport_type, plate_normalized, plate_display, seats) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        vehicle.id,
        userId,
        spec.type,
        `sim-${userId}`,
        plate,
        spec.type === 'TAXI' ? 4 : spec.type === 'LOUAGE' ? 8 : null,
      ],
    );
  }

  const heading = spec.heading ? await placeId(spec.heading) : null;
  let [session] = await q<{ id: string }>(
    `SELECT id FROM sharing_sessions WHERE driver_user_id = $1 AND ended_at IS NULL`,
    [userId],
  );
  if (!session) {
    session = { id: uuidv7() };
    await q(
      `INSERT INTO sharing_sessions (id, driver_user_id, vehicle_id, transport_type, heading_to_place_id, line_label, state, is_full,
         break_started_at, break_until, breaks_count, started_at, last_fix_at, still_working_confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now(), now())`,
      [
        session.id,
        userId,
        vehicle.id,
        spec.type,
        heading?.id ?? null,
        spec.line ?? null,
        spec.onBreak ? 'ON_BREAK' : 'SHARING',
        spec.full ?? false,
        spec.onBreak ? new Date() : null,
        spec.onBreak ? new Date(Date.now() + 2 * 3_600_000) : null,
        spec.onBreak ? 1 : 0,
      ],
    );
  }

  if (spec.routine) {
    const from = await placeId('station');
    const to = await placeId(spec.routine.to);
    const [has] = await q(`SELECT 1 FROM driver_routines WHERE driver_user_id = $1`, [userId]);
    if (!has && from && to) {
      await q(
        `INSERT INTO driver_routines (id, driver_user_id, transport_type, from_place_id, to_place_id, schedule_kind, days_mask, local_time, seats, note, last_used_at)
         VALUES ($1, $2, $3, $4, $5, 'WEEKLY', 127, $6, 8, 'Départ dès que complet', now())`,
        [uuidv7(), userId, spec.type, from.id, to.id, spec.routine.time],
      );
    }
  }

  const points = ROUTES[spec.route]!.map(shift);
  const length = Math.max(1, pathLength(points));
  return { spec, userId, sessionId: session.id, path: points, length, travelled: spec.offset * length };
}

async function setUpPassenger(spec: PassengerSpec): Promise<string> {
  const userId = await userFor(spec.key, spec.name);
  const [open] = await q<{ id: string }>(
    `SELECT id FROM passenger_requests WHERE passenger_user_id = $1 AND status = 'OPEN'`,
    [userId],
  );
  if (open) return open.id;
  const to = await placeId(spec.to);
  const anchor = shift(spec.at);
  const dest: LatLng = to?.at ?? anchor;
  const id = uuidv7();
  await q(
    `INSERT INTO passenger_requests (id, passenger_user_id, transport_types, destination_point, destination_lat, destination_lng,
       destination_place_id, seats, note, show_identity, status, anchor_point, anchor_lat, anchor_lng, anchor_accuracy_m,
       visible_at, last_point, last_lat, last_lng, last_accuracy_m, last_fix_at, last_ping_at, created_at, expires_at)
     VALUES ($1, $2, $3::transport_type[], $4, $5, $6, $7, $8, $9, $10, 'OPEN', $11, $12, $13, 8,
       now() - make_interval(mins => $14), $11, $12, $13, 8, now(), now(), now() - make_interval(mins => $14), now() + interval '60 minutes')`,
    [
      id,
      userId,
      `{${spec.types.join(',')}}`,
      geo(dest),
      dest[0],
      dest[1],
      to?.id ?? null,
      spec.seats,
      spec.note ?? null,
      spec.showIdentity,
      geo(anchor),
      anchor[0],
      anchor[1],
      2 + PASSENGERS.indexOf(spec) * 3,
    ],
  );
  return id;
}

async function tick(drivers: LiveDriver[], requestIds: string[]): Promise<void> {
  const now = Date.now();
  for (const d of drivers) {
    if (d.spec.onBreak) {
      await q(
        `UPDATE sharing_sessions SET break_until = GREATEST(break_until, now() + interval '30 minutes') WHERE id = $1 AND ended_at IS NULL`,
        [d.sessionId],
      );
      // ADR-227: on the map, frozen where the break began (written once, never moved).
      const { at } = along(d.path, d.length, d.travelled);
      await q(
        `INSERT INTO driver_live_locations (driver_user_id, session_id, transport_type, point, lat, lng, accuracy_m, fix_ts, recent_fixes, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 6, now() - interval '5 minutes', '[]', now())
         ON CONFLICT (driver_user_id) DO NOTHING`,
        [d.userId, d.sessionId, d.spec.type, geo(at), at[0], at[1]],
      );
      continue;
    }
    d.travelled += (d.spec.speedMps * TICK_MS) / 1000;
    const { at, heading } = along(d.path, d.length, d.travelled);
    const fix = {
      ts: now,
      lat: at[0],
      lng: at[1],
      accuracyM: 6,
      speedMps: d.spec.speedMps,
      headingDeg: Math.round(heading),
      isMock: false,
    };
    await q(
      `INSERT INTO driver_live_locations (driver_user_id, session_id, transport_type, point, lat, lng, accuracy_m, heading_deg, speed_mps, fix_ts, recent_fixes, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 6, $7, $8, to_timestamp($9 / 1000.0), $10, now())
       ON CONFLICT (driver_user_id) DO UPDATE SET session_id = EXCLUDED.session_id, point = EXCLUDED.point, lat = EXCLUDED.lat,
         lng = EXCLUDED.lng, heading_deg = EXCLUDED.heading_deg, speed_mps = EXCLUDED.speed_mps, fix_ts = EXCLUDED.fix_ts,
         recent_fixes = EXCLUDED.recent_fixes, updated_at = now()`,
      [
        d.userId,
        d.sessionId,
        d.spec.type,
        geo(at),
        at[0],
        at[1],
        fix.headingDeg,
        fix.speedMps,
        now,
        JSON.stringify([fix]),
      ],
    );
    await q(
      `UPDATE sharing_sessions SET last_fix_at = now(), still_working_confirmed_at = now() WHERE id = $1 AND ended_at IS NULL`,
      [d.sessionId],
    );
  }
  await q(
    `UPDATE passenger_requests SET last_ping_at = now(), last_fix_at = now(),
       expires_at = GREATEST(expires_at, now() + interval '30 minutes'), expiry_reminded_at = NULL
     WHERE id = ANY($1::uuid[]) AND status = 'OPEN'`,
    [requestIds],
  );
}

async function stop(): Promise<void> {
  // Leave the map clean: end the fake sessions and cancel the fake requests.
  await q(
    `UPDATE sharing_sessions SET state = 'ENDED', ended_at = now(), end_reason = 'ADMIN'
     WHERE ended_at IS NULL AND driver_user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [`%@${DOMAIN}`],
  );
  await q(
    `DELETE FROM driver_live_locations WHERE driver_user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [`%@${DOMAIN}`],
  );
  await q(
    `UPDATE passenger_requests SET status = 'CANCELLED', closed_at = now()
     WHERE status = 'OPEN' AND passenger_user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [`%@${DOMAIN}`],
  );
}

async function main(): Promise<void> {
  if (process.argv.includes('--clean')) {
    const removed = await q(`DELETE FROM users WHERE email LIKE $1 RETURNING id`, [`%@${DOMAIN}`]);
    process.stdout.write(`Removed ${removed.length} fake accounts and everything they had.\n`);
    return;
  }
  await stop();
  await q(`DELETE FROM driver_routines WHERE driver_user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [
    `%@${DOMAIN}`,
  ]);
  const drivers: LiveDriver[] = [];
  for (const spec of DRIVERS) drivers.push(await setUpDriver(spec));
  const requestIds: string[] = [];
  for (const spec of PASSENGERS) requestIds.push(await setUpPassenger(spec));
  await tick(drivers, requestIds);
  const where = around ? `around ${around.join(',')}` : 'in Teboulba';
  process.stdout.write(
    `Simulating ${drivers.filter((d) => !d.spec.onBreak).length} drivers (1 on a break) and ${requestIds.length} waiting passengers ${where}. Ctrl+C to stop.\n`,
  );

  let ticks = 0;
  const timer = setInterval(() => {
    void tick(drivers, requestIds)
      .then(() => {
        if (++ticks % 12 === 0)
          process.stdout.write(`  ${new Date().toISOString().slice(11, 19)} still running\n`);
      })
      .catch((e: unknown) => process.stderr.write(`tick failed: ${String(e)}\n`));
  }, TICK_MS);

  const shutdown = () => {
    clearInterval(timer);
    void stop()
      .then(() => pool.end())
      .then(() => {
        process.stdout.write('Stopped: fake sessions ended and fake requests cancelled.\n');
        process.exit(0);
      });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main()
  .then(() => {
    if (process.argv.includes('--clean')) void pool.end();
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
