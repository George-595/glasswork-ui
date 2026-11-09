/* runAxe — the WCAG 2.2 AA structural check, inside jsdom.
   Same tags as site/e2e/helpers.mjs and the @apps/ui gate.

   `color-contrast` is OFF here, on purpose: jsdom has no layout and no
   computed cascade from the CSS files, so axe cannot measure contrast in it.
   Contrast is measured in a real browser instead: `npm run check:a11y:browser`
   (scripts/a11y-browser.mjs, Stagehand) and the @apps/ui gate. */
import axe from 'axe-core';

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export async function runAxe(root: Element = document.body): Promise<axe.Result[]> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: AXE_TAGS },
    rules: { 'color-contrast': { enabled: false } },
    resultTypes: ['violations'],
  });
  return results.violations;
}

export function formatViolations(violations: readonly axe.Result[]): string {
  return violations
    .map(
      (v) =>
        `${v.id} (${v.impact ?? 'n/a'}): ${v.help}\n` +
        v.nodes.map((n) => `    ${n.target.join(' ')} — ${n.failureSummary ?? ''}`).join('\n'),
    )
    .join('\n');
}
