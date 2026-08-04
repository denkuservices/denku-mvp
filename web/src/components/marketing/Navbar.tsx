"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import { Button } from "@/components/marketing/Button";
import { Container } from "@/components/marketing/Container";

export function Navbar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  React.useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
  }, [isMobileMenuOpen]);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background">
      <Container>
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <span className="font-bold">{siteConfig.name}</span>
          </Link>
          <div className="hidden md:flex md:items-center md:space-x-6">
            <nav className="flex items-center space-x-1 text-sm font-medium">
              <Link
                href="/about"
                className={cn(
                  "rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  pathname === "/about"
                    ? "bg-muted text-foreground"
                    : "text-foreground/60 hover:bg-muted/50 hover:text-foreground"
                )}
              >
                About
              </Link>
              <Link
                href="/use-cases"
                className={cn(
                  "rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  pathname?.startsWith("/use-cases")
                    ? "bg-muted text-foreground"
                    : "text-foreground/60 hover:bg-muted/50 hover:text-foreground"
                )}
              >
                Use Cases
              </Link>
              <Link
                href="/pricing"
                className={cn(
                  "rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  pathname?.startsWith("/pricing")
                    ? "bg-muted text-foreground"
                    : "text-foreground/60 hover:bg-muted/50 hover:text-foreground"
                )}
              >
                Pricing
              </Link>
              <Link
                href="/contact"
                className={cn(
                  "rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  pathname?.startsWith("/contact")
                    ? "bg-muted text-foreground"
                    : "text-foreground/60 hover:bg-muted/50 hover:text-foreground"
                )}
              >
                Contact
              </Link>
            </nav>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link href="/pricing">Get started</Link>
              </Button>
            </div>
          </div>
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X /> : <Menu />}
              <span className="sr-only">Toggle menu</span>
            </Button>
          </div>
        </div>
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 top-16 z-50 grid h-[calc(100vh-4rem)] grid-flow-row auto-rows-max overflow-auto p-6 pb-32 shadow-md animate-in slide-in-from-bottom-80 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <div className="relative z-20 grid gap-6 rounded-md bg-popover p-4 text-popover-foreground shadow-md">
              <nav className="grid grid-flow-row auto-rows-max text-sm">
                <Link
                  href="/about"
                  className="flex w-full items-center rounded-md p-2 text-sm font-medium hover:underline"
                >
                  About
                </Link>
                <Link
                  href="/use-cases"
                  className="flex w-full items-center rounded-md p-2 text-sm font-medium hover:underline"
                >
                  Use Cases
                </Link>
                <Link
                  href="/pricing"
                  className="flex w-full items-center rounded-md p-2 text-sm font-medium hover:underline"
                >
                  Pricing
                </Link>
                <Link
                  href="/contact"
                  className="flex w-full items-center rounded-md p-2 text-sm font-medium hover:underline"
                >
                  Contact
                </Link>
              </nav>
              <div className="grid gap-4">
                <Button asChild>
                  <Link href="/pricing">Get started</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/login">Log in</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </Container>
    </header>
  );
}
