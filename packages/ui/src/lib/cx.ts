/** Join class names, skipping falsy values. Replaces clsx + tailwind-merge:
    the package styles with plain CSS classes, so there is nothing to merge. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
