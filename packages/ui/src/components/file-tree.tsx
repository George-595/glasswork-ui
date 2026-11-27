import type { HTMLAttributes, MouseEvent } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';

/* FileTree — a folder tree of links: folders are native disclosures (<details>, so keyboard and
   screen readers get open/close for free), files are links. The folder holding `selected` starts
   open and the selected file is marked aria-current="page".

   `hrefFor(path)` gives each file its address; a plain left click calls `onSelect(path)` instead
   of loading it (the app's router), so a new tab still works. Build the nodes with
   `buildFileTree(paths)`. */

export interface FileTreeNode {
  name: string;
  /** The full path ('notes/today.md'); folders too ('notes'). */
  path: string;
  children?: FileTreeNode[];
}

/** Folders first, then files, each A to Z (case-insensitive, numbers in order). */
export function buildFileTree(paths: readonly string[]): FileTreeNode[] {
  const root: FileTreeNode = { name: '', path: '', children: [] };
  for (const path of paths) {
    const parts = path.split('/').filter((p) => p !== '');
    let node = root;
    parts.forEach((part, i) => {
      const at = parts.slice(0, i + 1).join('/');
      const leaf = i === parts.length - 1;
      node.children ??= [];
      let next = node.children.find((c) => c.name === part && (leaf ? !c.children : !!c.children));
      if (!next) {
        next = leaf ? { name: part, path: at } : { name: part, path: at, children: [] };
        node.children.push(next);
      }
      node = next;
    });
  }
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const sort = (nodes: FileTreeNode[]): FileTreeNode[] =>
    nodes
      .map((n) => (n.children ? { ...n, children: sort(n.children) } : n))
      .sort((a, b) =>
        !!a.children === !!b.children ? collator.compare(a.name, b.name) : a.children ? -1 : 1,
      );
  return sort(root.children ?? []);
}

export interface FileTreeProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  nodes: readonly FileTreeNode[];
  selected?: string | null;
  hrefFor: (path: string) => string;
  onSelect?: (path: string) => void;
  /** The icon for a file (default: file-text). */
  iconFor?: (path: string) => IconName;
  /** Open every folder (a filtered tree). */
  expandAll?: boolean;
  /** The nav's accessible name. */
  label?: string;
}

const ROW =
  'flex min-h-9 pointer-coarse:min-h-11 w-full items-center gap-2 rounded-md px-2 py-1 text-start text-fg no-underline [font:var(--t-small)] hover:bg-hover focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]';

function Nodes({
  nodes,
  props,
  depth,
}: {
  nodes: readonly FileTreeNode[];
  props: FileTreeProps;
  depth: number;
}) {
  const { selected, hrefFor, onSelect, iconFor, expandAll } = props;
  return (
    <ul
      className={cn(
        'm-0 flex list-none flex-col p-0',
        depth > 0 && 'ms-3 border-0 border-s border-solid border-border-subtle ps-1',
      )}
    >
      {nodes.map((n) => {
        if (n.children) {
          const holdsSelected = !!selected && selected.startsWith(`${n.path}/`);
          return (
            <li key={`d:${n.path}`}>
              <details open={expandAll || holdsSelected}>
                <summary
                  className={cn(ROW, 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')}
                >
                  <Icon
                    name="chevron-right"
                    size={14}
                    className="shrink-0 text-fg-muted transition-transform motion-reduce:transition-none [[open]>summary>&]:rotate-90"
                  />
                  <Icon name="folder" size={16} className="shrink-0 text-fg-muted" />
                  <span className="min-w-0 truncate" title={n.name}>
                    {n.name}
                  </span>
                </summary>
                <Nodes nodes={n.children} props={props} depth={depth + 1} />
              </details>
            </li>
          );
        }
        const current = n.path === selected;
        const onClick = onSelect
          ? (e: MouseEvent<HTMLAnchorElement>) => {
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              onSelect(n.path);
            }
          : undefined;
        return (
          <li key={`f:${n.path}`}>
            <a
              href={hrefFor(n.path)}
              onClick={onClick}
              aria-current={current ? 'page' : undefined}
              className={cn(ROW, 'ps-7', current && 'bg-selected font-semibold')}
            >
              <Icon
                name={iconFor?.(n.path) ?? 'file-text'}
                size={16}
                className="shrink-0 text-fg-muted"
              />
              <span className="min-w-0 truncate" title={n.name}>
                {n.name}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function FileTree(props: FileTreeProps) {
  const {
    nodes,
    selected: _s,
    hrefFor: _h,
    onSelect: _o,
    iconFor: _i,
    expandAll: _e,
    label = 'Files',
    className,
    ...rest
  } = props;
  return (
    <nav aria-label={label} {...rest} className={cn('ui-file-tree min-w-0', className)}>
      <Nodes nodes={nodes} props={props} depth={0} />
    </nav>
  );
}
