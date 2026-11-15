import type { Effect, Role } from './roles.ts';

/** `var(--role)`: how JS (charts, shaders, inline SVG) refers to a role. Never a value. It lives apart from
    `roles.ts`, which computes its theme tables when it loads, so a page that needs only this does not ship them. */
export const cssVar = (name: Role | Effect): string => `var(--${name})`;
