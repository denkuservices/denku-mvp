"use client";

import React from "react";
import { Info } from "lucide-react";
import Card from "@/components/ui-horizon/card";

type WidgetProps = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle: React.ReactNode;
  className?: string;
  /** Optional methodology/explanation shown as a hover tooltip next to the title. */
  info?: string;
};

function safeText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  // For React elements, extract text content
  if (React.isValidElement(v)) {
    // Try to get text from children
    const children = (v.props as any)?.children;
    if (typeof children === "string") return children;
    return "";
  }
  // plain object gelirse [object Object] yerine stabil bir string üret
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export default function Widget(props: WidgetProps) {
  const { icon, title, subtitle, info } = props;

  return (
    <Card extra="!flex-row flex-grow items-center rounded-[20px] h-[90px]">
      {/* Left icon area */}
      <div className="ml-[18px] flex h-[90px] w-auto flex-row items-center flex-shrink-0">
        <div className="rounded-full bg-lightPrimary p-3 dark:bg-navy-700">
          <span className="flex items-center text-brand-500 dark:text-white [&>svg]:h-7 [&>svg]:w-7">
            {icon ?? null}
          </span>
        </div>
      </div>

      {/* Text area */}
      <div className="h-[90px] ml-4 flex w-auto flex-col justify-center overflow-hidden">
        <p className="font-dm text-sm font-medium text-gray-600 dark:text-gray-300 leading-tight flex items-center gap-1">
          {safeText(title)}
          {info ? (
            <span
              tabIndex={0}
              title={info}
              aria-label={info}
              className="inline-flex cursor-help text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </p>
        <h4 className="text-xl font-bold text-navy-700 dark:text-white leading-tight">
          {safeText(subtitle)}
        </h4>
      </div>
    </Card>
  );
}
