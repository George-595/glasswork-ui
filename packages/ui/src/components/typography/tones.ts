/* Text tones: what a piece of text means, mapped to the text role that carries it. A tone
   is a meaning (muted, danger, up), never a colour, so it follows the skin and the mode. */
export type TextTone =
  | 'default'
  | 'muted'
  | 'subtle'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'up'
  | 'down'
  | 'inherit';

export const TEXT_TONE: Record<TextTone, string> = {
  default: 'text-fg',
  muted: 'text-fg-muted',
  subtle: 'text-fg-subtle',
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  up: 'text-up',
  down: 'text-down',
  inherit: '',
};
