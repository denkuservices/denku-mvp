import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware Link / redirect / router. Marketing components import these
 * instead of `next/link` so an href written once resolves to `/pricing` in
 * English and `/tr/pricing` in Turkish without any call site knowing.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
