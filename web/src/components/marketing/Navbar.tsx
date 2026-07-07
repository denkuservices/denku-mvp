"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container } from "@/components/marketing/Container";

const navLinks = [
  { label: "Why Denku", href: "/#why" },
  { label: "Services", href: "/use-cases" },
  { label: "Pricing", href: "/pricing" },
  { label: "Security", href: "/security" },
  { label: "Company", href: "/company" },
];

export function Navbar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setIsMobileMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  React.useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? "hidden" : "auto";
  }, [isMobileMenuOpen]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "border-b border-[#0A1A2F]/[0.06] bg-[#F7F5F1]/80 backdrop-blur-xl brand-shadow-sm"
          : "border-b border-transparent bg-[#F7F5F1]/60 backdrop-blur-md"
      )}
    >
      <Container>
        <div className="flex h-[68px] items-center justify-between">
          {/* Logo */}
          <Link href="/" className="font-display text-[26px] font-semibold tracking-tight text-[#0A1A2F]">
            den<span className="text-[#1B6E6E]">ku</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-9 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className={cn(
                  "group relative text-sm font-medium transition-colors hover:text-[#1B6E6E]",
                  pathname === link.href ? "text-[#1B6E6E]" : "text-[#2C3E54]"
                )}
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 right-0 h-px origin-left scale-x-0 bg-[#1B6E6E] transition-transform duration-200 group-hover:scale-x-100" />
              </Link>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden items-center gap-4 md:flex">
            <Link href="/login" className="text-sm font-medium text-[#2C3E54] transition-colors hover:text-[#1B6E6E]">
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-[#0A1A2F] px-5 py-2.5 text-sm font-medium text-[#F7F5F1] transition-all hover:-translate-y-0.5 hover:bg-[#1B6E6E] hover:brand-shadow-md"
            >
              Book a demo
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            className="flex items-center justify-center rounded-lg p-2 text-[#2C3E54] md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </Container>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 top-[68px] z-50 flex flex-col bg-[#F7F5F1]/97 backdrop-blur-xl md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div className="flex flex-col gap-1 px-6 py-8" onClick={(e) => e.stopPropagation()}>
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-xl px-4 py-3 text-base font-medium text-[#2C3E54] transition-colors hover:bg-[#0A1A2F]/[0.04] hover:text-[#1B6E6E]"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-6 flex flex-col gap-3">
              <Link
                href="/signup"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex h-12 items-center justify-center rounded-xl bg-[#0A1A2F] text-sm font-medium text-[#F7F5F1]"
              >
                Book a demo
              </Link>
              <Link
                href="/login"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex h-12 items-center justify-center rounded-xl border border-[#0A1A2F]/10 text-sm font-medium text-[#2C3E54]"
              >
                Log in
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
