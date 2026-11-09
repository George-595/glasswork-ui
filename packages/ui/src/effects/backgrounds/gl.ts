import type { Rgb } from '../cssColor';
import type { BackgroundScene } from './types';

/* A full-screen fragment shader on bare WebGL: the whole engine the backdrops need.

   One canvas, one context (WebGL2 when there is one, WebGL1 otherwise; the shaders are GLSL ES
   1.00, which both run), one triangle that covers the screen. The caller's shader gets:

     uniform vec2  uRes;    // the canvas in pixels
     uniform float uTime;   // seconds of visible animation
     uniform vec3  uC0, uC1, uC2;  // the three ramp colours (linear 0..1)

   Pixel budget (ENGINEERING.md §5 rule 4): the canvas is drawn at a device-pixel ratio of at
   most 1, and at most MAX_PIXELS in all; CSS stretches it over the page. A backdrop is soft,
   so the eye cannot tell, and the GPU does a fraction of the work. */

/** The most pixels a backdrop canvas will hold (about 1280 x 720). */
export const MAX_PIXELS = 1280 * 720;

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

type Gl = WebGLRenderingContext | WebGL2RenderingContext;

function compile(gl: Gl, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** A context on a fresh canvas, or null when the browser will not give one. */
function context(canvas: HTMLCanvasElement): Gl | null {
  const attributes: WebGLContextAttributes = {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'low-power',
  };
  try {
    return (
      (canvas.getContext('webgl2', attributes) as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl', attributes) as WebGLRenderingContext | null)
    );
  } catch {
    return null;
  }
}

/** Mount a full-screen shader scene in `container`, or null without WebGL. */
export function mountShaderScene(
  container: HTMLElement,
  colors: readonly Rgb[],
  fragment: string,
): BackgroundScene | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const gl = context(canvas);
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
  gl.useProgram(program);

  // one triangle larger than the screen: no seam down the middle, three vertices
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(program, 'uRes');
  const uTime = gl.getUniformLocation(program, 'uTime');
  const uColors = [
    gl.getUniformLocation(program, 'uC0'),
    gl.getUniformLocation(program, 'uC1'),
    gl.getUniformLocation(program, 'uC2'),
  ];

  const setColors = (list: readonly Rgb[]) => {
    uColors.forEach((loc, i) => {
      const c = list[i] ?? list[0] ?? ([1, 1, 1] as const);
      gl.uniform3f(loc, c[0], c[1], c[2]);
    });
  };
  setColors(colors);
  container.append(canvas);

  return {
    resize(width, height) {
      const scale = Math.min(1, Math.sqrt(MAX_PIXELS / Math.max(1, width * height)));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    },
    render(seconds) {
      gl.uniform1f(uTime, seconds);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    setColors,
    destroy() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
}
