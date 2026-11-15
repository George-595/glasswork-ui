/* `SeaGlassEngine` is exported here for the kit's own tests and tools only. `src/index.ts` must not re-export it:
   the engine and its shader are fetched when a stage first draws (SeaGlassStage), and a static re-export from the
   package entry would put them back in every page's first load. */
export { type Lighting, type PieceHandle, type PieceState, SeaGlassEngine } from './engine';
export {
  forgetVerdict,
  judgeFrames,
  LagMonitor,
  PROBE_MS,
  rememberedVerdict,
  rememberVerdict,
  type SeaGlassVerdict,
} from './perf';
export {
  SeaGlass,
  type SeaGlassPad,
  type SeaGlassProps,
  type SeaGlassShape,
  type SeaGlassThickness,
  type SeaGlassTint,
} from './SeaGlass';
export {
  type SeaGlassMode,
  type SeaGlassReason,
  SeaGlassStage,
  type SeaGlassStageProps,
  type SeaGlassView,
  useSeaGlassStage,
} from './SeaGlassStage';
