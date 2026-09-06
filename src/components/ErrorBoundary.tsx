import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  // P3: bumped on "Try Again" so children remount instead of resuming.
  attempt: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, attempt: 0 };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, attempt: 0 };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <section className="card mx-auto mt-8 max-w-lg px-6 py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-error/15">
            <svg className="h-6 w-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="mt-4 text-base font-semibold text-text">Something went wrong</h2>
          <p className="mt-2 text-xs text-text-muted">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={() =>
              this.setState((s) => ({
                hasError: false,
                error: null,
                attempt: s.attempt + 1,
              }))
            }
            className="btn btn-ghost mx-auto mt-5"
          >
            Try Again
          </button>
        </section>
      );
    }

    // P3: the key remounts the subtree on "Try Again" — simply clearing
    // hasError handed the same broken component instance its old state back
    // and it re-crashed immediately.
    return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
