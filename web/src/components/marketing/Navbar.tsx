"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Container } from "@/components/marketing/Container";
import { LocaleSwitcher } from "@/components/marketing/LocaleSwitcher";
import { DenkuLogo } from "@/components/brand/DenkuLogo";
import { ExternalToLocale } from "@/components/marketing/ExternalToLocale";

const NAV = [
  { key: "services", href: "/services" },
  { key: "employees", href: "/employees" },
  { key: "industries", href: "/industries" },
  { key: "pricing", href: "/pricing" },
  { key: "company", href: "/company" },
] as const;

export function Navbar() {
  const t = useTranslations("nav");
  // Locale-aware: returns the path WITHOUT the locale prefix, so the active state
  // works identically on /pricing and /tr/pricing.
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
      if (window.innerWidth >= 1024) setIsMobileMenuOpen(false);
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
        // While the mobile menu is open the header must be OPAQUE. The menu panel
        // starts at top-[68px], so a translucent header left a see-through strip
        // with the page scrolling behind it.
        isMobileMenuOpen
          ? "border-b border-[var(--s-border-soft)] bg-[var(--s-bg)]"
          : scrolled
            ? "border-b border-[var(--s-border-soft)] bg-[var(--s-bg-glass-a)] backdrop-blur-xl brand-shadow-sm"
            : "border-b border-transparent bg-[var(--s-bg-glass-b)] backdrop-blur-md"
      )}
    >
      <Container>
        <div className="flex h-[68px] items-center justify-between gap-6">
          <Link
            href="/"
            aria-label={t("home")}
            className="shrink-0 text-[var(--s-ink)]"
          >
            <DenkuLogo size={25} variant="gradient" />
          </Link>

          <nav className="hidden items-center gap-8 lg:flex">
            {NAV.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className={cn(
                  "group relative text-sm font-medium transition-colors hover:text-[var(--s-accent)]",
                  pathname === link.href
                    ? "text-[var(--s-accent)]"
                    : "text-[var(--s-ink-soft)]"
                )}
              >
                {t(link.key)}
                <span className="absolute -bottom-1 left-0 right-0 h-px origin-left scale-x-0 bg-[var(--s-accent)] transition-transform duration-200 group-hover:scale-x-100" />
              </Link>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center gap-3 lg:flex">
            <LocaleSwitcher compact />
            <ExternalToLocale
              href="/login"
              className="whitespace-nowrap text-sm font-medium text-[var(--s-ink-soft)] transition-colors hover:text-[var(--s-accent)]"
            >
              {t("login")}
            </ExternalToLocale>
            <ExternalToLocale
              href="/signup"
              className="whitespace-nowrap rounded-lg bg-[var(--s-cta-bg)] px-5 py-2.5 text-sm font-medium text-[var(--s-cta-fg)] transition-all hover:-translate-y-0.5 hover:bg-[var(--s-cta-bg-hover)] hover:brand-shadow-md"
            >
              {t("bookDemo")}
            </ExternalToLocale>
          </div>

          <div className="flex items-center gap-1 lg:hidden">
            <LocaleSwitcher compact />
            <button
              className="flex items-center justify-center rounded-lg p-2 text-[var(--s-ink-soft)]"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={t("toggleMenu")}
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </Container>

      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 top-[68px] z-50 flex flex-col overflow-y-auto bg-[var(--s-bg-overlay)] lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div className="flex flex-col gap-1 px-6 py-8" onClick={(e) => e.stopPropagation()}>
            {NAV.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-xl px-4 py-3 text-base font-medium text-[var(--s-ink-soft)] transition-colors hover:bg-[var(--s-hover-bg)] hover:text-[var(--s-accent)]"
              >
                {t(link.key)}
              </Link>
            ))}
            <div className="mt-6 flex flex-col gap-3">
              <ExternalToLocale
                href="/signup"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex h-12 items-center justify-center rounded-xl bg-[var(--s-cta-bg)] text-sm font-medium text-[var(--s-cta-fg)]"
              >
                {t("bookDemo")}
              </ExternalToLocale>
              <ExternalToLocale
                href="/login"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex h-12 items-center justify-center rounded-xl border border-[var(--s-border)] text-sm font-medium text-[var(--s-ink-soft)]"
              >
                {t("login")}
              </ExternalToLocale>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
