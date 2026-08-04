import * as React from "react";

export default function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center text-xs px-2 py-1 rounded-full font-medium ${className}`}>
      {children}
    </span>
  );
}
