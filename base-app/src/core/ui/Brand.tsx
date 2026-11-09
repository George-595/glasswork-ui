import { Cluster, Icon, Text } from '@apps/ui';
import { config } from '~/core/config';

/* The app's name with its mark beside it. The name is real text, not part of a picture, so it
   scales, translates and is read out; the mark is decorative. Shared by every signed-out page
   through AuthScreen and by the shell's sidebar and top bar. `compact` is the phone top bar's and
   the sidebar's version (a smaller mark, the name in body size, one line). An app with its own
   logo passes it as `mark` (an `<img alt="">` or any node); the default is a kit glyph. */
export function Brand({
  compact = false,
  name,
  mark,
}: {
  compact?: boolean;
  name?: string;
  mark?: React.ReactNode;
}) {
  return (
    <Cluster gap={compact ? 2 : 3} nowrap>
      <span className="inline-flex shrink-0" aria-hidden="true">
        {mark ?? <Icon name="database" size={compact ? 18 : 22} />}
      </span>
      <Text as="span" size={compact ? 'body' : 'title'} weight="semibold" truncate>
        {name ?? config.appName}
      </Text>
    </Cluster>
  );
}
