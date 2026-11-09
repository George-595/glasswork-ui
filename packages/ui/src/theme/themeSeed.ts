import { createContext } from 'react';
import type { ThemePrefs } from './themeCookie';

/* The look a SERVER painted (from the `ui-theme` cookie), handed down so the first client render
   - hydration - starts from exactly the state the server rendered, whatever this browser's
   localStorage or media queries say. Absent in a client-only app and in tests: the hooks then
   read the browser as they always did. */
export const ThemeSeedContext = createContext<ThemePrefs | null>(null);
