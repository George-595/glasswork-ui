import { AuthLayout, LoadingRegion, Skeleton, SkeletonText, Stack } from '~/core/ui';
import { Brand } from '~/core/ui/Brand';

/* What stands in for a screen while its file is fetched (ENGINEERING §14 rule 51: a loading gate
   uses the layout it stands in for, so nothing jumps when the real screen arrives). */

/** The signed-in fallback: the shape of every page's header (small label, the h1, one sentence)
    and three cards, in a loading region. The page's own skeleton takes over when it mounts. */
export function PageSkeleton() {
  return (
    <LoadingRegion label="the page">
      <Stack gap={5}>
        <Stack gap={2}>
          <Skeleton radius="sm" width={96} height={12} />
          <Skeleton width="60%" height={32} />
          <SkeletonText lines={2} />
        </Stack>
        <Skeleton height={140} />
        <Skeleton height={140} />
        <Skeleton height={140} />
      </Stack>
    </LoadingRegion>
  );
}

/** The sign-in layout with a skeleton in the form: the session gate, and the public pages
    (accept invite, reset password) while their file is fetched. */
export function AuthSkeleton({ label }: { label: string }) {
  return (
    <AuthLayout
      brand={<Brand />}
      title="Loading…"
      form={
        <LoadingRegion label={label}>
          <SkeletonText lines={3} />
        </LoadingRegion>
      }
    />
  );
}
