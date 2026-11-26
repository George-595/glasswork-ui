/* The phone's status bar and browser chrome take their colour from <meta name="theme-color">.
   Without one, an installed app on iOS or Android shows a bar that does not match the page
   (mobile-native: "Status bar color doesn't match"). The colour is never written here: it is
   read from the page's own `--canvas` role after the theme and skin are applied, so it follows
   light, dark and the skin like everything else. */
export function syncThemeColor() {
  if (typeof document === 'undefined') return;
  const value = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim();
  if (!value) return;
  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  if (meta.content !== value) meta.content = value;
}
