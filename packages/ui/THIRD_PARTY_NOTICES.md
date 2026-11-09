# Third-party notices

@apps/ui ships code ported from the upstream works below, each under its own licence.

## Liquid Glass — the glass skin's material and its refraction

Source: Glass HQ's Liquid Glass (https://github.com/Glass-HQ/liquid-glass), commit
`9f5bfc7daa7be5d20a41b94d841b8f065de655fc`, MIT (text below).

`src/glass/` ports its refraction to TypeScript. The ported files are:

| Ours | Ported from upstream `packages/liquid-glass/src/` |
|---|---|
| `src/glass/png.ts` | `dom/png.ts`: the PNG writer (CRC, Adler, stored or `CompressionStream` deflate, Sub filter, base64) |
| `src/glass/optics.ts` | `core/materials.ts` (the regular material's numbers), `core/optics.ts` (`edgeDisplacement`), `gpu/geometry.ts` (`mapScale`), `gpu/maps.wgsl` (`fs_main`: the displacement field and the specular rim, highlight and side shade), and the tone table from `dom/material-graph.ts` |
| `src/glass/LiquidGlass.tsx` | the filter graph of `dom/lens-layers.ts` and `dom/material-graph.ts` (`frostMarkup`, `toneMarkup`, both regular and clear): field `feImage`, frost, `feDisplacementMap`, tone, coverage |
| `src/glass/environment.ts` | `dom/engine.ts` (`isWebKit`, the Gecko test) |
| `src/glass/maps.ts` | the caching idea of `dom/maps.ts` (a promise per geometry, settled maps read synchronously, oldest evicted) |

Changes from upstream:

- The maps are drawn on the CPU, not by its WebGPU shader through `vgpu`, so no dependency
  is added.
- The outline is the circular rounded rectangle that CSS `border-radius` clips to, not a
  Lisse squircle.
- The filter is applied as an SVG `backdrop-filter` on the element itself, not upstream's
  scene and lens layers.
- The surface fill comes from our tokens, and a third map (`body`) thins that fill only
  across the rim band.

Not ported: the WebGPU renderer, the IndexedDB map store, the worker encoder, morphing,
springs, progressive blur and the Gecko/WebKit lens-layer paths. On those engines the CSS
material in `src/styles/glass.css` is drawn instead. That file reproduces upstream's regular
material in plain CSS: the blur, the light and dark fill opacities, the tone lift, the
specular rim and the `currentColor` 8% control highlight.

```
MIT License

Copyright (c) 2026 Glass HQ

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Lucide — icon path data

The path data in `src/icons/Icon.tsx` follows Lucide (https://lucide.dev).

```
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## shaders and typegpu — the WebGPU backdrops in `src/effects/shaders/`

`ShaderBackdrop` and `ShaderAccent` render effects from the `shaders` npm package
(https://github.com/shader-effects-inc/shaders), version 4.0.4, MIT, copyright (c) 2026 Shader
Effects, Inc. It is a dependency, not copied code: `src/effects/shaders/ShaderScene.tsx` imports
`MeshGradient`, `LiquidMetal`, `SimplexNoise` and `Ripples` from `shaders/react` and tunes their
props from our tokens. The package pulls in `typegpu` 0.12.3 (MIT, copyright (c) 2025 Software
Mansion), also a dependency only. Both are loaded by a dynamic import, only in the glass skin
and only where a shader is used. We pass `disableTelemetry` to the package's `<Shader>`.

```
MIT License

Copyright (c) 2026 Shader Effects Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

`typegpu` is under the same MIT terms with the copyright line "Copyright (c) 2025 Software
Mansion <swmansion.com>" (its `LICENSE` file ships in `node_modules/typegpu/`).

`motion` (MIT) is an npm dependency, not copied code. The effects do not import it; CSS keyframes
and `requestAnimationFrame` replace it. The glass backdrops (`src/effects/backgrounds/`) are the
kit's own shaders on bare WebGL.

## Arc and BoardUI — the input components

`src/components/inputs/` is written in our idiom from two MIT libraries. We read their
behaviour, structure and keyboard model and rebuilt each piece on our Popover and Input
primitives, Tailwind recipes and colour roles; none of their styling, motion library
(`motion`), `react-aria-components` or date libraries came with it. Each derived file carries a
one-line "Adapted from" comment.

| Ours (`src/components/inputs/`) | Derived from |
|---|---|
| `calendar.tsx` | Arc `calendar` (month grid, keyboard model, clamped month steps) and BoardUI `base/date-picker` |
| `date-picker.tsx` (`DatePicker`, `DateRangePicker`) | Arc `date-picker`, `date-range-picker` (presets column, range picking) and BoardUI `base/date-picker` |
| `use-listbox.tsx`, `combobox.tsx` | Arc `combobox` (typeahead filter, active option) and BoardUI `base/select`, on the WAI-ARIA 1.2 combobox pattern |
| `multi-select.tsx` (`MultiSelect`, `TagInput`) | Arc `multi-select`, `tag-input` (removable chips, paste and comma handling) |
| `number-field.tsx` | Arc `number-field` (stepper buttons, key model) |
| `radio-group.tsx` (`RadioGroup`, `RadioCards`) | Arc `radio-group`, `radio-cards` |
| `file-dropzone.tsx` | Arc `file-dropzone`, `file-upload` and BoardUI `base/file-upload` (drop target, accept/size/count rules, file list) |
| `inline-edit.tsx` | Arc `inline-edit` |
| `copy-button.tsx` | Arc `copy-button` |
| `hold-to-confirm.tsx` | Arc `hold-to-confirm` (the hold-and-fill idea, here with a CSS transition and a two-press keyboard alternative) |

Arc is MIT, "Copyright (c) 2026 Elia Kuratli" (github.com/kuratlielia/arc-library). BoardUI is MIT,
"Copyright (c) 2026 Mertcan Dundar Esmergul (BoardUI)". Both licences read:
## AI-interface primitives — `src/ai/`

Ported (written again in our idiom, from reading the source for behaviour, structure and
keyboard model; none of the markup or styling is pasted) from three MIT projects:

| Ours | Derived from |
|---|---|
| `src/ai/ChatMessage.tsx`, `src/ai/ChatThread.tsx` | Arc Library `registry/components/chat-thread` (MIT, Copyright (c) 2026 Elia Kuratli): grouping of turns, the stick-to-bottom rule and the "jump to latest" pill; BoardUI `components/application/agent-chat` (message layout) |
| `src/ai/TextShimmer.tsx` | Arc Library `registry/components/text-shimmer` (MIT, Elia Kuratli): a light band sweeping across a status line. Ours is CSS only, on the kit's `ui-fx-shiny` keyframes |
| `src/ai/Thinking.tsx` | BoardUI `components/application/agent-thinking` (MIT, Copyright (c) 2026 Mertcan Dundar Esmergul): the "thinking" state with a shimmering label; the reasoning disclosure is ours |
| `src/ai/ToolChip.tsx` | BoardUI `components/application/agent-log` (MIT, Mertcan Dundar Esmergul): one tool call as a status line |
| `src/ai/ApprovalCard.tsx` | tool-ui `approval-card` (MIT, Copyright (c) 2025 AgentbaseAI Inc.): the ask / receipt pair |
| `src/ai/Composer.tsx` | BoardUI `components/application/agent-chat/agent-composer` (MIT, Mertcan Dundar Esmergul): Enter sends, a stop button while busy |

Changes from upstream: every colour is a role from `@apps/colors`; no react-aria-components,
no motion library and no icon package (Radix-free, our `Button`, `Icon` and `cva`/`cn`); the
composer is a growing `<textarea>` (Shift+Enter for a new line) rather than a one-line input;
Escape does not deny an approval; the thread is a `log` live region.

Each project's licence is the standard MIT text, under the copyright line shown above:

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Arc (data visualisation) — the charts in `src/charts/` and `src/components/timeline.tsx`

Source: Elia Kuratli's Arc component library (`registry/components/`), MIT, "Copyright (c) 2026
Elia Kuratli" (the standard MIT text, as above). Read for behaviour, structure, keyboard model and
layout, then rewritten onto our primitives, role colours and CSS motion (no `motion` dependency):

| Ours | Adapted from Arc |
|---|---|
| `src/charts/ActivityHeatmap.tsx` | `activity-heatmap`: the week-column calendar, quartile levels, grid keyboard model |
| `src/charts/Gauge.tsx` | `gauge`: the semicircle arc with the value in the middle |
| `src/charts/UsageMeter.tsx` | `usage-meter`: the segmented bar against a limit, legend with values, almost-full / over-limit states |
| `src/charts/Treemap.tsx`, `src/charts/squarify.ts` | `treemap`: the squarified layout and the labels that hide when they do not fit |
| `src/components/timeline.tsx` | `timeline`: the vertical spine with status dots |

Not copied: Arc's styling, colours, `motion` springs and tooltip. Counting up is the kit's own
`RollingNumber`, so Arc's `animated-counter` was not needed.

## BoardUI (notification centre) — `src/account/NotificationBell.tsx`, `src/account/NotificationList.tsx`

Source: BoardUI `components/application/notification-center` (MIT, "Copyright (c) 2026 Mertcan
Dundar Esmergul (BoardUI)", the standard MIT text, as above). Read for the anatomy of a
notification (kind visual, title, description, timestamp, unread state), the header / list /
footer shape of the panel and the empty state. Rebuilt on our Popover, roles, icons and
relative-time formatter; unread is a dot, a bold title and the words "Unread", not colour alone.
Not copied: its tabs, per-item action buttons, avatars, styling and colours.

## Sea glass (Blueemi/sea-glass-demo)

Source: https://github.com/Blueemi/sea-glass-demo, commit
`0f0b561501f8e44d97864ad45174226b47e51ddc`, Copyright (c) 2026 Karol Marczak, MIT.

`src/seaglass/shader.ts` ports the demo's fragment shader (rounded-box pebbles, slice and dome
profiles, wobble, frost, coloured shadows and caustics on paper, specks and grain) and
`src/seaglass/engine.ts` its measure-the-DOM loop, springs, hover lift, press sink and intro
drop. Changes: every colour arrives as a uniform read from a `seaglass-*` role (light and dark),
not a literal; a transparent mode (`paper={false}`) draws shadows as a veil over any surface;
dark mode lowers the frost; the cursor torch and per-frame dither are gone; up to 24 pieces;
the loop draws only while something moves, behind a lag monitor (`perf.ts`) that stops it or
releases the GPU; pieces are React components (`SeaGlass`, `SeaGlassStage`).

> MIT License
>
> Copyright (c) 2026 Karol Marczak
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## earshot — the interface sounds in `src/sound/assets/`

Source: https://github.com/Leonxlnx/earshot, commit `925ebe5`, Copyright (c) 2026 Leon Lin, MIT.

The eleven WAVs are rendered from earshot's sound bank, which stores each sound as code
(physical synthesis parameters, not recordings), by `scripts/render-sounds.py`, an offline step
that is not part of the build. `tick` is earshot's `fit/tick/domino`, a sound fitted as code
from a CC0 recording. The kit ships only the rendered files; nothing at build or run time
depends on earshot.

> MIT License
>
> Copyright (c) 2026 Leon Lin
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.
