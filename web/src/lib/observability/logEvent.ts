import "server-only";

/**
 * Structured logging schema for production observability.
 * All logs must be JSON single-line for Vercel.
 */
export type LogEvent = {
  tag: string; // e.g. "[CALL_START]" "[TOOL][CREATE_TICKET][UPSERT_OK]"
  ts: number; // Date.now()
  stage: "CALL" | "INTENT" | "TOOL" | "FALLBACK" | "ABUSE" | "GUARDRAIL" | "COST";
  source: "vapi_webhook" | "webcall_event" | "tool_create_ticket" | "tool_create_appointment" | "system";
  org_id?: string | null;
  call_id?: string | null;
  vapi_call_id?: string | null;
  severity?: "debug" | "info" | "warn" | "error"; // default "info"
  details?: Record<string, any>; // always an object, never huge raw payload dumps
};

/**
 * Truncate string values in an object to max length.
 * Recursively processes nested objects.
 */
function truncateStrings(obj: any, maxLength: number = 500): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return obj.length > maxLength ? obj.substring(0, maxLength) + '...' : obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => truncateStrings(item, maxLength));
  }
  
  if (typeof obj === 'object') {
    const truncated: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      truncated[key] = truncateStrings(value, maxLength);
    }
    return truncated;
  }
  
  return obj;
}

/**
 * Remove undefined values from object (for clean JSON.stringify).
 */
function removeUndefined(obj: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        cleaned[key] = removeUndefined(value);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned;
}

/**
 * Structured logger for production observability.
 * Never throws; always succeeds even if JSON.stringify fails.
 * 
 * @param event - Log event with required fields
 */
export function logEvent(event: LogEvent): void {
  try {
    // Ensure required fields
    const logData: Record<string, any> = {
      tag: event.tag,
      ts: event.ts ?? Date.now(),
      stage: event.stage,
      source: event.source,
      severity: event.severity ?? "info",
    };

    // Add optional fields if present
    if (event.org_id !== undefined) logData.org_id = event.org_id;
    if (event.call_id !== undefined) logData.call_id = event.call_id;
    if (event.vapi_call_id !== undefined) logData.vapi_call_id = event.vapi_call_id;

    // Process details: truncate strings, remove undefined
    if (event.details && typeof event.details === 'object') {
      const truncatedDetails = truncateStrings(event.details, 500);
      logData.details = removeUndefined(truncatedDetails);
    }

    // Remove undefined from top level
    const cleaned = removeUndefined(logData);

    // Stringify and log
    const logLine = JSON.stringify(cleaned);
    console.info(logLine);
  } catch (err) {
    // Never throw from logger - fall back to minimal log
    try {
      console.info(JSON.stringify({
        tag: "[LOG_ERROR]",
        ts: Date.now(),
        stage: "system",
        source: "system",
        severity: "error",
        details: {
          original_tag: event.tag,
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    } catch (fallbackErr) {
      // Last resort: plain console
      console.info("[LOG_ERROR] Failed to log event:", event.tag, err);
    }
  }
}
