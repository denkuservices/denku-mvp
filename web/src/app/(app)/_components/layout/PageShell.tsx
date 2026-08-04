import * as React from "react";

export default function PageShell({
  children,
  className = "",
  maxWidth = "max-w-7xl",
}: {
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
}) {
  return (
    <div className={`mx-auto ${maxWidth} px-4 py-6 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}
