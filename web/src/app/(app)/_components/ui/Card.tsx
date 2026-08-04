import * as React from "react";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`rounded-xl border bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function CardHeader({
  title,
  right,
  className = "",
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      <h3 className="font-semibold">{title}</h3>
      {right ? right : null}
    </div>
  );
}
