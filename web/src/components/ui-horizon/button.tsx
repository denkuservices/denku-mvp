import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type HorizonButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type HorizonButtonSize = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&>svg]:shrink-0";

const variants: Record<HorizonButtonVariant, string> = {
  primary:
    "bg-brand-500 text-white shadow-sm hover:-translate-y-0.5 hover:bg-brand-600 hover:shadow-md active:translate-y-0 active:bg-brand-700 motion-reduce:transform-none dark:bg-brand-400 dark:hover:bg-brand-300",
  secondary:
    "border border-gray-200 bg-white text-navy-700 shadow-sm hover:border-gray-300 hover:bg-gray-50 dark:border-white/10 dark:bg-navy-800 dark:text-white dark:hover:bg-white/5",
  ghost:
    "text-gray-600 hover:bg-gray-100 hover:text-navy-700 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white",
  danger:
    "border border-red-200 bg-white text-red-700 shadow-sm hover:bg-red-50 dark:border-red-500/25 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10",
};

const sizes: Record<HorizonButtonSize, string> = {
  sm: "min-h-9 px-3 py-2 text-xs [&>svg]:h-3.5 [&>svg]:w-3.5",
  md: "min-h-10 px-4 py-2 text-sm [&>svg]:h-4 [&>svg]:w-4",
};

/**
 * The button recipe as a class string, for elements this file does not own.
 *
 * Not a second way to make a button — the *same* `base`/`variants`/`sizes` maps the components
 * below compose, exposed for the `<button>`/`<a>` elements that already exist in forms with their
 * own submit semantics. Reaching for a component there would mean rewriting the element; reaching
 * for a copied class string is how a fourth button style is born. Three channel cards each carried
 * their own `rounded-lg bg-brand-500 px-4 py-2 …`, which is exactly that.
 *
 * New code should use `HorizonButton` / `HorizonLinkButton`; this is the migration path for old.
 */
export function horizonButtonClass(
  variant: HorizonButtonVariant = "secondary",
  size: HorizonButtonSize = "md",
  className?: string
): string {
  return cn(base, variants[variant], sizes[size], className);
}

export function HorizonButton({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: HorizonButtonVariant;
  size?: HorizonButtonSize;
}) {
  return <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

export function HorizonLinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  external = false,
  ...props
}: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  variant?: HorizonButtonVariant;
  size?: HorizonButtonSize;
  external?: boolean;
}) {
  const classes = cn(base, variants[variant], sizes[size], className);

  if (external) {
    return (
      <a href={href} className={classes} target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...props}>
      {children}
    </Link>
  );
}

export function HorizonAnchorButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: HorizonButtonVariant;
  size?: HorizonButtonSize;
}) {
  return (
    <a href={href} className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </a>
  );
}
