/* @apps/ui — the shared UI package for apps/. React is the only runtime
   dependency (a peer). Import the styles once, at the app root:

     import '@apps/ui/styles.css';
     import { Button, Card, useTheme } from '@apps/ui';

   Wrap the app in <div className="ui-app"> for the page colour and the
   skin's backdrop. See README.md for the theme/skin contract and the a11y
   check that gates every component. */

/* ---- Account parts: notifications, sessions, avatar, password strength, banner (tests/account.test.tsx) ---- */
export * from './account';
export * from './ai';
export {
  type ActivityDay,
  ActivityHeatmap,
  type ActivityHeatmapProps,
  heatLevel,
} from './charts/ActivityHeatmap';
export {
  BarChart,
  type BarChartProps,
  type BarDatum,
  type BarSeries,
} from './charts/BarChart';
export { ChartCard, type ChartCardProps } from './charts/ChartCard';
export { ChartFailure, type ChartFailureProps } from './charts/ChartFailure';
export type { ChartCommonProps } from './charts/ChartFrame';
export { DonutChart, type DonutChartProps } from './charts/DonutChart';
export {
  FlowDiagram,
  type FlowDiagramProps,
  type FlowEdge,
  type FlowNode,
  layerNodes,
} from './charts/FlowDiagram';
export { biggestDrop, FunnelChart, type FunnelChartProps } from './charts/FunnelChart';
export { Gauge, type GaugeProps } from './charts/Gauge';
export { AreaChart, LineChart, type LineChartProps, type LineSeries } from './charts/LineChart';
export {
  agoLabel,
  inWindow,
  LiveLineChart,
  type LiveLineChartProps,
  type LivePoint,
} from './charts/LiveLineChart';
export { Sparkline, type SparklineProps } from './charts/Sparkline';
export { type Rect, squarify } from './charts/squarify';
export { fitLabel, Treemap, type TreemapProps } from './charts/Treemap';
export { UsageMeter, type UsageMeterProps, type UsageSegment } from './charts/UsageMeter';
/* ---- Kit v2: states, inputs, overlays, data display (kit-v2.test.tsx) ---- */
export { Avatar, type AvatarProps, type AvatarSize, initialsOf, toneOf } from './components/avatar';
export {
  AvatarGroup,
  type AvatarGroupPerson,
  type AvatarGroupProps,
} from './components/avatar-group';
export {
  Badge,
  type BadgeAppearance,
  type BadgeProps,
  type BadgeTone,
  type BadgeVariant,
  badgeVariants,
} from './components/badge';
export {
  type BreadcrumbItem,
  Breadcrumbs,
  type BreadcrumbsProps,
} from './components/breadcrumbs';
export {
  BUTTON_LEVELS,
  Button,
  type ButtonLevel,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  buttonAttrs,
  buttonVariants,
  type LegacyButtonVariant,
  resolveButtonLevel,
} from './components/button';
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  type CardPadding,
  type CardProps,
  CardTitle,
  type CardTitleProps,
  type CardVariant,
  Panel,
  type PanelProps,
} from './components/card';
export { Checkbox, type CheckboxProps } from './components/checkbox';
/* ---- Command palette (command-palette.test.tsx) ---- */
export {
  type CommandItem,
  CommandPalette,
  CommandPaletteButton,
  type CommandPaletteProps,
  filterCommands,
  isMacLike,
  useIsMacLike,
} from './components/command-palette';
export { ConfirmDialog, type ConfirmDialogProps } from './components/confirm-dialog';
// Tables: the composable table system (useDataTable + parts) and Popover.
export {
  type ActiveFilter,
  BulkActionBar,
  type BulkActionBarProps,
  type Column,
  ColumnToggle,
  type ColumnToggleProps,
  type CsvSink,
  DataTable,
  type DataTableApi,
  type DataTableProps,
  type DataTableState,
  DataTableToolbar,
  type DataTableToolbarProps,
  DataTableView,
  type DataTableViewProps,
  DEFAULT_PAGE_SIZES,
  DENSITIES,
  type Density,
  DensityToggle,
  type DensityToggleProps,
  downloadCsv,
  FacetFilter,
  type FacetFilterProps,
  type FacetModel,
  type FacetOption,
  FilterChips,
  type FilterChipsProps,
  type FilterQuery,
  facetCounts,
  filterRows,
  type SelectionApi,
  type SortDir,
  type SortKey,
  sortRows,
  TablePagination,
  type TablePaginationProps,
  TableSearch,
  type TableSearchOptions,
  type TableSearchProps,
  toCsv,
  type UseDataTableOptions,
  useDataTable,
} from './components/data-table';
export { Delta, type DeltaProps, formatDelta } from './components/delta';
export {
  type DescriptionItem,
  DescriptionList,
  type DescriptionListProps,
} from './components/description-list';
export { Dialog, type DialogProps } from './components/dialog';
export { EmptyState, type EmptyStateProps, type EmptyStateSize } from './components/empty-state';
export { ErrorBoundary, type ErrorBoundaryProps } from './components/error-boundary';
export { ErrorState, type ErrorStateProps } from './components/error-state';
export { IconCircle, type IconCircleProps, type IconCircleSize } from './components/icon-circle';
export { fieldClasses, Input, Label, type LabelProps, Textarea } from './components/input';
/* ---- Inputs: dates, choices, chips, numbers, files, confirm (tests/inputs.test.tsx) ---- */
export { Calendar, type CalendarBaseProps, type CalendarProps } from './components/inputs/calendar';
export { Combobox, type ComboboxProps } from './components/inputs/combobox';
export { CopyButton, type CopyButtonProps } from './components/inputs/copy-button';
export {
  DatePicker,
  type DatePickerProps,
  type DatePreset,
  DateRangePicker,
  type DateRangePickerProps,
} from './components/inputs/date-picker';
export {
  addDays as addCalendarDays,
  type DayRange,
  DEFAULT_RANGE_PRESETS,
  EMPTY_RANGE,
  formatDay,
  type IsoDate,
  lastDays,
  type RangePreset,
  todayIso,
  toIso as dateToIso,
} from './components/inputs/dates';
export {
  FileDropzone,
  type FileDropzoneProps,
  type FileRejection,
  fileAccepted,
  formatBytes,
} from './components/inputs/file-dropzone';
export { HoldToConfirm, type HoldToConfirmProps } from './components/inputs/hold-to-confirm';
export { InlineEdit, type InlineEditProps } from './components/inputs/inline-edit';
export {
  MultiSelect,
  type MultiSelectProps,
  TagInput,
  type TagInputProps,
} from './components/inputs/multi-select';
export { NumberField, type NumberFieldProps } from './components/inputs/number-field';
export { OtpField, type OtpFieldProps } from './components/inputs/otp-field';
export {
  RadioCards,
  type RadioCardsProps,
  RadioGroup,
  type RadioGroupProps,
  type RadioOption,
} from './components/inputs/radio-group';
export { type ComboOption, filterOptions } from './components/inputs/use-listbox';
export { Kbd, type KbdProps } from './components/kbd';
export {
  KpiTile,
  type KpiTileProps,
  KpiTileSkeleton,
  type KpiTileSkeletonProps,
} from './components/kpi-tile';
/* ---- Core components: layout and type (tests/core-components.test.tsx) ---- */
export { Cluster, type ClusterProps } from './components/layout/Cluster';
export { FillHeight, type FillHeightProps } from './components/layout/FillHeight';
export {
  Grid,
  type GridCols,
  GridItem,
  type GridItemProps,
  type GridProps,
} from './components/layout/Grid';
export {
  PageGrid,
  type PageGridBreakpoint,
  type PageGridLayout,
  type PageGridProps,
} from './components/layout/PageGrid';
export type { Breakpoint, Responsive, Space } from './components/layout/responsive';
export { Section, type SectionProps } from './components/layout/Section';
export { Show, type ShowProps } from './components/layout/Show';
export { Spacer } from './components/layout/Spacer';
export { type LayoutTag, Stack, type StackProps } from './components/layout/Stack';
export { LoadingRegion, type LoadingRegionProps } from './components/loading-region';
export { Menu, type MenuItem, type MenuProps } from './components/menu';
export { Meter, type MeterProps, type MeterTone, meterTone } from './components/meter';
export { NativeSelect } from './components/native-select';
export { Notice, type NoticeProps, type NoticeTone } from './components/notice';
export { PanelHeader, type PanelHeaderProps } from './components/panel-header';
export { PasswordInput, type PasswordInputProps } from './components/password-input';
export { Popover, type PopoverProps } from './components/popover';
export { Progress, type ProgressProps, type ProgressTone } from './components/progress';
export { PromptDialog, type PromptDialogProps } from './components/prompt-dialog';
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedControlSize,
  type SegmentedOption,
} from './components/segmented-control';
export { Separator, type SeparatorProps } from './components/separator';
export { Sheet, type SheetProps, type SheetSide } from './components/sheet';
export {
  Skeleton,
  type SkeletonProps,
  type SkeletonRadius,
  SkeletonTable,
  type SkeletonTableProps,
  SkeletonText,
  type SkeletonTextProps,
  skeletonVariants,
} from './components/skeleton';
export { Slider, type SliderProps } from './components/slider';
export { type Direction, StatTile, type StatTileProps } from './components/stat-tile';
export { Switch, type SwitchProps } from './components/switch';
export { type TabItem, Tabs, type TabsProps } from './components/tabs';
export {
  Timeline,
  TimelineItem,
  type TimelineItemProps,
  type TimelineProps,
  type TimelineTone,
} from './components/timeline';
export {
  Toaster,
  type ToasterProps,
  type ToastOptions,
  type ToastVariant,
  toast,
  type UndoToastOptions,
} from './components/toast';
export {
  Toggle,
  ToggleGroup,
  type ToggleGroupOption,
  type ToggleGroupProps,
  type ToggleProps,
  toggleVariants,
} from './components/toggle';
export { Tooltip, type TooltipProps } from './components/tooltip';
export {
  Heading,
  type HeadingLevel,
  type HeadingProps,
  type HeadingSize,
} from './components/typography/Heading';
export {
  Code,
  type CodeProps,
  Eyebrow,
  type EyebrowProps,
  Num,
  type NumProps,
  Text,
  type TextProps,
  type TextSize,
  type TextTag,
} from './components/typography/Text';
export { TEXT_TONE, type TextTone } from './components/typography/tones';
export * from './effects';
export {
  type GlassFill,
  type GlassMaterialName,
  LiquidGlass,
  type LiquidGlassOptions,
  type LiquidGlassProps,
  useLiquidGlass,
} from './glass';
export { ICON_NAMES, Icon, type IconName, type IconProps } from './icons/Icon';
export { cx } from './lib/cx';
export {
  formatAbsoluteDate,
  formatAbsoluteDateTime,
  formatRelativeTime,
  type TimeInput,
} from './lib/relative-time';
export { COARSE_POINTER, prefersTouch, useInitialFocus } from './lib/touch';
export { type BottomTab, BottomTabBar, type BottomTabBarProps } from './nav/BottomTabBar';
export { matchSection, type SectionDef, SectionNav, type SectionNavProps } from './nav/SectionNav';
/* ---- Patterns: page-level compositions (tests/patterns.test.tsx) ---- */
export * from './patterns';
/* ---- Sea glass: frosted glass pebbles on paper, with the lag fallback (tests/seaglass.test.tsx) ---- */
export {
  forgetVerdict as forgetSeaGlassVerdict,
  SeaGlass,
  type SeaGlassMode,
  type SeaGlassPad,
  type SeaGlassProps,
  type SeaGlassReason,
  type SeaGlassShape,
  SeaGlassStage,
  type SeaGlassStageProps,
  type SeaGlassThickness,
  type SeaGlassTint,
  type SeaGlassView,
} from './seaglass';
export { AppRoot, type AppRootProps } from './shell/AppRoot';
export {
  AppShell,
  type AppShellProps,
  Sidebar,
  type SidebarGroup,
  type SidebarProps,
  Topbar,
  type TopbarProps,
} from './shell/AppShell';
export { PageEnter } from './shell/PageEnter';
/* ---- Interface sounds (tests/sound.test.tsx) ---- */
export * from './sound';
export {
  AppearanceControls,
  type AppearanceControlsProps,
  SkinSelect,
  type SkinSelectProps,
  ThemeToggle,
  type ThemeToggleProps,
} from './theme/ThemeToggle';
export {
  DEFAULT_PREFS,
  parseThemeCookie,
  serializeThemePrefs,
  THEME_COOKIE,
  type ThemePrefs,
  themeFromCookie,
  themeOf,
} from './theme/themeCookie';
export { ThemeSeedContext } from './theme/themeSeed';
export { useDocumentSkin } from './theme/useDocumentSkin';
export {
  initialMode,
  initialSkin,
  initialTheme,
  SKINS,
  type Skin,
  THEMES,
  type Theme,
  type ThemeMode,
  useTheme,
} from './theme/useTheme';
