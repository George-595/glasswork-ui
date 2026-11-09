import { AuthLayout, type AuthLayoutProps, Cluster, Icon, ShaderBackdrop, Text } from '@apps/ui';
import { useEffect } from 'react';
import { config } from '~/core/config';
import { useAppTheme } from './theme';

/* AuthScreen — a signed-out page. The kit's AuthLayout with the app's brand mark, the animated
   backdrop behind the glass skin's card, and the document title ("<title> · <app name>"), so
   accept-invite, forgot-password and reset-password look like the sign-in page without each
   one rebuilding it. `title` must be a string (it is also the tab title). */
export interface AuthScreenProps extends Omit<AuthLayoutProps, 'brand' | 'backdrop' | 'title'> {
  title: string;
}

export function AuthScreen({ title, ...layout }: AuthScreenProps) {
  const { skin } = useAppTheme();
  useEffect(() => {
    document.title = `${title} · ${config.appName}`;
  }, [title]);
  return (
    <AuthLayout
      {...layout}
      title={title}
      backdrop={skin === 'glass' ? <ShaderBackdrop preset="mesh" intensity={0.65} /> : undefined}
      brand={
        <Cluster gap={2} nowrap>
          <Icon name="database" size={18} />
          <Text as="span" weight="semibold">
            {config.appName}
          </Text>
        </Cluster>
      }
    />
  );
}
