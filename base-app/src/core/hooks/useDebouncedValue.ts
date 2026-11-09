import { useEffect, useState } from 'react';

/* A value that trails `value` by `ms` of quiet: it changes only once `value`
   has stopped changing for that long. For turning every keystroke in a search
   box into one request. The first render returns `value` itself, and a change
   that comes back to the settled value cancels the pending update. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}
