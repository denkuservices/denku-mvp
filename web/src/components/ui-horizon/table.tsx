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
      className={cn("min-w-full text-sm", className)}
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
      className={cn("text-left text-xs text-muted-foreground", className)}
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
      className={cn("border-b border-border", className)}
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
      className={cn("px-4 py-3 font-medium text-muted-foreground", className)}
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
      className={cn("px-4 py-3 text-foreground", className)}
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
    <Card className={cn("p-0", className)}>
      {children}
    </Card>
  );
}

