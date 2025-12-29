import * as React from "react";

import { cn } from "@/lib/utils";

const Section = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("py-12 sm:py-16 lg:py-20", className)}
    {...props}
  />
));
Section.displayName = "Section";

export { Section };
