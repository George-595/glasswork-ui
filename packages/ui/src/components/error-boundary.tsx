import { Component, type ErrorInfo, type ReactNode } from 'react';
import { LiquidGlass } from '../glass/LiquidGlass';
import { Button } from './button';

/* ErrorBoundary — keeps one failing subtree from blanking the page: renders an
   inline role="alert" card instead (Liquid Glass in the glass skin, like
   Card). Ported to TS from site/apps/web/src/components/ErrorBoundary.jsx. */
export interface ErrorBoundaryProps {
  children?: ReactNode;
  /** What failed, for the message ("Revenue chart couldn't render"). */
  name?: string;
  /** Replace the default card. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <LiquidGlass
        role="alert"
        band={8}
        lens={false}
        className="ui-error flex flex-col gap-1 rounded-md border border-solid border-danger bg-surface px-3.5 py-3 text-[13px] leading-normal text-fg [box-shadow:var(--elev-0)] glass:[box-shadow:var(--elev-2)]"
      >
        <strong>{this.props.name ?? 'This section'} couldn’t render</strong>
        <span className="ui-error-detail font-mono text-[13px] leading-normal text-fg-subtle [overflow-wrap:anywhere]">
          {error.message.slice(0, 160)}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ui-error-retry mt-1 self-start"
          onClick={this.reset}
        >
          Try again
        </Button>
      </LiquidGlass>
    );
  }
}
