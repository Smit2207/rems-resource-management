export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-lg font-medium text-primary-text mb-2">{title}</p>
      {description && <p className="text-secondary-text mb-6 max-w-xs">{description}</p>}
      {action}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center text-secondary-text">
      Loading...
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-lg font-medium text-rose-700 mb-2">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-primary">
          Try again
        </button>
      )}
    </div>
  );
}

export function FormField({
  label,
  children,
  error,
  helper,
}: {
  label?: string;
  children: React.ReactNode;
  error?: string;
  helper?: string;
}) {
  return (
    <div className="mb-4">
      {label && <label className="label">{label}</label>}
      {children}
      {error && <p className="mt-1 text-sm text-rose-600">{error}</p>}
      {helper && !error && <p className="help">{helper}</p>}
    </div>
  );
}
