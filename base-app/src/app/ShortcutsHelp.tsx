import { Cluster, DescriptionList, Dialog, Kbd, Text, useIsMacLike } from '~/core/ui';

/* The `?` dialog: every keyboard shortcut in one place. The list mirrors shortcuts.ts (and the
   palette's own ⌘K), rendered as a description list so a screen reader hears "action: keys". */
interface Row {
  action: string;
  /** The keys, in the order they are pressed. */
  keys: readonly string[];
  /** The word between keys: "then" for a sequence, "+" for a chord. */
  join?: string;
}

function rows(mac: boolean): readonly Row[] {
  const mod = mac ? '⌘' : 'Ctrl';
  return [
    { action: 'Open the command palette', keys: [mod, 'K'], join: '+' },
    { action: 'Go to Home', keys: ['g', 'h'], join: 'then' },
    { action: 'Go to Table', keys: ['g', 't'], join: 'then' },
    { action: 'Go to Graphs', keys: ['g', 'g'], join: 'then' },
    { action: 'Collapse or expand the sidebar', keys: ['['] },
    { action: 'Ask the assistant about this page', keys: ['a'] },
    { action: 'Show this help', keys: ['?'] },
  ];
}

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mac = useIsMacLike();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Shortcuts do not run while you are typing in a field."
    >
      <DescriptionList
        items={rows(mac).map((r) => ({
          term: r.action,
          detail: (
            <Cluster gap={1} nowrap>
              {r.keys.map((k, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed pair of keys, and "g g" repeats
                <Cluster key={i} gap={1} nowrap>
                  {i > 0 && r.join && (
                    <Text as="span" size="small" tone="muted">
                      {r.join}
                    </Text>
                  )}
                  <Kbd>{k}</Kbd>
                </Cluster>
              ))}
            </Cluster>
          ),
        }))}
      />
    </Dialog>
  );
}
