"use client";

/**
 * Minimal error boundary - NO IMPORTS (except React types)
 * Temporarily sterile for debugging route hang issues.
 */
export default function PhoneLinesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: 24 }}>
      <h2>Phone Lines error boundary</h2>
      <p>{error.message || "An error occurred"}</p>
      {error.digest && <p style={{ fontSize: 12, fontFamily: "monospace" }}>Error ID: {error.digest}</p>}
      <button
        onClick={reset}
        style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}
      >
        Try again
      </button>
    </div>
  );
}
