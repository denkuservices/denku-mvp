import React from "react";
import { CheckCircle2, Circle } from "lucide-react";

interface Step {
  label: string;
  done: boolean;
}

export function GoLiveReadinessCard({ score, steps }: { score: number; steps: Step[] }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Go-Live Readiness</h3>
        <span className="text-sm font-bold">{score}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 mb-6">
        <div
          className="bg-black h-2 rounded-full transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            {step.done ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <Circle className="h-4 w-4 text-gray-300" />
            )}
            <span className={step.done ? "text-gray-900" : "text-muted-foreground"}>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}