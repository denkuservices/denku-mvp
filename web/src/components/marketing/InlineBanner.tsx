import { CheckCircle, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InlineBannerProps {
  type: 'success' | 'error';
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export function InlineBanner({ type, message, onDismiss, className }: InlineBannerProps) {
  const isSuccess = type === 'success';

  return (
    <div
      role="alert"
      tabIndex={-1}
      className={cn(
        'flex items-start gap-3 rounded-xl border p-4 focus:outline-none focus:ring-2 focus:ring-offset-2',
        isSuccess
          ? 'border-green-200 bg-green-50/50 focus:ring-green-500'
          : 'border-red-200 bg-red-50/50 focus:ring-red-500',
        className
      )}
    >
      <div className="flex-shrink-0 mt-0.5">
        {isSuccess ? (
          <CheckCircle className="h-5 w-5 text-green-600" />
        ) : (
          <AlertCircle className="h-5 w-5 text-red-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm font-medium leading-relaxed',
            isSuccess ? 'text-green-800' : 'text-red-800'
          )}
        >
          {message}
        </p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 rounded-md p-1 hover:bg-black/5 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4 text-[#64748B]" />
        </button>
      )}
    </div>
  );
}
