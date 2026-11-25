import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemCheckbox,
  TreeItemIndicator,
  TreeItemLabel,
} from '@ui-sdk/react/tree';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';

/* TreeView — a hierarchy of files, pages or choices, on Vercel's UI SDK tree
   (@ui-sdk/react/tree): the WAI-ARIA tree pattern, with one tab stop, Up/Down between visible
   rows, Right to open a branch (or step into it), Left to close it (or step out to its
   parent), Home/End, type-ahead, and `*` to open every sibling.

   The look: thin guide lines run down from each open folder to its children, so depth reads
   without counting indents; a folder's icon opens when it does; the selected row is a soft
   brand pill with a brand bar at its edge; branches grow and shrink from their measured
   height. `badge` puts a count or a short tag at the row's end ("3", "New"). `checkable`
   gives each row a tri-state checkbox (a folder is mixed while only part of it is checked),
   kept apart from the selection. */
export interface TreeNode {
  id: string;
  label: string;
  icon?: IconName;
  badge?: ReactNode;
  children?: readonly TreeNode[];
  disabled?: boolean;
}

export interface TreeViewProps {
  items: readonly TreeNode[];
  /** Names the tree: "Project files". */
  label: string;
  defaultExpanded?: readonly string[];
  defaultValue?: string;
  value?: string | null;
  onValueChange?: (id: string | null) => void;
  /** Runs on a row's press or Enter (open a file). */
  onAction?: (id: string) => void;
  checkable?: boolean;
  defaultChecked?: readonly string[];
  onCheckedChange?: (ids: string[]) => void;
  className?: string;
}

function Rows({ nodes, checkable }: { nodes: readonly TreeNode[]; checkable: boolean }) {
  return nodes.map((n) => {
    const branch = Boolean(n.children);
    return (
      <TreeItem
        key={n.id}
        value={n.id}
        disabled={n.disabled}
        label={n.label}
        className="ui-tree-item group/ti relative list-none outline-none [&:focus-visible>.ui-tree-row]:[box-shadow:var(--ring-inset)]"
      >
        <TreeItemLabel
          className={cn(
            'ui-tree-row relative flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md pe-2 font-sans text-[13px] text-fg select-none pointer-coarse:min-h-12',
            'ps-[calc((var(--tree-level)-1)*1.25rem+0.25rem)]',
            'transition-colors duration-(--dur-fast) hover:bg-hover motion-reduce:transition-none',
            'data-selected:bg-selected data-selected:font-semibold',
            'data-disabled:cursor-not-allowed data-disabled:text-disabled-fg',
          )}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-1.5 start-0 w-[3px] scale-y-0 rounded-pill bg-brand transition-transform duration-(--dur-base) ease-(--ease-out) group-data-selected/ti:scale-y-100 motion-reduce:transition-none"
          />
          {branch ? (
            <TreeItemIndicator className="inline-flex size-5 shrink-0 items-center justify-center rounded-xs text-fg-muted transition-transform duration-(--dur-base) ease-(--ease-out) data-expanded:rotate-90 motion-reduce:transition-none">
              <Icon name="chevron-right" size={14} />
            </TreeItemIndicator>
          ) : (
            <span aria-hidden="true" className="inline-block size-5 shrink-0" />
          )}
          {checkable && (
            <TreeItemCheckbox className="ui-tree-check inline-flex size-4 shrink-0 items-center justify-center rounded-xs border border-solid border-border-input bg-surface-solid text-on-primary data-checked:border-primary data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary">
              <Icon
                name="check"
                size={12}
                className="hidden group-data-checked/ti:inline-block"
                strokeWidth={3}
              />
              <Icon
                name="minus"
                size={12}
                className="hidden group-data-indeterminate/ti:inline-block"
                strokeWidth={3}
              />
            </TreeItemCheckbox>
          )}
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex shrink-0',
              branch ? 'text-brand' : 'text-fg-muted',
              'group-data-selected/ti:text-brand',
            )}
          >
            {branch ? (
              <>
                <Icon name="folder" size={15} className="group-data-expanded/ti:hidden" />
                <Icon
                  name="folder-open"
                  size={15}
                  className="hidden group-data-expanded/ti:inline-block"
                />
              </>
            ) : (
              <Icon name={n.icon ?? 'file'} size={15} />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate">{n.label}</span>
          {n.badge !== undefined && (
            <span className="shrink-0 rounded-pill bg-sunken px-1.5 text-[11px] leading-[18px] font-medium text-fg-muted tabular-nums">
              {n.badge}
            </span>
          )}
        </TreeItemLabel>
        {n.children && (
          <TreeGroup className="ui-tree-group relative m-0 p-0">
            <span
              aria-hidden="true"
              className="ui-tree-guide pointer-events-none absolute top-0 bottom-2 w-px bg-border-subtle start-[calc((var(--tree-level)-1)*1.25rem+0.85rem)]"
            />
            <Rows nodes={n.children} checkable={checkable} />
          </TreeGroup>
        )}
      </TreeItem>
    );
  });
}

export function TreeView({
  items,
  label,
  defaultExpanded,
  defaultValue,
  value,
  onValueChange,
  onAction,
  checkable = false,
  defaultChecked,
  onCheckedChange,
  className,
}: TreeViewProps) {
  return (
    <Tree
      aria-label={label}
      defaultExpanded={defaultExpanded ? [...defaultExpanded] : undefined}
      defaultValue={defaultValue}
      value={value}
      onValueChange={(v) => onValueChange?.(typeof v === 'string' ? v : null)}
      onAction={onAction ? (id) => onAction(id) : undefined}
      checkable={checkable}
      defaultChecked={defaultChecked ? [...defaultChecked] : undefined}
      onCheckedChange={(ids) => onCheckedChange?.(ids)}
      className={cn('ui-tree m-0 flex w-full min-w-0 flex-col gap-px p-1', className)}
    >
      <Rows nodes={items} checkable={checkable} />
    </Tree>
  );
}
