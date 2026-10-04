import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, resolveThresholds } from './thresholds.js';

describe('DEFAULT_THRESHOLDS', () => {
  it('matches docs/domain-model.md §3 exactly', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      move_away_m: 20,
      move_away_min_accuracy_m: 25,
      move_away_confirm_s: 10,
      anchor_max_accuracy_m: 30,
      location_lost_min: 5,
      anchor_timeout_s: 60,
      request_ttl_min: 60,
      request_max_renewals: 3,
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
      document_expiry_reminder_days: 30,
    });
  });

  it('is deeply frozen', () => {
    expect(Object.isFrozen(DEFAULT_THRESHOLDS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_THRESHOLDS.break_options_min)).toBe(true);
  });
});

describe('resolveThresholds', () => {
  it('returns the defaults when there are no overrides', () => {
    expect(resolveThresholds()).toEqual(DEFAULT_THRESHOLDS);
    expect(resolveThresholds({})).toEqual(DEFAULT_THRESHOLDS);
  });

  it('applies partial overrides and keeps the other defaults', () => {
    const t = resolveThresholds({ move_away_m: 25, break_options_min: [15, 30] });
    expect(t.move_away_m).toBe(25);
    expect(t.break_options_min).toEqual([15, 30]);
    expect(t.cooldown_min).toBe(60);
  });

  it('rejects unknown keys so typos in admin config fail loudly', () => {
    expect(() => resolveThresholds({ move_away_meters: 25 })).toThrow();
  });

  it('rejects non-positive or non-integer values', () => {
    expect(() => resolveThresholds({ move_away_m: 0 })).toThrow();
    expect(() => resolveThresholds({ cooldown_min: -5 })).toThrow();
    expect(() => resolveThresholds({ request_max_renewals: 1.5 })).toThrow();
  });

  it('allows zero renewals', () => {
    expect(resolveThresholds({ request_max_renewals: 0 }).request_max_renewals).toBe(0);
  });

  it('requires break options to be non-empty, unique and ascending', () => {
    expect(() => resolveThresholds({ break_options_min: [] })).toThrow();
    expect(() => resolveThresholds({ break_options_min: [60, 30] })).toThrow();
    expect(() => resolveThresholds({ break_options_min: [30, 30] })).toThrow();
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(resolveThresholds({ move_away_m: 30 }))).toBe(true);
  });
});
