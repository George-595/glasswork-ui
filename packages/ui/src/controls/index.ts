/* Controls: the pieces a dashboard of switches, levels and set-points is made of
   (tests/controls.test.tsx). */
export {
  ControlTile,
  type ControlTileAction,
  type ControlTileProps,
  type ControlTileSize,
  type ControlTileState,
  type ControlTileTone,
} from './ControlTile';
export {
  Countdown,
  type CountdownProps,
  type CountdownTone,
  formatSeconds,
  secondsLeft,
} from './Countdown';
export { Keypad, type KeypadProps } from './Keypad';
export { LevelSlider, type LevelSliderProps } from './LevelSlider';
export { StatusDot, type StatusDotProps, type StatusDotSize, type StatusTone } from './StatusDot';
export { ValueStepper, type ValueStepperProps } from './ValueStepper';
