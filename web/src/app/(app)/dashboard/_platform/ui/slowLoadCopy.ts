/**
 * The schedule behind `SlowLoadNotice` — kept separate so it is testable without a DOM.
 *
 * A page that arrives quickly should say nothing at all: a spinner that flashes for a fifth of a
 * second is worse than no spinner, because the flicker is what reads as instability. Past two
 * seconds the opposite is true — silence reads as a broken app, and people start clicking again.
 *
 * The messages therefore begin at two seconds and then change, so the reader can see that
 * something is still happening. What they must never do is invent progress: this code has no idea
 * how far along a query is, so there is no percentage, no "almost done", and the last message is
 * terminal — once the wait is genuinely unusual it says so and stops, rather than cycling
 * reassurances at somebody who has been waiting fifteen seconds.
 */

/** How long a page may take before the reader is told anything at all. */
export const SLOW_LOAD_QUIET_MS = 2000;

/** How long each message holds before the next one. */
export const SLOW_LOAD_STEP_MS = 2600;

/** In order. English source copy; localised through the dashboard dictionary. */
export const SLOW_LOAD_MESSAGES = [
  "Loading your workspace…",
  "Fetching your latest data…",
  "Still working on it…",
  "This is taking longer than usual — thanks for your patience.",
] as const;

/**
 * Which message belongs on screen after `elapsedMs`, or null while the page is still fast enough
 * to say nothing. Pure — this is the whole behaviour of the notice, minus the timers.
 */
export function slowLoadMessageAt(elapsedMs: number): string | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < SLOW_LOAD_QUIET_MS) return null;

  const step = Math.floor((elapsedMs - SLOW_LOAD_QUIET_MS) / SLOW_LOAD_STEP_MS);
  return SLOW_LOAD_MESSAGES[Math.min(step, SLOW_LOAD_MESSAGES.length - 1)];
}

/**
 * When the notice should next re-render, given how long it has been waiting — or null once the
 * terminal message is showing and nothing further will change.
 *
 * Returning the next boundary rather than polling on an interval means a wait of any length costs
 * exactly one render per message, which matters because this component is mounted during the one
 * moment the browser is already busy.
 */
export function slowLoadNextChangeMs(elapsedMs: number): number | null {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  if (elapsed < SLOW_LOAD_QUIET_MS) return SLOW_LOAD_QUIET_MS - elapsed;

  const step = Math.floor((elapsed - SLOW_LOAD_QUIET_MS) / SLOW_LOAD_STEP_MS);
  if (step >= SLOW_LOAD_MESSAGES.length - 1) return null;

  return SLOW_LOAD_QUIET_MS + (step + 1) * SLOW_LOAD_STEP_MS - elapsed;
}
