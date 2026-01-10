import { cn } from '@/lib/utils';

interface PanelMockProps {
  children: React.ReactNode;
  className?: string;
}

export function PanelMock({ children, className }: PanelMockProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[#CBD5E1] bg-white shadow-shadow-100 p-6',
        className
      )}
    >
      {children}
    </div>
  );
}
