/* Page-level patterns: compositions of the core components that pages are made of. */

export { ActionItem, type ActionItemProps, ActionList, type ActionListProps } from './ActionList';
export {
  ActionTile,
  type ActionTileProps,
  ActionTiles,
  type ActionTilesProps,
} from './ActionTiles';
export { AuthLayout, type AuthLayoutProps } from './AuthLayout';
export {
  ChartGrid,
  ChartGridItem,
  type ChartGridItemProps,
  type ChartGridProps,
  type ChartSpan,
} from './ChartGrid';
export {
  BackdropSwatch,
  ChoiceCard,
  type ChoiceCardProps,
  SkinPreview,
} from './ChoiceCard';
export {
  DetailSection,
  type DetailSectionProps,
  DetailSheet,
  type DetailSheetProps,
} from './DetailSheet';
export { FeedItem, type FeedItemProps, FeedList, type FeedListProps } from './FeedList';
/* Photos and step-by-step capture flows. */
export { FlowBar, type FlowBarProps } from './FlowBar';
export { FormActions, type FormActionsProps } from './FormActions';
export { type FormControlProps, FormField, type FormFieldProps } from './FormField';
export { FormGrid, type FormGridProps } from './FormGrid';
export { FormSection, type FormSectionProps } from './FormSection';
export { KpiRow, type KpiRowItem, type KpiRowProps } from './KpiRow';
export { ListPage, type ListPageProps } from './ListPage';
export {
  PageHeader,
  type PageHeaderProps,
  PageLayout,
  type PageLayoutProps,
} from './PageHeader';
export { PageHero, type PageHeroProps } from './PageHero';
export { Photo, type PhotoProps, type PhotoRatio } from './Photo';
export { PhotoCapture, type PhotoCaptureProps } from './PhotoCapture';
export {
  ProductTour,
  type ProductTourProps,
  placeCard,
  scrimPath,
  type TourStep,
} from './ProductTour';
export { PullToRefresh, type PullToRefreshProps, pullDistance } from './PullToRefresh';
export { SaveBar, type SaveBarProps } from './SaveBar';
export {
  SettingsLayout,
  type SettingsLayoutProps,
  type SettingsNavItem,
  SettingsSection,
  type SettingsSectionProps,
} from './SettingsLayout';
export { StatusPage, type StatusPageProps } from './StatusPage';
export { type StepItem, StepList, type StepListProps, type StepStatus } from './StepList';
export type { LoadError, TargetProps } from './shared';
export { ToolLayout, type ToolLayoutProps } from './ToolLayout';
