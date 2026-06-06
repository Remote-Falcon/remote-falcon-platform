// Pure helpers for the dashboard PSA quick-play card. Kept out of the component
// so they can be unit-tested without a React/Apollo/router render harness.

/**
 * The PSAs an operator can quick-play from the dashboard: only enabled ones
 * (a disabled PSA no-ops the override — handlePsaOverride clears it without
 * playing), name required, sorted by `order` ascending.
 *
 * `enabled` is a boxed Boolean: null/undefined means enabled, only an explicit
 * `false` disables. Missing `order` sorts as 0. Returns a new array and never
 * mutates the input.
 *
 * @param {Array<{name?: string, enabled?: boolean|null, order?: number}>|null|undefined} psaSequences
 * @returns {Array} filtered + sorted PSA list
 */
export const visibleEnabledPsas = (psaSequences) =>
  (psaSequences || [])
    .filter((p) => p && p.name && p.enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
