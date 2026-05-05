/**
 * Spacing scale — 4px base unit (matches MUI's default `theme.spacing(n)`).
 *
 * Use semantic spacing names in components instead of magic numbers.
 * `theme.spacing(2)` (16px) is preferred over hardcoded `'16px'`.
 */

export const baseUnit = 4;

export const spacing = {
  none: 0,
  xs:   4,    // 1
  sm:   8,    // 2
  md:   12,   // 3
  lg:   16,   // 4
  xl:   24,   // 6
  '2xl': 32,  // 8
  '3xl': 48,  // 12
  '4xl': 64,  // 16
  '5xl': 96   // 24
};

/**
 * Density presets — apply consistently across grids and stacks.
 */
export const density = {
  compact:    8,
  normal:     16,
  comfortable: 24,
  spacious:   32
};

export default { baseUnit, spacing, density };
