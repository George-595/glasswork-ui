import { Badge } from '@apps/ui';
import { useEffect, useState } from 'react';
import { api } from '~/core/api';

/* ApiStatusBadge — asks /api/health once on mount and says whether the API
   server is up. A status region, so the change is announced politely. */
type Status = 'checking' | 'online' | 'offline';

const LABEL: Record<Status, string> = {
  checking: 'Checking API…',
  online: 'API online',
  offline: 'API offline',
};
const VARIANT = { checking: 'neutral', online: 'up', offline: 'down' } as const;

export function ApiStatusBadge() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    let live = true;
    api.health().then(
      () => live && setStatus('online'),
      () => live && setStatus('offline'),
    );
    return () => {
      live = false;
    };
  }, []);

  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
