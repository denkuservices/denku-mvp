import Link from "next/link";
import { Container } from "@/components/marketing/Container";

const footerCols = {
  Services: [
    { label: "Voice Receptionist", href: "/use-cases" },
    { label: "Appointment Booking", href: "/use-cases" },
    { label: "Lead Qualification", href: "/use-cases" },
    { label: "Customer Follow-Up", href: "/use-cases" },
    { label: "Custom Automations", href: "/use-cases" },
  ],
  Product: [
    { label: "Pricing", href: "/pricing" },
    { label: "Security", href: "/security" },
    { label: "Docs", href: "/docs" },
    { label: "Support", href: "/support" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Company", href: "/company" },
    { label: "Contact", href: "/contact" },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-[#0A1A2F]/10 bg-[#F7F5F1]">
      <Container>
        <div className="grid gap-14 py-16 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div>
            <div className="font-display text-[24px] font-semibold tracking-tight text-[#0A1A2F]">
              den<span className="text-[#1B6E6E]">ku</span>
            </div>
            <p className="mt-4 max-w-[270px] font-display text-[14px] italic leading-relaxed text-[#2C3E54]">
              &ldquo;We don&apos;t tell businesses what AI can do. We let them experience it in seconds.&rdquo;
            </p>
          </div>

          {Object.entries(footerCols).map(([category, links]) => (
            <div key={category}>
              <h4 className="mb-[18px] font-brand-mono text-xs font-medium uppercase tracking-wider text-[#6B7888]">
                {category}
              </h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-[#2C3E54] transition-colors hover:text-[#1B6E6E]">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-[#0A1A2F]/[0.06] py-7 md:flex-row">
          <p className="text-[13px] text-[#6B7888]">© {new Date().getFullYear()} Denku. All rights reserved.</p>
          <p className="flex items-center gap-2 font-brand-mono text-xs text-[#1B6E6E]">
            <span className="h-[7px] w-[7px] rounded-full bg-[#1B6E6E] pulse-dot" />
            DENKU · ONLINE · READY TO TALK
          </p>
        </div>
      </Container>
    </footer>
  );
}
