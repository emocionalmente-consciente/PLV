/**
 * Stored on each session. Change it whenever a scoring rule changes, so that a saved report can say
 * which rules produced it. Version 1 has the deliberate differences from legacy in the plan's quirks table.
 */
export const ENGINE_VERSION = '1';

/** Phase 9 adds the choice of norm profile. Until then every session uses this one. */
export const DEFAULT_NORM_PROFILE = 'latam';
