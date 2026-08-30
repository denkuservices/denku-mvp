import { cn } from '@/lib/utils';

interface PanelMockProps {
  children: React.ReactNode;
  className?: string;
}

export function PanelMock({ children, className }: PanelMockProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel)] shadow-shadow-100 p-6',
        className
      )}
    >
      {children}
    </div>
  );
}
