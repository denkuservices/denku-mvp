import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/marketing/Container";
import { LocaleSwitcher } from "@/components/marketing/LocaleSwitcher";
import { DenkuLogo } from "@/components/brand/DenkuLogo";

const COLUMNS = [
  {
    heading: "product",
    links: [
      { key: "voice", href: "/voice", ns: "nav" },
      { key: "chat", href: "/chat", ns: "nav" },
      { key: "studio", href: "/services/ai-studio", ns: "nav" },
      { key: "pricingLink", href: "/pricing", ns: "footer" },
    ],
  },
  {
    // The nav went channel-led; these keep their home here rather than disappearing.
    heading: "explore",
    links: [
      { key: "servicesLink", href: "/services", ns: "footer" },
      { key: "employeesLink", href: "/employees", ns: "footer" },
      { key: "industriesLink", href: "/industries", ns: "footer" },
      { key: "requestsLink", href: "/request", ns: "footer" },
    ],
  },
  {
    heading: "company",
    links: [
      { key: "about", href: "/about", ns: "footer" },
      { key: "security", href: "/security", ns: "footer" },
      { key: "docs", href: "/docs", ns: "footer" },
      { key: "support", href: "/support", ns: "footer" },
      { key: "privacy", href: "/privacy", ns: "footer" },
      { key: "terms", href: "/terms", ns: "footer" },
    ],
  },
] as const;

export function Footer() {
  const t = useTranslations("footer");
  const tn = useTranslations("nav");

  return (
    <footer className="border-t border-[var(--s-border)] bg-[var(--s-bg)]">
      <Container>
        <div className="grid gap-14 py-16 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <div className="text-[var(--s-ink)]">
              <DenkuLogo size={24} variant="gradient" />
            </div>
            <p className="mt-4 max-w-[270px] font-display text-[14px] italic leading-relaxed text-[var(--s-ink-soft)]">
              {t("tagline")}
            </p>
            <div className="mt-6">
              <LocaleSwitcher />
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h4 className="mb-[18px] font-brand-mono text-xs font-medium uppercase tracking-wider text-[var(--s-ink-faint)]">
                {t(col.heading)}
              </h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.key}>
                    <Link
                      href={link.href}
                      className="text-sm text-[var(--s-ink-soft)] transition-colors hover:text-[var(--s-accent)]"
                    >
                      {link.ns === "nav" ? tn(link.key) : t(link.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-[var(--s-border-soft)] py-7 md:flex-row">
          <p className="text-[13px] text-[var(--s-ink-faint)]">
            © {new Date().getFullYear()} Denku. {t("rights")}
          </p>
          <p className="flex items-center gap-2 font-brand-mono text-xs text-[var(--s-accent)]">
            <span className="h-[7px] w-[7px] rounded-full bg-[var(--s-accent)] pulse-dot" />
            {t("status")}
          </p>
        </div>
      </Container>
    </footer>
  );
}
