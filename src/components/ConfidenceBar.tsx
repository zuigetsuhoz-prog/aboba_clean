interface Props {
  value: number; // 0–100
  className?: string;
}

export function ConfidenceBar({ value, className = '' }: Props) {
  const color =
    value <= 30 ? 'bg-red-500' : value <= 60 ? 'bg-orange-400' : 'bg-green-500';

  return (
    <div className={`w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-300 ${color}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
