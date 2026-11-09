import { lazy, Suspense } from 'react';
import { ErrorBoundary } from '../../components/error-boundary';
import type { ShaderPalette } from './palette';
import type { ShaderPreset } from './presets';
import type { ShaderStage } from './useShaderStage';

/* SceneSlot — the lazily loaded scene inside its safety nets. `lazy()` is the
   dynamic import that keeps the `shaders` package out of the main bundle; a
   failed chunk load, a throw while rendering and the package's own
   onUnavailable all end in `stage.fail()`, which turns the view into
   "unavailable" so the caller draws its fallback. Nothing here can blank the
   page. */
const ShaderScene = lazy(() => import('./ShaderScene'));

export function SceneSlot({
  stage,
  preset,
  palette,
}: {
  stage: ShaderStage;
  preset: ShaderPreset;
  palette: ShaderPalette;
}) {
  return (
    <ErrorBoundary fallback={() => null} onError={stage.fail}>
      <Suspense fallback={null}>
        <ShaderScene
          className="ui-shader-canvas"
          preset={preset}
          palette={palette}
          onReady={stage.onReady}
          onUnavailable={stage.fail}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
