import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format USD currency value from calls.cost_usd.
 * 
 * Rules:
 * - Accept number | string | null | undefined
 * - Parse safely: if string, convert via Number(value)
 * - If NaN or negative → treat as 0
 * - Format using Intl.NumberFormat with 2 decimal places
 * - cost_usd is already USD, do NOT multiply/divide
 * 
 * Examples:
 * - 0.0188 → "$0.02" (normal currency rounding)
 * - null/undefined → "$0.00"
 * - "0.05" → "$0.05"
 */
export function formatUsd(value: unknown): string {
  // Handle null/undefined
  if (value === null || value === undefined || value === "") {
    return "$0.00";
  }

  // Convert to number
  const num: number = typeof value === "string" ? Number(value) : typeof value === "number" ? value : 0;

  // If NaN or negative, treat as 0
  if (!Number.isFinite(num) || num < 0) {
    return "$0.00";
  }

  // Format using Intl.NumberFormat
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}
