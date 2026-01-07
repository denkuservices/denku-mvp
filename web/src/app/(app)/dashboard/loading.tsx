export default function DashboardLoading() {
  return (
    <div className="space-y-6 pb-10 animate-pulse">
      {/* Header skeleton */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-4 w-64 bg-gray-200 rounded" />
        </div>
        <div className="h-8 w-32 bg-gray-200 rounded-full" />
      </div>

      {/* Hero card skeleton */}
      <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-10">
        <div className="h-6 w-40 bg-gray-200 rounded mb-3" />
        <div className="h-12 w-32 bg-gray-200 rounded mb-3" />
        <div className="h-4 w-64 bg-gray-200 rounded" />
      </div>

      {/* System health cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl border bg-white p-5">
            <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
            <div className="h-8 w-16 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      {/* Recent activity skeleton */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-white p-5">
          <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-2 w-2 rounded-full bg-gray-200 mt-2" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-full bg-gray-200 rounded" />
                  <div className="h-3 w-24 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-1 rounded-xl border bg-white p-5">
          <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-4 w-full bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>

      {/* Go-live readiness skeleton */}
      <div className="rounded-xl border bg-white p-5">
        <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
        <div className="h-2 w-full bg-gray-200 rounded mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-4 bg-gray-200 rounded-full" />
              <div className="h-4 w-32 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

