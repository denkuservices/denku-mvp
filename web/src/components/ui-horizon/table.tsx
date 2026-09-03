import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  children: React.ReactNode;
}

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode;
}

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
}

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
}

export interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode;
}

export interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode;
}

export interface TableCaptionProps extends React.HTMLAttributes<HTMLTableCaptionElement> {
  children: React.ReactNode;
}

export interface TableCardProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Table root adapter component.
 * Token-based table wrapper for semantic markup.
 */
export function TableRoot({ className, children, ...props }: TableProps) {
  return (
    <table
      className={cn("w-full min-w-full text-sm", className)}
      {...props}
    >
      {children}
    </table>
  );
}

/**
 * Table header section adapter.
 */
export function TableHeader({ className, children, ...props }: TableHeaderProps) {
  return (
    <thead
      className={cn("bg-gray-50/80 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-white/[0.03] dark:text-gray-400", className)}
      {...props}
    >
      {children}
    </thead>
  );
}

/**
 * Table body section adapter.
 */
export function TableBody({ className, children, ...props }: TableBodyProps) {
  return (
    <tbody className={className} {...props}>
      {children}
    </tbody>
  );
}

/**
 * Table row adapter.
 */
export function TableRow({ className, children, ...props }: TableRowProps) {
  return (
    <tr
      className={cn("border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50/70 dark:border-white/10 dark:hover:bg-white/[0.03]", className)}
      {...props}
    >
      {children}
    </tr>
  );
}

/**
 * Table header cell adapter.
 */
export function TableHead({ className, children, ...props }: TableHeadProps) {
  return (
    <th
      className={cn("px-5 py-3.5 font-semibold text-gray-500 dark:text-gray-400", className)}
      {...props}
    >
      {children}
    </th>
  );
}

/**
 * Table cell adapter.
 */
export function TableCell({ className, children, ...props }: TableCellProps) {
  return (
    <td
      className={cn("px-5 py-3.5 text-navy-700 dark:text-gray-200", className)}
      {...props}
    >
      {children}
    </td>
  );
}

/**
 * Table caption adapter.
 */
export function TableCaption({ className, children, ...props }: TableCaptionProps) {
  return (
    <caption
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    >
      {children}
    </caption>
  );
}

/**
 * Optional table card wrapper.
 * Wraps table in a Card adapter for rounded container styling.
 * Padding is controlled by consumer.
 */
export function TableCard({ children, className }: TableCardProps) {
  return (
    <Card className={cn("overflow-hidden p-0", className)}>
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}

