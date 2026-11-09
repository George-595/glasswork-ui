/* LoadingRegion and ErrorState moved into the kit (@apps/ui). The kit reads the
   error structurally (message / code / status / errorId), so it needs no
   ApiError type; this file keeps the old import path alive. */
export {
  ErrorState,
  type ErrorStateProps,
  LoadingRegion,
  type LoadingRegionProps,
} from '@apps/ui';
