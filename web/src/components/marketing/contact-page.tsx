'use client';

import { useTranslations } from 'next-intl';
import { SITE_NAME } from '@/config/site';
import { Container } from './Container';
import { getSupportEmail } from '@/lib/support';

const inputClass = 'h-11 w-full rounded-[10px] border border-[var(--s-border)] bg-[var(--s-panel)] px-3 text-sm text-[var(--s-ink)] outline-none placeholder:text-[var(--s-ink-faint)] transition-colors focus:border-[var(--s-accent)] focus:ring-2 focus:ring-[var(--s-accent-ring)]';

export function ContactPage() {
  const t = useTranslations('contactPage');

  // R-047: submit reaches the team for real via the user's mail client — no silent no-op.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') || '');
    const company = String(fd.get('company') || '');
    const channel = String(fd.get('channel') || '');
    const message = String(fd.get('message') || '');
    const body =
      `${t('mailFrom')}: ${email}\n${t('mailCompany')}: ${company}\n${t('mailChannel')}: ${channel}\n\n${message}`;
    window.location.href =
      `mailto:${getSupportEmail()}?subject=${encodeURIComponent(t('mailSubject'))}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="py-16 md:py-20">
      <Container>
        <div className="grid gap-10 md:grid-cols-2 md:items-start">
          {/* Left */}
          <div>
            <div className="brand-eyebrow mb-5">{t('eyebrow')}</div>
            <h1 className="font-display text-[clamp(36px,4.5vw,56px)] font-normal tracking-[-1.5px] text-[var(--s-ink)]">{t('title')}</h1>
            <p className="mt-4 text-[17px] leading-relaxed text-[var(--s-ink-soft)]">
              {t('intro')}
            </p>

            <div className="mt-8 grid gap-4">
              <div className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-6">
                <div className="mb-3 font-display text-[15px] font-medium text-[var(--s-ink)]">{t('outcomesTitle')}</div>
                <ul className="space-y-2">
                  {(t.raw('outcomes') as string[]).map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-[var(--s-ink-soft)]">
                      <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--s-accent)]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-6">
                <div className="mb-2 font-display text-[15px] font-medium text-[var(--s-ink)]">{t('includeTitle')}</div>
                <p className="text-sm text-[var(--s-ink-soft)]">
                  {t('includeBody')}
                </p>
              </div>
            </div>
          </div>

          {/* Right: form */}
          <div className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel)] p-6 brand-shadow-sm md:p-8">
            <div className="font-display text-[20px] font-medium text-[var(--s-ink)]">{t('formTitle')}</div>
            <p className="mt-1 text-sm text-[var(--s-ink-faint)]">{t('formNote', { email: getSupportEmail() })}</p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--s-ink)]">{t('emailLabel')}</label>
                <input name="email" type="email" required placeholder={t('emailPlaceholder')} className={inputClass} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--s-ink)]">{t('companyLabel')}</label>
                  <input name="company" type="text" placeholder={t('companyPlaceholder')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--s-ink)]">{t('websiteLabel')}</label>
                  <input name="website" type="url" placeholder="https://example.com" className={inputClass} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--s-ink)]">{t('channelLabel')}</label>
                  <select name="channel" className={`${inputClass} cursor-pointer`}>
                    <option>{t('channelVoice')}</option>
                    <option>{t('channelChat')}</option>
                    <option>{t('channelBoth')}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--s-ink)]">{t('languageLabel')}</label>
                  <select className={`${inputClass} cursor-pointer`}>
                    <option>{t('languageEnglish')}</option>
                    <option>{t('languageSpanish')}</option>
                    <option>{t('languageTurkish')}</option>
                    <option>{t('languageOther')}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--s-ink)]">{t('messageLabel')}</label>
                <textarea
                  name="message"
                  rows={5}
                  placeholder={t('messagePlaceholder')}
                  className="w-full resize-vertical rounded-[10px] border border-[var(--s-border)] bg-[var(--s-panel)] px-3 py-3 text-sm text-[var(--s-ink)] outline-none placeholder:text-[var(--s-ink-faint)] transition-colors focus:border-[var(--s-accent)] focus:ring-2 focus:ring-[var(--s-accent-ring)]"
                />
              </div>

              <button type="submit" className="flex h-11 w-full items-center justify-center rounded-[10px] bg-[var(--s-cta-bg)] text-sm font-medium text-[var(--s-cta-fg)] transition-all hover:bg-[var(--s-accent)]">
                {t('submit')}
              </button>

              <p className="text-xs text-[var(--s-ink-faint)]">{t('consent', { name: SITE_NAME })}</p>
            </form>
          </div>
        </div>
      </Container>
    </div>
  );
}
