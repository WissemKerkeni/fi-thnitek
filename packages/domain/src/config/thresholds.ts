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
    request_ttl_min: positiveInt,
    request_max_renewals: z.number().int().nonnegative(),
    /** Driver: a fix older than this is not "fresh" (SHARING_REQUIRED). */
    driver_fresh_s: positiveInt,
    driver_buffer_max_min: positiveInt,
    cooldown_min: positiveInt,
    break_options_min: z
      .array(positiveInt)
      .nonempty()
      .refine((xs) => xs.every((x, i) => i === 0 || x > xs[i - 1]!), 'must be unique and ascending'),
    break_resume_window_min: positiveInt,
    session_max_h: positiveInt,
    routine_max: positiveInt,
    routine_stale_days: positiveInt,
    routine_prompt_grace_days: positiveInt,
    routine_prefill_window_min: positiveInt,
    pickup_radius_m: positiveInt,
    spoof_speed_kmh: positiveInt,
    approx_grid_m: positiveInt,
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
    request_ttl_min: 60,
    request_max_renewals: 3,
    driver_fresh_s: 120,
    driver_buffer_max_min: 60,
    cooldown_min: 60,
    break_options_min: [30, 60, 120],
    break_resume_window_min: 15,
    session_max_h: 12,
    routine_max: 5,
    routine_stale_days: 30,
    routine_prompt_grace_days: 7,
    routine_prefill_window_min: 60,
    pickup_radius_m: 50,
    spoof_speed_kmh: 180,
    approx_grid_m: 100,
    document_expiry_reminder_days: 30,
  }),
);

/** Merges admin overrides onto the defaults and validates the result; throws a ZodError if invalid. */
export function resolveThresholds(overrides: unknown = {}): Thresholds {
  const partial = z.record(z.string(), z.unknown()).parse(overrides);
  return freeze(ThresholdsSchema.parse({ ...DEFAULT_THRESHOLDS, ...partial }));
}
