import { Button } from '../components/button';
import { Stack } from '../components/layout/Stack';
import { Text } from '../components/typography/Text';

/* ChartFailure — what a ChartCard's `error` slot holds: "Couldn't load <what>." and a Retry.
   The card supplies the role="alert", so this is plain content (ErrorState is its own alert
   and would nest one). Without `onRetry` there is no button. */
export interface ChartFailureProps {
  /** What failed, e.g. "revenue". Read as "Couldn’t load revenue." */
  what: string;
  onRetry?: () => void;
}

export function ChartFailure({ what, onRetry }: ChartFailureProps) {
  return (
    <Stack gap={2} align="start" className="ui-chart-failure">
      <Text className="font-semibold">Couldn’t load {what}.</Text>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Stack>
  );
}
