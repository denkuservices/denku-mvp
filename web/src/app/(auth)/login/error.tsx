"use client";

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-2xl border p-6 bg-white">
      <h2 className="text-lg font-semibold">Login error</h2>
      <p className="mt-2 text-sm text-red-600">{error.message}</p>
      <button
        className="mt-4 rounded-md border px-3 py-2 text-sm"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
