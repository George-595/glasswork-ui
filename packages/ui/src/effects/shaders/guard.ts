import { useEffect, useState, useSyncExternalStore } from 'react';

/* The page-wide GPU guard for the shader effects.

   A WebGPU canvas is not free, and the package would happily open one per
   <Shader>. ENGINEERING.md §5 allows one GPU context per page, so every
   ShaderBackdrop and ShaderAccent claims the guard while it wants to be live
   and only the OWNER may mount a scene; everyone else draws its CSS gradient.

   Ownership: the highest priority wins, the earliest claim breaks a tie. A
   page backdrop outranks an accent, so an accent that got there first yields
   when the backdrop arrives (it re-renders as its gradient and its scene
   unmounts), and takes the context back if the backdrop later goes. It is an
   external store, so waiting instances re-render when ownership moves. */
export const PRIORITY_ACCENT = 1;
export const PRIORITY_BACKDROP = 2;

interface Claim {
  id: symbol;
  priority: number;
}

let claims: Claim[] = [];
let owner: symbol | null = null;
const listeners = new Set<() => void>();

function elect() {
  let best: Claim | null = null;
  for (const c of claims) if (best === null || c.priority > best.priority) best = c;
  const next = best?.id ?? null;
  if (next === owner) return;
  owner = next;
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
const getOwner = (): symbol | null => owner;
const noOwner = (): symbol | null => null;

/** Hold a claim while `wanted`. Returns whether this instance owns the context. */
export function useGpuClaim(priority: number, wanted: boolean): boolean {
  const [id] = useState(() => Symbol('shader-claim'));
  const current = useSyncExternalStore(subscribe, getOwner, noOwner);
  useEffect(() => {
    if (!wanted) return;
    claims = [...claims, { id, priority }];
    elect();
    return () => {
      claims = claims.filter((c) => c.id !== id);
      elect();
    };
  }, [id, priority, wanted]);
  return wanted && current === id;
}

/** Whether the page holds a claim right now (any instance). For tests and diagnostics. */
export function gpuClaimCount(): number {
  return claims.length;
}

/** Ask the browser for a WebGPU adapter. False when there is no `navigator.gpu`,
    or the request rejects or returns nothing: the cases the package cannot render. */
export async function probeWebGpu(): Promise<boolean> {
  try {
    const gpu = (
      globalThis.navigator as { gpu?: { requestAdapter?: () => Promise<unknown> } } | undefined
    )?.gpu;
    if (typeof gpu?.requestAdapter !== 'function') return false;
    return (await gpu.requestAdapter()) != null;
  } catch {
    return false;
  }
}

/** Test seam: forget every claim. */
export function resetGpuClaims() {
  claims = [];
  elect();
}
