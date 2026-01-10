'use client';

import { cn } from '@/lib/utils';

interface StatusChipProps {
  label: string;
  variant?: 'success' | 'warning' | 'info';
  pulse?: boolean;
}

export function StatusChip({ label, variant = 'success', pulse = false }: StatusChipProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-medium text-[#475569]">
      <div
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          variant === 'success' && 'bg-green-500',
          variant === 'warning' && 'bg-yellow-500',
          variant === 'info' && 'bg-[#2563EB]',
          pulse && 'animate-pulse'
        )}
      />
      <span>{label}</span>
    </div>
  );
}
