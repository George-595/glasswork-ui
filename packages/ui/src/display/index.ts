/* Display: pieces that show a picture, a script, a colour choice, a remote or a quiet screen
   (tests/display.test.tsx). */
export { DirectionPad, type DirectionPadProps, type PadKey } from './DirectionPad';
export { MediaTile, type MediaTileProps, type MediaTileState } from './MediaTile';
export { QrCode, type QrCodeProps, type QrCodeSize } from './QrCode';
export { encodeQr, QR_MAX_BYTES, type QrMatrix } from './qr/encode';
export { Screensaver, type ScreensaverProps } from './Screensaver';
export {
  currentStepIndex,
  type PlayerStatus,
  type PlayerStep,
  StepPlayer,
  type StepPlayerProps,
} from './StepPlayer';
export {
  type SwatchOption,
  SwatchPicker,
  type SwatchPickerProps,
  type SwatchRole,
} from './SwatchPicker';
