import { DEFAULT_THRESHOLDS } from '@fi-thnitek/domain';

/** DI token for the resolved thresholds (docs/domain-model.md §3). Admin overrides arrive with "Content". */
export const THRESHOLDS = Symbol('THRESHOLDS');

export const thresholdsProvider = { provide: THRESHOLDS, useValue: DEFAULT_THRESHOLDS };
