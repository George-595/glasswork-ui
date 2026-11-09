// touch-targets — the 48px gate for @apps/ui on a phone (UX principle 6; WCAG 2.5.8's 24px is
// only the floor). Imported by a11y-check.mjs. It opens the rendered showcase in a Chrome that
// reports `pointer: coarse` at 390px wide and measures every visible control. A control under
// 48px (44 for a `link` level Button, which is a line of text) on either side fails, unless:
//   - it is an inline link inside a sentence (WCAG 2.5.8's inline exception);
//   - a <label> around it or for it is the target (a Switch row, a Checkbox row);
//   - it is disabled, or not rendered at 390px (the sidebar drawer, a closed dialog);
//   - it matches a selector in KNOWN_GAPS: a control the kit has not grown yet, listed with its
//     reason so the list can only shrink. A control under 48px that is not listed fails the run.
import { pathToFileURL } from 'node:url';

export const TARGET = 48;
/** A `link`-level Button is an inline link that has to stay a line of text: 44px. */
export const LINK_TARGET = 44;

/** selector -> why it is allowed under 48px for now. Fix the component, then delete the line. */
const NOT_USED = 'no page in the app uses it yet (src/pages), so it was not grown for touch';
export const KNOWN_GAPS = {
  '.ui-calendar button': `${NOT_USED}; a 7-column month in a popover is 38px a cell at 390px`,
  '.ui-combobox button': NOT_USED,
  '.ui-chip button': `${NOT_USED} (MultiSelect's remove-chip buttons)`,
  '.ui-inline-edit button': NOT_USED,
  '.ui-field-trigger button': NOT_USED,
  '.ui-breadcrumb a': `${NOT_USED} (breadcrumbs are a desktop trail)`,
  '.ui-thinking button': `${NOT_USED} (the AI assistant's disclosure rows)`,
  '.ui-tool-chip button': `${NOT_USED} (the AI assistant's tool rows)`,
};

/* Runs in the page (it is stringified): the controls under their floor. */
function measure(known, target, linkTarget) {
  const controls = document.querySelectorAll(
    'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=switch], [role=tab], [role=radio], [role=menuitem], [role=option], [role=checkbox], [role=slider]',
  );
  const out = [];
  const nameOf = (el) => {
    const cls = [...el.classList]
      .filter((c) => c.startsWith('ui-'))
      .slice(0, 2)
      .join('.');
    const text = (el.getAttribute('aria-label') || el.textContent || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 28);
    const home = el.parentElement?.closest('[class*="ui-"]');
    const where = home ? [...home.classList].find((c) => c.startsWith('ui-')) : '';
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''} "${text}"${where ? ` in .${where}` : ''}`;
  };
  for (const el of controls) {
    if (!el.checkVisibility?.({ visibilityProperty: true })) continue;
    if (el.closest('[inert], [aria-hidden=true]') || el.disabled) continue;
    const own = el.getBoundingClientRect();
    if (own.width <= 1 || own.height <= 1) continue; // visually hidden (a file input behind its label)
    if (own.bottom <= 0 || own.right <= 0) continue; // parked off screen (the skip link, until focused)
    if (own.bottom <= 0 || own.right <= 0) continue; // parked off screen (the skip link, until focused)
    // a label around a switch, checkbox or radio is the target (a click on it flips the control);
    // a label above a text field is not
    const toggles = el.matches('[role=switch], input[type=checkbox], input[type=radio]');
    // a text input inside a field shell (a combobox, a chip box) is the shell: it takes the click
    const label = toggles ? el.closest('label') || el.labels?.[0] : el.closest('.ui-field-shell');
    const r = label ? label.getBoundingClientRect() : own;
    // an inline link inside a sentence is exempt
    const inSentence =
      el.matches('a[href]') &&
      el.closest('p, li, td, dd') &&
      [...el.parentNode.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent.trim().length > 3,
      );
    if (inSentence) continue;
    // a stretched target: an absolutely positioned ::before / ::after that is bigger than the
    // control (a checkbox's tap area, a KpiTile's whole-card link) is part of what a finger hits
    let w = r.width;
    let h = r.height;
    for (const pseudo of ['::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      if (cs.content === 'none' || cs.position !== 'absolute') continue;
      w = Math.max(w, Number.parseFloat(cs.width) || 0);
      h = Math.max(h, Number.parseFloat(cs.height) || 0);
    }
    const floor = el.dataset.variant === 'link' ? linkTarget : target;
    // a bordered box can measure 47.99: allow half a pixel
    if (w + 0.5 >= floor && h + 0.5 >= floor) continue;
    if (Object.keys(known).some((k) => el.matches(k))) continue;
    out.push({
      name: nameOf(el),
      w: Math.round(w * 10) / 10,
      h: Math.round(h * 10) / 10,
      floor,
    });
  }
  return out;
}

/** Launch a coarse-pointer phone, open `page`, and return the controls under their floor. */
export async function touchTargets({ Stagehand, localBrowser, exe, page }) {
  const browser = await localBrowser.launch({
    headless: true,
    ...(exe ? { executablePath: exe } : {}),
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    // `hasTouch` alone leaves a fine pointer: the blink setting is what makes `(pointer: coarse)` true
    args: ['--blink-settings=primaryPointerType=2,availablePointerTypes=2'],
  });
  const sh = await Stagehand.create({
    browser,
    model: {
      generate: async () => {
        throw new Error('no model in touch-targets');
      },
    },
    logging: { level: 'off', format: 'json' },
  });
  try {
    const tab = (await sh.browser.context.pages())[0] ?? (await sh.browser.context.newPage());
    await tab.setViewportSize(390, 844);
    await tab.goto(pathToFileURL(page).href);
    await tab.waitForLoadState('load');
    const coarse = await tab.evaluate(`matchMedia('(pointer: coarse)').matches`);
    if (!coarse) throw new Error('the browser did not report (pointer: coarse)');
    await tab.evaluate(`(async () => {
      document.documentElement.setAttribute('data-skin', 'enterprise');
      await document.fonts.ready;
      window.dispatchEvent(new Event('ui:generate-skip'));
    })()`);
    const found = await tab.evaluate(
      `(${measure.toString()})(${JSON.stringify(KNOWN_GAPS)}, ${TARGET}, ${LINK_TARGET})`,
    );
    return found;
  } finally {
    await sh.close().catch(() => {});
    await browser.close?.().catch?.(() => {});
  }
}
