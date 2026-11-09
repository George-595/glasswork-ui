import { useMemo } from 'react';
import { useAuth } from '~/core/auth';
import { navigate } from '~/core/router';
import {
  BACKDROPS,
  type Backdrop,
  type CommandItem,
  PRESET_LABELS,
  setBackdrop,
  useAppTheme,
} from '~/core/ui';
import { ROUTES } from './routes';
import { goShortcutFor } from './shortcuts';

/* The command palette's commands, built from what the signed-in person may do:
   - Go to: every route in the table whose role they meet (an admin route is absent for a
     viewer), so a new page appears here with no edit to this file;
   - Appearance: the skin, the mode and the glass skin's animated backdrop;
   - Account: sign out. */
const BACKDROP_LABELS: Readonly<Record<string, string>> = {
  tide: 'Tide',
  hive: 'Hive',
  ...PRESET_LABELS,
};

export function useCommands(): CommandItem[] {
  const { isAdmin, logout } = useAuth();
  const { setSkin, setTheme } = useAppTheme();

  return useMemo(() => {
    const go = ROUTES.filter((r) => r.requires !== 'admin' || isAdmin).map(
      (r): CommandItem => ({
        id: `go-${r.id}`,
        label: r.title,
        group: 'Go to',
        keywords: [r.path, r.group === 'admin' ? 'admin' : 'page'],
        icon: r.icon,
        shortcut: goShortcutFor(r.id),
        onSelect: () => navigate(r.path),
      }),
    );
    const appearance: CommandItem[] = [
      {
        id: 'skin-enterprise',
        label: 'Switch to the Enterprise theme',
        group: 'Appearance',
        keywords: ['skin', 'calm', 'style'],
        icon: 'settings',
        onSelect: () => setSkin('enterprise'),
      },
      {
        id: 'skin-glass',
        label: 'Switch to the Glass theme',
        group: 'Appearance',
        keywords: ['skin', 'liquid', 'style', 'blur'],
        icon: 'settings',
        onSelect: () => setSkin('glass'),
      },
      {
        id: 'mode-light',
        label: 'Switch to light mode',
        group: 'Appearance',
        keywords: ['theme', 'bright', 'day'],
        icon: 'sun',
        onSelect: () => setTheme('light'),
      },
      {
        id: 'mode-dark',
        label: 'Switch to dark mode',
        group: 'Appearance',
        keywords: ['theme', 'night'],
        icon: 'moon',
        onSelect: () => setTheme('dark'),
      },
      ...BACKDROPS.map(
        (b: Backdrop): CommandItem => ({
          id: `backdrop-${b}`,
          label: `Glass backdrop: ${BACKDROP_LABELS[b] ?? b}`,
          group: 'Appearance',
          keywords: ['background', 'animated', 'shader', 'glass'],
          icon: 'chart',
          // the backdrop only shows in the glass skin, so choosing one takes you there
          onSelect: () => {
            setBackdrop(b);
            setSkin('glass');
          },
        }),
      ),
    ];
    const account: CommandItem[] = [
      {
        id: 'sign-out',
        label: 'Sign out',
        group: 'Account',
        keywords: ['log out', 'logout'],
        icon: 'log-out',
        onSelect: () => void logout(),
      },
    ];
    return [...go, ...appearance, ...account];
  }, [isAdmin, logout, setSkin, setTheme]);
}
