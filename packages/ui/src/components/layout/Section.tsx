import { type HTMLAttributes, type ReactNode, useId } from 'react';
import { cn } from '../../lib/cn';
import { Heading, type HeadingLevel, type HeadingSize } from '../typography/Heading';
import { Text } from '../typography/Text';
import { GAP } from './classes';
import { type Responsive, responsive, type Space } from './responsive';

/* Section — a titled region of a page: a heading, an optional line of help, an actions slot
   on the right and the content under them. Renders <section aria-labelledby>, so it is a
   named landmark in a screen reader's region list. `level` is the heading's place in the
   outline (the page's h1 is Page's; sections are 2 by default, a section inside a section 3). */
export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons or filters beside the title. */
  actions?: ReactNode;
  level?: Exclude<HeadingLevel, 1>;
  /** How big the title looks. Defaults to the level's size. */
  titleSize?: HeadingSize;
  /** Keep the title for screen readers only. */
  hideTitle?: boolean;
  /** Space between the header and the content. Default 4 (16px). */
  gap?: Responsive<Space>;
}

export function Section({
  title,
  description,
  actions,
  level = 2,
  titleSize,
  hideTitle,
  gap = 4,
  className,
  children,
  ...props
}: SectionProps) {
  const id = useId();
  return (
    <section
      {...props}
      aria-labelledby={id}
      className={cn('ui-section flex min-w-0 flex-col', responsive(gap, GAP), className)}
    >
      <header
        className={cn(
          'ui-section-header flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2',
          hideTitle && !actions && 'ui-sr-only',
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <Heading
            id={id}
            level={level}
            size={titleSize ?? (level === 2 ? 3 : 4)}
            className={cn(hideTitle && 'ui-sr-only')}
          >
            {title}
          </Heading>
          {description && !hideTitle && (
            <Text size="small" tone="muted" className="max-w-[72ch]">
              {description}
            </Text>
          )}
        </div>
        {actions && (
          <div className="ui-section-actions flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </header>
      {children}
    </section>
  );
}
