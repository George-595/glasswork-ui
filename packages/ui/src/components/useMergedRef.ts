import { type Ref, type RefCallback, useCallback } from 'react';

function assign<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === 'function') ref(node);
  else if (ref) ref.current = node;
}

/** One callback ref that feeds two: the glass hook's and the caller's. */
export function useMergedRef<T>(a: Ref<T> | undefined, b: Ref<T> | undefined): RefCallback<T> {
  return useCallback(
    (node: T | null) => {
      assign(a, node);
      assign(b, node);
    },
    [a, b],
  );
}
