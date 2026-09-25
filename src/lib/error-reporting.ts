/**
 * Application Error Reporting Utility
 * Provides structured telemetry and diagnostics for uncaught client-side and boundary errors.
 */

export interface ErrorReportContext extends Record<string, unknown> {
  boundary?: string;
  source?: string;
  route?: string;
}

export function reportApplicationError(error: unknown, context: ErrorReportContext = {}): void {
  if (typeof window === "undefined") {
    console.error("[SSR Error]", error, context);
    return;
  }

  const message =
    error instanceof Response
      ? `HTTP Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);

  const stack = error instanceof Error ? error.stack : undefined;
  const payload = {
    message,
    stack,
    route: window.location.pathname,
    timestamp: new Date().toISOString(),
    ...context,
  };

  // Structured client logging
  if (process.env["NODE_ENV"] === "development") {
    console.warn("[App Error Report]", payload);
  } else {
    console.error("[App Error Report]", payload);
  }
}
