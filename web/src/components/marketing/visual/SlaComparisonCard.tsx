interface SlaComparisonCardProps {
  plans: Array<{
    name: string;
    level: string;
    description: string;
  }>;
  note?: string;
}

export function SlaComparisonCard({ plans, note }: SlaComparisonCardProps) {
  // Deterministic bar widths (percentage)
  const barWidths = [40, 70, 100]; // Starter, Pro, Enterprise

  return (
    <div className="rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel)] p-8">
      <div className="grid gap-8 md:grid-cols-3">
        {plans.map((plan, index) => (
          <div key={plan.name} className="text-center">
            <h3 className="text-lg font-bold text-[var(--s-ink)] mb-2">
              {plan.name}
            </h3>
            <p className="text-xs text-[var(--s-ink-faint)] mb-4">{plan.level}</p>
            
            {/* Visual bar */}
            <div className="relative h-2 w-full rounded-full bg-[var(--s-panel-2)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--s-accent)] transition-all duration-500"
                style={{ width: `${barWidths[index]}%` }}
              />
            </div>
            
            <p className="mt-4 text-sm text-[var(--s-ink-soft)] leading-relaxed">
              {plan.description}
            </p>
          </div>
        ))}
      </div>
      
      {note && (
        <p className="mt-8 text-center text-xs text-[var(--s-ink-faint)]">
          {note}
        </p>
      )}
    </div>
  );
}
