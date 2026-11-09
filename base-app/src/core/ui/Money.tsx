import { Num } from '@apps/ui';
import { formatMoney } from '~/core/utils';

/* Money — an amount in minor units (pence), tabular figures. With `tone`, the
   sign is always shown and coloured, so the direction never rests on colour. */
export interface MoneyProps {
  minor: number;
  currency?: string;
  sign?: boolean;
  tone?: boolean;
}

export function Money({ minor, currency = 'GBP', sign = false, tone = false }: MoneyProps) {
  const tint = !tone ? 'inherit' : minor > 0 ? 'up' : minor < 0 ? 'down' : 'inherit';
  return (
    <Num mono tone={tint} className="app-money whitespace-nowrap">
      {formatMoney(minor, currency, { sign: sign || tone })}
    </Num>
  );
}
