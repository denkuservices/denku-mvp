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


  const handleProductClick = (e: React.MouseEvent) => {
    if (pathname === '/') {
      e.preventDefault();
      const element = document.querySelector('#product');
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#CBD5E1] bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/60">
      <Container>
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <span className="font-bold text-[#0F172A]">{siteConfig.name}</span>
          </Link>
          <div className="hidden md:flex md:items-center md:space-x-6">
            <nav className="flex items-center space-x-6 text-sm font-medium">
              {pathname === "/" ? (
                <a
                  href="#product"
                  onClick={handleProductClick}
                  className="transition-colors hover:text-[#2563EB] cursor-pointer text-[#0F172A]"
                >
                  Product
                </a>
              ) : (
                <Link
                  href="/#product"
                  className="transition-colors hover:text-[#2563EB] cursor-pointer text-[#475569]"
                >
                  Product
                </Link>
              )}
              <Link
                href="/pricing"
                className={cn(
                  "transition-colors hover:text-[#2563EB] cursor-pointer",
                  pathname === "/pricing" ? "text-[#0F172A]" : "text-[#475569]"
                )}
              >
                Pricing
              </Link>
              <Link
                href="/security"
                className={cn(
                  "transition-colors hover:text-[#2563EB] cursor-pointer",
                  pathname === "/security" ? "text-[#0F172A]" : "text-[#475569]"
                )}
              >
                Security
              </Link>
              <Link
                href="/docs"
                className={cn(
                  "transition-colors hover:text-[#2563EB] cursor-pointer",
                  pathname === "/docs" ? "text-[#0F172A]" : "text-[#475569]"
                )}
              >
                Docs
              </Link>
              <Link
                href="/company"
                className={cn(
                  "transition-colors hover:text-[#2563EB] cursor-pointer",
                  pathname === "/company" ? "text-[#0F172A]" : "text-[#475569]"
                )}
              >
                Company
              </Link>
              <Link
                href="/support"
                className={cn(
                  "transition-colors hover:text-[#2563EB] cursor-pointer",
                  pathname === "/support" ? "text-[#0F172A]" : "text-[#475569]"
                )}
              >
                Support
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
                  href="/#product"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex w-full items-center rounded-md p-2 text-sm font-medium hover:underline cursor-pointer"
                >
                  Product
                </Link>
                <Link
                  href="/pricing"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex w-full items-center rounded-md p-2 text-sm font-medium hover:underline cursor-pointer"
                >
                  Pricing
                </Link>
                <Link
                  href="/security"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex w-full items-center rounded-md p-2 text-sm font-medium hover:underline cursor-pointer"
                >
                  Security
                </Link>
                <Link
                  href="/docs"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex w-full items-center rounded-md p-2 text-sm font-medium hover:underline cursor-pointer"
                >
                  Docs
                </Link>
                <Link
                  href="/company"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex w-full items-center rounded-md p-2 text-sm font-medium hover:underline cursor-pointer"
                >
                  Company
                </Link>
                <Link
                  href="/support"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex w-full items-center rounded-md p-2 text-sm font-medium hover:underline cursor-pointer"
                >
                  Support
                </Link>
              </nav>
              <div className="grid gap-4">
                <Button asChild>
                  <Link href="/pricing">Get started</Link>
                </Button>
                <Button variant="secondary" asChild>
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
