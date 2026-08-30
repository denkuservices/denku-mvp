'use client';

import { SITE_NAME } from '@/config/site';
import { Container } from './Container';
import { getSupportEmail } from '@/lib/support';

const inputClass = 'h-11 w-full rounded-[10px] border border-[var(--s-border)] bg-[var(--s-panel)] px-3 text-sm text-[var(--s-ink)] outline-none placeholder:text-[var(--s-ink-faint)] transition-colors focus:border-[var(--s-accent)] focus:ring-2 focus:ring-[var(--s-accent-ring)]';

export function ContactPage() {
  // R-047: submit reaches the team for real via the user's mail client — no silent no-op.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') || '');
    const company = String(fd.get('company') || '');
    const channel = String(fd.get('channel') || '');
    const message = String(fd.get('message') || '');
    const body =
      `From: ${email}\nCompany: ${company}\nPrimary channel: ${channel}\n\n${message}`;
    window.location.href =
      `mailto:${getSupportEmail()}?subject=${encodeURIComponent('Denku demo request')}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="py-16 md:py-20">
      <Container>
        <div className="grid gap-10 md:grid-cols-2 md:items-start">
          {/* Left */}
          <div>
            <div className="brand-eyebrow mb-5">Contact</div>
            <h1 className="font-display text-[clamp(36px,4.5vw,56px)] font-normal tracking-[-1.5px] text-[var(--s-ink)]">Contact</h1>
            <p className="mt-4 text-[17px] leading-relaxed text-[var(--s-ink-soft)]">
              Tell us your industry, channels, and what you want the agent to handle. We&apos;ll propose a workflow and a deployment plan.
            </p>

            <div className="mt-8 grid gap-4">
              <div className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-6">
                <div className="mb-3 font-display text-[15px] font-medium text-[var(--s-ink)]">Typical outcomes</div>
                <ul className="space-y-2">
                  {[
                    'Lower support volume and faster response times',
                    'Higher conversion on inbound calls and chats',
                    'Structured data capture into your CRM or systems',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-[var(--s-ink-soft)]">
                      <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--s-accent)]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-6">
                <div className="mb-2 font-display text-[15px] font-medium text-[var(--s-ink)]">What to include</div>
                <p className="text-sm text-[var(--s-ink-soft)]">
                  Your website, your primary channel (phone/web), languages, and 2–3 top tasks you want automated.
                </p>
              </div>
            </div>
          </div>

          {/* Right: form */}
          <div className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel)] p-6 brand-shadow-sm md:p-8">
            <div className="font-display text-[20px] font-medium text-[var(--s-ink)]">Request a demo</div>
            <p className="mt-1 text-sm text-[var(--s-ink-faint)]">Submitting opens an email to our team at {getSupportEmail()}.</p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--s-ink)]">Work email</label>
                <input name="email" type="email" required placeholder="you@company.com" className={inputClass} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--s-ink)]">Company</label>
                  <input name="company" type="text" placeholder="Company name" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--s-ink)]">Website</label>
                  <input name="website" type="url" placeholder="https://example.com" className={inputClass} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--s-ink)]">Primary channel</label>
                  <select name="channel" className={`${inputClass} cursor-pointer`}>
                    <option>Voice (phone)</option>
                    <option>Chat (website)</option>
                    <option>Both</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--s-ink)]">Language</label>
                  <select className={`${inputClass} cursor-pointer`}>
                    <option>English</option>
                    <option>Spanish</option>
                    <option>Turkish</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--s-ink)]">What should the agent handle?</label>
                <textarea
                  name="message"
                  rows={5}
                  placeholder="Example: Appointment booking, order status, FAQs, lead qualification..."
                  className="w-full resize-vertical rounded-[10px] border border-[var(--s-border)] bg-[var(--s-panel)] px-3 py-3 text-sm text-[var(--s-ink)] outline-none placeholder:text-[var(--s-ink-faint)] transition-colors focus:border-[var(--s-accent)] focus:ring-2 focus:ring-[var(--s-accent-ring)]"
                />
              </div>

              <button type="submit" className="flex h-11 w-full items-center justify-center rounded-[10px] bg-[var(--s-cta-bg)] text-sm font-medium text-[var(--s-cta-fg)] transition-all hover:bg-[var(--s-accent)]">
                Submit request
              </button>

              <p className="text-xs text-[var(--s-ink-faint)]">By submitting, you agree to be contacted about {SITE_NAME}. No spam.</p>
            </form>
          </div>
        </div>
      </Container>
    </div>
  );
}
