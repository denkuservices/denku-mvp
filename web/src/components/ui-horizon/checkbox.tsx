import * as React from "react";

/**
 * Horizon Checkbox component
 * Based on Horizon components/checkbox/index.tsx
 * Props: id?, extra?, color?: 'blue' | 'green' | 'red' | 'orange' | 'purple', [x: string]: any
 */
function Checkbox(props: {
  id?: string;
  extra?: string;
  color?: 'blue' | 'green' | 'red' | 'orange' | 'purple';
  [x: string]: any;
}) {
  const { id, extra, color, ...rest } = props;
  
  // Default checkbox classes from Horizon
  const defaultCheckbox = 'h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-navy-700 dark:bg-navy-800 dark:checked:bg-brand-500';
  
  // Color variant classes mapping (Tailwind requires full class names)
  const colorClassMap: Record<string, string> = {
    blue: 'checked:bg-blue-500 checked:border-blue-500',
    green: 'checked:bg-green-500 checked:border-green-500',
    red: 'checked:bg-red-500 checked:border-red-500',
    orange: 'checked:bg-orange-500 checked:border-orange-500',
    purple: 'checked:bg-purple-500 checked:border-purple-500',
  };
  
  const colorClasses = color ? colorClassMap[color] || '' : '';
  
  return (
    <input
      type="checkbox"
      id={id}
      className={`${defaultCheckbox} ${colorClasses} ${extra || ''}`}
      {...rest}
    />
  );
}

export default Checkbox;
export { Checkbox };
