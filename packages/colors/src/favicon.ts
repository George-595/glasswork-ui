/* The app icon, written from the roles so it carries no colour of its own: the main-action
   pair (primary / on-primary) of the enterprise skin, light by default and dark when the
   browser chrome is dark. Static, because a favicon cannot read the page's CSS variables. */
import { THEMES } from './roles.ts';

export function faviconSvg(): string {
  const light = THEMES['enterprise-light'].roles;
  const dark = THEMES['enterprise-dark'].roles;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><title>Base app</title><style>
.bg{fill:${light.primary}}.fg{stroke:${light['on-primary']}}
@media (prefers-color-scheme: dark){.bg{fill:${dark.primary}}.fg{stroke:${dark['on-primary']}}}
</style><rect class="bg" width="32" height="32" rx="7"/><path class="fg" d="M9 22V10h8a4 4 0 0 1 0 8H9m8 0 6 4" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
`;
}
