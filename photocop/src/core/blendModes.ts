/**
 * Blend mode list for UI selectors.
 * Matches the BlendMode union type in types.ts.
 */

import type { BlendMode } from './types';

export const BLEND_MODES_LIST: BlendMode[] = [
  'Normal', 'Dissolve',
  'Darken', 'Multiply', 'ColorBurn', 'LinearBurn',
  'Lighten', 'Screen', 'ColorDodge', 'LinearDodge',
  'Overlay', 'SoftLight', 'HardLight', 'VividLight', 'LinearLight', 'PinLight',
  'Difference', 'Exclusion', 'Subtract', 'Divide',
  'Hue', 'Saturation', 'Color', 'Luminosity',
];

export const BLEND_MODE_GROUPS: { label: string; modes: BlendMode[] }[] = [
  { label: 'Normal',     modes: ['Normal', 'Dissolve'] },
  { label: 'Darken',     modes: ['Darken', 'Multiply', 'ColorBurn', 'LinearBurn'] },
  { label: 'Lighten',    modes: ['Lighten', 'Screen', 'ColorDodge', 'LinearDodge'] },
  { label: 'Contrast',   modes: ['Overlay', 'SoftLight', 'HardLight', 'VividLight', 'LinearLight', 'PinLight'] },
  { label: 'Inversion',  modes: ['Difference', 'Exclusion', 'Subtract', 'Divide'] },
  { label: 'Component',  modes: ['Hue', 'Saturation', 'Color', 'Luminosity'] },
];
