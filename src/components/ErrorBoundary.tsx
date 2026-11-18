import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/monitoring";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence: a render error anywhere below shows a recoverable
 * screen instead of a blank page (or a frozen native app).
 *
 * A failed lazy-route import usually means a new deploy removed the old
 * chunk, so for that case we reload once to pick up the fresh build.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (isChunkLoadError(error) && reloadOnce()) return;
    reportError(error, { componentStack: info.componentStack ?? undefined });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleHome = () => {
    window.location.assign("/");
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        className="flex min-h-screen items-center justify-center bg-background px-4 pt-safe pb-safe"
      >
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error stopped this page from loading. Your data is
            safe. Try reloading; if it keeps happening, contact support.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={this.handleReload}>Reload</Button>
            <Button variant="outline" onClick={this.handleHome}>
              Go to home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

const RELOAD_KEY = "illuxus-vendor.chunk-reload";

function isChunkLoadError(error: Error): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(
    `${error.name} ${error.message}`,
  );
}

/** Returns true if a reload was triggered (at most once per minute). */
function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
