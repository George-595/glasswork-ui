/* The app's one door to the UI kit. Everything in src/ imports UI from
   '~/core/ui', never from '@apps/ui' directly, so an app can wrap, rename or
   swap a component in this one file. App-specific composition lives here too. */
export * from '@apps/ui';
export { AgentVisualView, type AgentVisualViewProps, formatValue } from './AgentVisual';
export { ApiStatusBadge } from './ApiStatusBadge';
export { AuthScreen, type AuthScreenProps } from './AuthScreen';
export { Brand } from './Brand';
export { Delta, type DeltaProps } from './Delta';
export { LinkedText, type LinkedTextProps, splitLinks } from './LinkedText';
export {
  ErrorState,
  type ErrorStateProps,
  LoadingRegion,
  type LoadingRegionProps,
} from './Loading';
export { Money, type MoneyProps } from './Money';
export { NewPasswordField, type NewPasswordFieldProps } from './NewPasswordField';
export { Page, type PageProps } from './Page';
export { QueryView, type QueryViewProps } from './QueryView';
export { ThemeProvider, useAppTheme } from './theme';
