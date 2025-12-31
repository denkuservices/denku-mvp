import React from "react";

interface Workload {
  current_load: string;
  requests_per_min: number;
  status: string;
}

export function WorkloadCard({ data }: { data: Workload }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">System Workload</h3>
        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
          {data.status}
        </span>
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Current Load</span>
          <span className="font-medium">{data.current_load}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Throughput</span>
          <span className="font-medium">{data.requests_per_min} req/min</span>
        </div>
        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-black w-[35%]" />
        </div>
      </div>
    </div>
  );
}