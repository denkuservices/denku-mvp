'use client';

import { cn } from '@/lib/utils';

interface StatusChipProps {
  label: string;
  variant?: 'success' | 'warning' | 'info';
  pulse?: boolean;
}

export function StatusChip({ label, variant = 'success', pulse = false }: StatusChipProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--s-border)] bg-[var(--s-panel)] px-3 py-1.5 text-xs font-medium text-[var(--s-ink-soft)]">
      <div
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          variant === 'success' && 'bg-green-500',
          variant === 'warning' && 'bg-yellow-500',
          variant === 'info' && 'bg-[var(--s-accent)]',
          pulse && 'animate-pulse'
        )}
      />
      <span>{label}</span>
    </div>
  );
}
