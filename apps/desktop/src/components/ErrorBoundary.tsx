import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { crashDetails, crashMessage, reportCrash } from '../lib/crashReport';
import { CopyButton } from './ui/CopyButton';

interface ErrorBoundaryProps {
  /** Names the area in the log, e.g. `root` or `tab:table_data`. */
  source: string;
  children: React.ReactNode;
  fallback: (props: CrashFallbackProps) => React.ReactNode;
}

export interface CrashFallbackProps {
  message: string;
  details: string;
  reset: () => void;
}

interface ErrorBoundaryState {
  error: unknown;
  componentStack: string | null;
  failed: boolean;
}

/**
 * React 19 unmounts the whole root on an uncaught render error, which leaves only the
 * body's dark background: the "black screen". Boundaries keep the failure local and visible.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: null, failed: false };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error, failed: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    reportCrash(this.props.source, error, info.componentStack);
  }

  reset = () => this.setState({ error: null, componentStack: null, failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback({
      message: crashMessage(this.state.error),
      details: crashDetails(this.state.error, this.state.componentStack),
      reset: this.reset,
    });
  }
}

export function PaneCrashFallback({ message, details, reset }: CrashFallbackProps) {
  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm select-text">
        <div className="flex items-center gap-2 font-medium text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          This view failed to render
        </div>
        <p className="mt-2 text-xs text-muted-foreground break-all">{message}</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="pressable flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border bg-card text-xs font-medium hover:bg-accent"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Try again
          </button>
          <CopyButton text={details} label="Copy details" />
        </div>
      </div>
    </div>
  );
}

export function AppCrashFallback({ message, details }: CrashFallbackProps) {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground p-8">
      <div className="max-w-xl w-full rounded-xl border border-border bg-card p-6 select-text">
        <div className="flex items-center gap-2 text-base font-semibold">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          Bizzi DB hit an unexpected error
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Your saved connections and queries are not affected. Reloading returns to the connection list.
        </p>
        <pre className="mt-4 max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap break-all">
          {message}
        </pre>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="pressable flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            Reload
          </button>
          <CopyButton text={details} label="Copy details" />
        </div>
      </div>
    </div>
  );
}
