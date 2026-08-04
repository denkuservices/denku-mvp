import { Button } from "@/app/(app)/_components/ui/Button";

export default function FilterToolbar({
  q,
  outcome,
  since,
}: {
  q?: string;
  outcome?: string;
  since?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <form method="GET" className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-grow">
          <label htmlFor="search" className="block text-sm font-medium text-gray-700">
            Search
          </label>
          <input
            type="text"
            name="q"
            id="search"
            defaultValue={q}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm"
            placeholder="Search agent, outcome, etc."
          />
        </div>

        <div className="min-w-[150px]">
          <label htmlFor="outcome" className="block text-sm font-medium text-gray-700">
            Outcome
          </label>
          <select
            name="outcome"
            id="outcome"
            defaultValue={outcome}
            className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-black focus:outline-none focus:ring-black sm:text-sm"
          >
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="min-w-[150px]">
          <label htmlFor="since" className="block text-sm font-medium text-gray-700">
            Time range
          </label>
          <select
            name="since"
            id="since"
            defaultValue={since}
            className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-black focus:outline-none focus:ring-black sm:text-sm"
          >
            <option value="">Any time</option>
            <option value="1d">Last 24h</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>

        <div className="flex-shrink-0">
          <Button type="submit" className="w-full sm:w-auto">
            Filter
          </Button>
        </div>
      </form>
    </div>
  );
}
