import { type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={
        <div className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="max-w-md text-muted-foreground">
            An unexpected error occurred. Please reload the page or return home.
          </p>
          <Button onClick={() => (window.location.href = "/")}>Go home</Button>
        </div>
      }
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
