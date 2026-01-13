/**
 * Lightweight observability logger for canonical event tracking.
 * 
 * Emits single-line JSON logs with standardized format:
 * { tag, ts, ...payload }
 * 
 * Never throws - all errors are silently caught to ensure logging never breaks the pipeline.
 */

export function logEvent(tag: string, payload: Record<string, any>): void {
  try {
    const logLine = {
      tag,
      ts: new Date().toISOString(),
      ...payload,
    };
    console.info(JSON.stringify(logLine));
  } catch (err) {
    // Never throw from logging - silently fail
    // This ensures logging never breaks the application flow
  }
}
