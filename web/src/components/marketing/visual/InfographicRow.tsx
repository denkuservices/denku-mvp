import { LucideIcon } from 'lucide-react';

interface InfographicRowProps {
  items: Array<{
    icon: LucideIcon;
    label: string;
    microcopy: string;
  }>;
}

export function InfographicRow({ items }: InfographicRowProps) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div key={index} className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--s-panel-2)]">
              <Icon className="h-5 w-5 text-[var(--s-accent)]" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-[var(--s-ink)] mb-1">
                {item.label}
              </h3>
              <p className="text-xs text-[var(--s-ink-faint)] leading-relaxed">
                {item.microcopy}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
