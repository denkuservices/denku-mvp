import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/marketing/Container";
import { LocaleSwitcher } from "@/components/marketing/LocaleSwitcher";
import { DenkuLogo } from "@/components/brand/DenkuLogo";

const COLUMNS = [
  {
    heading: "services",
    links: [
      { key: "voiceReceptionist", href: "/services/ai-employees" },
      { key: "appointmentBooking", href: "/employees/booking-assistant" },
      { key: "leadQualification", href: "/employees/receptionist" },
      { key: "customerFollowUp", href: "/employees/missed-call-rescuer" },
      { key: "customAutomations", href: "/services/custom-ai" },
    ],
  },
  {
    heading: "product",
    links: [
      { key: "security", href: "/security" },
      { key: "docs", href: "/docs" },
      { key: "support", href: "/support" },
    ],
  },
  {
    heading: "company",
    links: [
      { key: "about", href: "/about" },
      { key: "contact", href: "/contact" },
      { key: "privacy", href: "/privacy" },
      { key: "terms", href: "/terms" },
    ],
  },
] as const;

export function Footer() {
  const t = useTranslations("footer");

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
                      {t(link.key)}
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
