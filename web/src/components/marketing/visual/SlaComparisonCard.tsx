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
    <div className="rounded-2xl border border-[#CBD5E1] bg-white p-8">
      <div className="grid gap-8 md:grid-cols-3">
        {plans.map((plan, index) => (
          <div key={plan.name} className="text-center">
            <h3 className="text-lg font-bold text-[#0F172A] mb-2">
              {plan.name}
            </h3>
            <p className="text-xs text-[#64748B] mb-4">{plan.level}</p>
            
            {/* Visual bar */}
            <div className="relative h-2 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#2563EB] transition-all duration-500"
                style={{ width: `${barWidths[index]}%` }}
              />
            </div>
            
            <p className="mt-4 text-sm text-[#475569] leading-relaxed">
              {plan.description}
            </p>
          </div>
        ))}
      </div>
      
      {note && (
        <p className="mt-8 text-center text-xs text-[#64748B]">
          {note}
        </p>
      )}
    </div>
  );
}
