import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches render errors so a single broken page does not blank the whole app.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-8 text-center">
          <div className="max-w-md space-y-4">
            <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
            <p className="text-sm text-white/50 leading-relaxed">
              This page hit an unexpected error. Reload the page or go back to your dashboard.
            </p>
            <div className="flex flex-wrap gap-3 justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10"
                onClick={() => window.location.reload()}
              >
                Reload page
              </Button>
              <Button asChild className="bg-red-900 hover:bg-red-800 text-white border border-red-800/50">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
