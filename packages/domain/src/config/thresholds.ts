import { z } from 'zod';

const positiveInt = z.number().int().positive();

/**
 * Configurable thresholds (docs/domain-model.md §3). Keys match the admin "Content → thresholds" names.
 * Never hard-code these values elsewhere (CLAUDE.md rule 4); read them from a resolved config.
 */
export const ThresholdsSchema = z
  .object({
    /** Passenger: distance from the anchor that closes the request (MOVED_AWAY). */
    move_away_m: positiveInt,
    /** Passenger: fixes worse than this are ignored by the move-away rule. */
    move_away_min_accuracy_m: positiveInt,
    /** Passenger: two far fixes at least this far apart confirm a move. */
    move_away_confirm_s: positiveInt,
    /** Passenger: the anchor needs a fix at least this accurate. */
    anchor_max_accuracy_m: positiveInt,
    /** Passenger: no location for this long → LOCATION_LOST. */
    location_lost_min: positiveInt,
    /** Passenger: no anchor (accurate fix) this long after posting → NO_GPS_FIX (R-033). */
    anchor_timeout_s: positiveInt,
    request_ttl_min: positiveInt,
    request_max_renewals: z.number().int().nonnegative(),
    /** Passenger: the "Renew?" push this many minutes before expiry (R-036). */
    request_expiry_reminder_min: positiveInt,
    /** Passenger: requests per Tunis day for accounts younger than `request_new_account_days`, then for all (R-040). */
    request_daily_limit_new: positiveInt,
    request_daily_limit: positiveInt,
    request_new_account_days: positiveInt,
    /** Passenger device cadence (R-032): every N s, a 3 m filter, a 5-minute offline buffer. */
    passenger_ping_s: positiveInt,
    passenger_distance_filter_m: positiveInt,
    passenger_buffer_max_min: positiveInt,
    /** Driver: a fix older than this is not "fresh" (SHARING_REQUIRED). */
    driver_fresh_s: positiveInt,
    driver_buffer_max_min: positiveInt,
    /** Driver: a hole longer than this between consecutive fixes ends the session (PING_GAP, R-057). */
    ping_gap_s: positiveInt,
    /** Driver device cadence (R-052): a fix every N s while moving / stationary, moving = ≥ the distance filter. */
    driver_ping_moving_s: positiveInt,
    driver_ping_stationary_s: positiveInt,
    driver_distance_filter_m: positiveInt,
    cooldown_min: positiveInt,
    break_options_min: z
      .array(positiveInt)
      .nonempty()
      .refine((xs) => xs.every((x, i) => i === 0 || x > xs[i - 1]!), 'must be unique and ascending'),
    break_resume_window_min: positiveInt,
    session_max_h: positiveInt,
    /** "Still working?" unanswered for this long → MAX_DURATION (R-058). */
    still_working_answer_min: positiveInt,
    routine_max: positiveInt,
    routine_stale_days: positiveInt,
    routine_prompt_grace_days: positiveInt,
    routine_prefill_window_min: positiveInt,
    pickup_radius_m: positiveInt,
    spoof_speed_kmh: positiveInt,
    approx_grid_m: positiveInt,
    /** Live map: no markers for a visible area wider or taller than this (R-020, "zoom in"). */
    map_max_span_km: positiveInt,
    /** Clustered map: the visible area is split into N × N cells (R-020). */
    map_cluster_cells: positiveInt,
    /** Finder (R-045): "heading to" near the destination: taxi (urban) / louage-bus (intercity). */
    finder_near_urban_m: positiveInt,
    finder_near_intercity_m: positiveInt,
    /** Finder: half-width of the corridor from the driver to their "heading to". */
    finder_corridor_urban_m: positiveInt,
    finder_corridor_intercity_m: positiveInt,
    /** Finder: drivers within this distance of the passenger: taxi / louage-bus. */
    finder_radius_taxi_m: positiveInt,
    finder_radius_intercity_m: positiveInt,
    /** Finder: routine destinations and origins this close to the passenger's destination and position. */
    finder_routine_m: positiveInt,
    /** Moderation (anti-abuse §2–3): reports a user may file per Tunis day. */
    report_daily_limit: positiveInt,
    /** "Nobody there" from this many distinct drivers within the window → a request pause. */
    nobody_there_reports: positiveInt,
    nobody_there_window_days: positiveInt,
    request_pause_h: positiveInt,
    /** Reports from this many distinct users on one person within the window → a risk flag. */
    report_flag_count: positiveInt,
    report_flag_window_days: positiveInt,
    /** Live accounts per device within the window; newer ones cannot request. */
    device_max_accounts: positiveInt,
    device_window_days: positiveInt,
    /** Pick-up records are kept this long, longer while an open report points at them (§4). */
    pickup_retention_days: positiveInt,
    /** Retention (§4): closed requests keep only ~1 km cells after this many days. */
    request_coarsen_days: positiveInt,
    request_coarse_grid_m: positiveInt,
    /** Ended sharing sessions and their events are deleted after this many days. */
    session_retention_days: positiveInt,
    /** Crash reports (scrubbed) are kept this long. */
    client_error_retention_days: positiveInt,
    /** Pick-on-map: a destination pin is named after a known place only this close to it (ADR-225). */
    destination_snap_m: positiveInt,
    /** Drivers get a reminder this many days before an accepted document expires (R-064). */
    document_expiry_reminder_days: positiveInt,
  })
  .strict();

export type Thresholds = Readonly<
  Omit<z.infer<typeof ThresholdsSchema>, 'break_options_min'> & { break_options_min: readonly number[] }
>;

function freeze(t: z.infer<typeof ThresholdsSchema>): Thresholds {
  return Object.freeze({ ...t, break_options_min: Object.freeze([...t.break_options_min]) });
}

export const DEFAULT_THRESHOLDS: Thresholds = freeze(
  ThresholdsSchema.parse({
    move_away_m: 20,
    move_away_min_accuracy_m: 25,
    move_away_confirm_s: 10,
    anchor_max_accuracy_m: 30,
    location_lost_min: 5,
    anchor_timeout_s: 60,
    request_ttl_min: 30,
    request_max_renewals: 0,
    request_expiry_reminder_min: 10,
    request_daily_limit_new: 5,
    request_daily_limit: 15,
    request_new_account_days: 3,
    passenger_ping_s: 5,
    passenger_distance_filter_m: 3,
    passenger_buffer_max_min: 5,
    driver_fresh_s: 120,
    driver_buffer_max_min: 60,
    ping_gap_s: 120,
    driver_ping_moving_s: 10,
    driver_ping_stationary_s: 30,
    driver_distance_filter_m: 10,
    cooldown_min: 60,
    break_options_min: [30, 60, 120],
    break_resume_window_min: 15,
    session_max_h: 12,
    still_working_answer_min: 10,
    routine_max: 5,
    routine_stale_days: 30,
    routine_prompt_grace_days: 7,
    routine_prefill_window_min: 60,
    pickup_radius_m: 50,
    spoof_speed_kmh: 180,
    approx_grid_m: 100,
    map_max_span_km: 25,
    map_cluster_cells: 8,
    finder_near_urban_m: 2_000,
    finder_near_intercity_m: 10_000,
    finder_corridor_urban_m: 1_000,
    finder_corridor_intercity_m: 5_000,
    finder_radius_taxi_m: 5_000,
    finder_radius_intercity_m: 15_000,
    finder_routine_m: 15_000,
    report_daily_limit: 10,
    nobody_there_reports: 3,
    nobody_there_window_days: 7,
    request_pause_h: 24,
    report_flag_count: 3,
    report_flag_window_days: 7,
    device_max_accounts: 2,
    device_window_days: 30,
    pickup_retention_days: 90,
    request_coarsen_days: 30,
    request_coarse_grid_m: 1000,
    session_retention_days: 365,
    client_error_retention_days: 90,
    destination_snap_m: 20,
    document_expiry_reminder_days: 30,
  }),
);

/** Merges admin overrides onto the defaults and validates the result; throws a ZodError if invalid. */
export function resolveThresholds(overrides: unknown = {}): Thresholds {
  const partial = z.record(z.string(), z.unknown()).parse(overrides);
  return freeze(ThresholdsSchema.parse({ ...DEFAULT_THRESHOLDS, ...partial }));
}
