import { useEffect, useState, useSyncExternalStore } from 'react';

/* The page-wide WebGL guard (ENGINEERING.md §5: never more than one WebGL context per page).

   Two kinds of claimant share it: the AnimatedBackground behind the glass skin, and a
   SeaGlassStage. A stage outranks a background: it goes to the front of the queue while it
   wants a context (it is on screen), so the background yields to its static gradient and
   takes the context back when the stage lets go. Among equals, the earliest claim wins.
   It is an external store, so waiting instances re-render when ownership moves. */
export type WebGlClaimant = 'background' | 'stage';

interface Claim {
  id: symbol;
  kind: WebGlClaimant;
}

let claims: Claim[] = [];
const listeners = new Set<() => void>();
const notify = () => {
  for (const fn of listeners) fn();
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const current = (): Claim | null => claims[0] ?? null;
const none = (): Claim | null => null;

/** Join the queue. A stage goes ahead of every background (but behind earlier stages). */
export function claimWebGl(id: symbol, kind: WebGlClaimant): () => void {
  const claim = { id, kind };
  if (kind === 'stage') {
    const firstBackground = claims.findIndex((c) => c.kind === 'background');
    claims =
      firstBackground === -1
        ? [...claims, claim]
        : [...claims.slice(0, firstBackground), claim, ...claims.slice(firstBackground)];
  } else {
    claims = [...claims, claim];
  }
  notify();
  return () => {
    claims = claims.filter((c) => c.id !== id);
    notify();
  };
}

/** The claim that holds the context now, or null. */
export function useWebGlOwner(): Claim | null {
  return useSyncExternalStore(subscribe, current, none);
}

/** Hold a claim while `wanted`. Returns whether this instance owns the context. */
export function useWebGlClaim(kind: WebGlClaimant, wanted: boolean): boolean {
  const [id] = useState(() => Symbol(kind));
  const owner = useWebGlOwner();
  useEffect(() => {
    if (!wanted) return;
    return claimWebGl(id, kind);
  }, [id, kind, wanted]);
  return wanted && owner?.id === id;
}

/** Test seam: forget every claim. */
export function resetWebGlGuard(): void {
  claims = [];
  notify();
}
