import { useSyncExternalStore } from 'react';
import { SKINS, type Skin } from './useTheme';

/* useDocumentSkin — the skin currently on <html data-skin>, kept live with a
   MutationObserver. For components that render differently per skin (the
   glass backdrop, the refraction filter) without owning the theme state:
   useTheme() writes the attribute, this reads it. 'enterprise' on the server
   and before anything sets the attribute. */
function current(): Skin {
  const v = document.documentElement.getAttribute('data-skin');
  return (SKINS as readonly string[]).includes(v ?? '') ? (v as Skin) : 'enterprise';
}

function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin'] });
  return () => mo.disconnect();
}

export function useDocumentSkin(): Skin {
  return useSyncExternalStore(subscribe, current, () => 'enterprise');
}
