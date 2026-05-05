/**
 * Motion tokens.
 *
 * Three durations and one shared easing keep the product feeling cohesive.
 * Use `fast` for hover / focus, `base` for layout shifts (drawer collapse,
 * modal open), `slow` for marketing reveals & staggered list animations.
 */

export const duration = {
  fast: 150,
  base: 250,
  slow: 450
};

export const easing = {
  // Material standard easeInOut — covers 95% of cases.
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  // For elements entering the screen (modals, palette).
  enter:    'cubic-bezier(0, 0, 0.2, 1)',
  // For elements leaving the screen.
  exit:     'cubic-bezier(0.4, 0, 1, 1)'
};

export const transition = {
  fast: `all ${duration.fast}ms ${easing.standard}`,
  base: `all ${duration.base}ms ${easing.standard}`,
  slow: `all ${duration.slow}ms ${easing.standard}`
};

/**
 * Stagger values for sequential reveals (Framer Motion `staggerChildren`).
 */
export const stagger = {
  tight:  0.04,
  normal: 0.08,
  loose:  0.12
};

const motion = { duration, easing, transition, stagger };
export default motion;
