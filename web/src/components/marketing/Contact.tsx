'use client';

import { useState, FormEvent, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Container } from './Container';
import { Section } from './Section';
import { Reveal } from './Reveal';
import { InlineBanner } from './InlineBanner';
import { CreditCard, Users, Mic, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { SITE_NAME } from '@/config/site';

function StartInMinutesFlow() {
  const steps = [
    { icon: CreditCard, label: 'Choose plan', sub: 'Starter → Scale' },
    { icon: Users, label: 'Pick persona', sub: 'Support · Sales · Lead intake' },
    { icon: Mic, label: 'Go live', sub: 'Live voice agent in minutes', isLive: true },
  ];

  return (
    <div className="rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#FBFAF8] p-6 md:p-8">
      <h3 className="mb-6 font-display text-[17px] font-medium text-[#0A1A2F]">Start in minutes</h3>

      {/* Desktop */}
      <div className="relative hidden md:grid md:grid-cols-3 md:items-start md:gap-6">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === steps.length - 1;
          return (
            <div key={index} className="relative">
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E3EEED] text-[#134F4F]">
                    <Icon className="h-5 w-5" />
                  </div>
                  {step.isLive && (
                    <div className="absolute -right-1 -top-1 flex items-center gap-1 rounded-full border border-[#1B6E6E]/25 bg-[#FBFAF8] px-2 py-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#1B6E6E] pulse-dot" />
                      <span className="text-xs font-medium text-[#134F4F]">Live</span>
                    </div>
                  )}
                </div>
                <div className="mb-1 flex min-h-[44px] items-start justify-center">
                  <div className="text-sm font-medium text-[#0A1A2F]">{step.label}</div>
                </div>
                <div className="flex min-h-[36px] items-start justify-center">
                  <div className="text-xs text-[#6B7888]">{step.sub}</div>
                </div>
              </div>
              {!isLast && (
                <div className="absolute left-1/2 top-5 h-px bg-[#0A1A2F]/10" style={{ width: 'calc(50% + 1.5rem)' }}>
                  <div className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#1B6E6E]" style={{ animation: 'flowConnector 3s ease-in-out infinite' }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile */}
      <div className="flex flex-col gap-4 md:hidden">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === steps.length - 1;
          return (
            <div key={index}>
              <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E3EEED] text-[#134F4F]">
                    <Icon className="h-5 w-5" />
                  </div>
                  {step.isLive && (
                    <div className="absolute -right-1 -top-1 flex items-center gap-1 rounded-full border border-[#1B6E6E]/25 bg-[#FBFAF8] px-1.5 py-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#1B6E6E] pulse-dot" />
                      <span className="text-xs font-medium text-[#134F4F]">Live</span>
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium text-[#0A1A2F]">{step.label}</div>
                  <div className="mt-0.5 text-xs text-[#6B7888]">{step.sub}</div>
                </div>
              </div>
              {!isLast && (
                <div className="relative ml-5 mb-1 mt-3 h-8 w-px bg-[#0A1A2F]/10">
                  <div className="absolute left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-[#1B6E6E]" style={{ animation: 'flowConnectorVertical 3s ease-in-out infinite' }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inputBase =
  'mt-2 flex h-12 w-full items-center rounded-[10px] border bg-white px-3 text-sm text-[#0A1A2F] outline-none placeholder:text-[#6B7888]/70 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors';
const inputOk = `${inputBase} border-[#0A1A2F]/10 focus:border-[#1B6E6E] focus:ring-[#1B6E6E]/15`;
const inputErr = `${inputBase} border-red-300 bg-red-50/50 focus:border-red-400 focus:ring-red-400/20`;

export function Contact() {
  const [channels, setChannels] = useState<string[]>([]);
  const [tools, setTools] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);

  const toggleChannel = (channel: string) => {
    setChannels((prev) => (prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]));
  };

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const validateEmail = (email: string): boolean => {
    if (!email.trim()) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmailError(null);
    if (emailError && e.target.value.trim() && !validateEmail(e.target.value)) {
      setEmailError('Please enter a valid email address');
    }
  };

  const handleEmailBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const email = e.target.value;
    if (email.trim() && !validateEmail(email)) setEmailError('Please enter a valid email address');
    else setEmailError(null);
  };

  const handleDismissSuccess = () => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    setSuccess(null);
  };

  const scrollToHero = (e: React.MouseEvent) => {
    e.preventDefault();
    document.querySelector('#product')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(null);
    setError(null);
    setEmailError(null);
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }

    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = formData.get('email')?.toString().trim() || '';

    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    const payload = {
      work_email: email,
      company: formData.get('company')?.toString().trim() || '',
      industry: showAdvanced ? formData.get('industry')?.toString().trim() || '' : '',
      channels: showAdvanced && channels.length > 0 ? channels : null,
      tools: showAdvanced ? tools.trim() || '' : '',
      estimated_volume: formData.get('volume')?.toString().trim() || '',
      message: formData.get('message')?.toString().trim() || '',
    };

    try {
      const response = await fetch('/api/marketing/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (data.ok) {
        form.reset();
        setTools('');
        setChannels([]);
        setShowAdvanced(false);
        setSuccess("Request received. We'll get back to you shortly.");
        successTimerRef.current = setTimeout(() => {
          setSuccess(null);
          successTimerRef.current = null;
        }, 4000);
        setTimeout(() => {
          const banner = document.querySelector('[role="alert"]') as HTMLElement;
          if (banner) {
            banner.focus();
            banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 100);
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      console.error('Form submission error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section id="contact" className="scroll-mt-20 border-t border-[#0A1A2F]/[0.06]">
      <Container>
        <div className="grid gap-10 md:grid-cols-2 md:items-start">
          {/* Left */}
          <Reveal className="space-y-6">
            <div>
              <div className="brand-eyebrow mb-5">Get started</div>
              <h2 className="font-display text-[clamp(32px,3.8vw,50px)] font-normal leading-[1.08] tracking-[-1.2px] text-[#0A1A2F]">
                Start in minutes.
                <br />
                <em className="font-medium italic text-[#1B6E6E]">No setup calls.</em>
              </h2>
              <p className="mt-4 text-[17px] leading-relaxed text-[#2C3E54]">
                Choose a plan, connect tools, and go live — entirely self-serve.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={scrollToHero}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[#0A1A2F] px-6 text-sm font-medium text-[#F7F5F1] transition-all hover:-translate-y-0.5 hover:bg-[#1B6E6E] sm:w-auto"
              >
                Talk to Denku
              </button>
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-[#0A1A2F]/10 px-6 text-sm font-medium text-[#0A1A2F] transition-all hover:border-[#1B6E6E] hover:text-[#1B6E6E] sm:w-auto"
              >
                Get started free
              </Link>
            </div>

            <StartInMinutesFlow />
          </Reveal>

          {/* Right: Form */}
          <Reveal delay={1} className="rounded-[18px] border border-[#0A1A2F]/10 bg-white p-6 brand-shadow-sm md:p-8">
            <div className="font-display text-[20px] font-medium text-[#0A1A2F]">Contact us</div>
            <p className="mt-1 text-sm text-[#6B7888]">
              Have a specific workflow? Tell us and we&apos;ll point you to the fastest setup.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {success && <InlineBanner type="success" message={success} onDismiss={handleDismissSuccess} className="mt-0" />}
              {error && <InlineBanner type="error" message={error} onDismiss={() => setError(null)} className="mt-0" />}

              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-[#0A1A2F]">Work email *</label>
                <input
                  type="email" id="email" name="email" required placeholder="you@company.com"
                  disabled={loading} onChange={handleEmailChange} onBlur={handleEmailBlur}
                  className={emailError ? inputErr : inputOk}
                  aria-required="true" aria-invalid={emailError ? 'true' : 'false'} aria-describedby={emailError ? 'email-error' : undefined}
                />
                {emailError && <p id="email-error" className="mt-1 text-xs text-red-600" role="alert">{emailError}</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="company" className="text-sm font-medium text-[#0A1A2F]">Company *</label>
                <input type="text" id="company" name="company" required placeholder="Company name" disabled={loading} className={inputOk} />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="volume" className="text-sm font-medium text-[#0A1A2F]">Estimated volume *</label>
                <select id="volume" name="volume" required disabled={loading} className={`${inputOk} cursor-pointer`}>
                  <option value="">Select volume</option>
                  <option value="<1k">&lt;1k interactions/month</option>
                  <option value="1-10k">1-10k interactions/month</option>
                  <option value="10k+">10k+ interactions/month</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="message" className="text-sm font-medium text-[#0A1A2F]">Message</label>
                <textarea
                  id="message" name="message" rows={3} disabled={loading} placeholder="Tell us about your use case..."
                  className="mt-2 flex w-full resize-vertical rounded-[10px] border border-[#0A1A2F]/10 bg-white px-3 py-3 text-sm text-[#0A1A2F] outline-none placeholder:text-[#6B7888]/70 focus:border-[#1B6E6E] focus:ring-2 focus:ring-[#1B6E6E]/15 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                />
              </div>

              <div className="pt-2">
                <button
                  type="button" onClick={() => setShowAdvanced(!showAdvanced)} disabled={loading}
                  className="flex items-center gap-2 text-sm font-medium text-[#1B6E6E] transition-colors hover:text-[#134F4F] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {showAdvanced ? <><ChevronUp className="h-4 w-4" /> Hide additional details</> : <><ChevronDown className="h-4 w-4" /> Add more details</>}
                </button>
              </div>

              {showAdvanced && (
                <div className="space-y-4 border-t border-[#0A1A2F]/[0.08] pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#0A1A2F]">Channels</label>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {['Voice', 'Chat'].map((channel) => {
                        const isSelected = channels.includes(channel);
                        return (
                          <button
                            key={channel} type="button" onClick={() => toggleChannel(channel)} disabled={loading}
                            className={[
                              'rounded-[10px] border-2 px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6E6E] disabled:cursor-not-allowed disabled:opacity-50',
                              isSelected ? 'border-[#1B6E6E] bg-[#E3EEED] text-[#134F4F]' : 'border-[#0A1A2F]/10 bg-white text-[#6B7888] hover:border-[#0A1A2F]/25',
                            ].join(' ')}
                          >
                            {channel}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="tools" className="text-sm font-medium text-[#0A1A2F]">Tools / Integrations</label>
                    <input type="text" id="tools" value={tools} onChange={(e) => setTools(e.target.value)} disabled={loading} placeholder="e.g., CRM, Calendar, Helpdesk" className={inputOk} />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="industry" className="text-sm font-medium text-[#0A1A2F]">Industry</label>
                    <select id="industry" name="industry" disabled={loading} className={`${inputOk} cursor-pointer`}>
                      <option value="">Select industry</option>
                      <option value="healthcare">Healthcare</option>
                      <option value="finance">Finance</option>
                      <option value="retail">Retail</option>
                      <option value="saas">SaaS</option>
                      <option value="real-estate">Real Estate</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              )}

              <button
                type="submit" disabled={loading}
                className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[#0A1A2F] text-sm font-medium text-[#F7F5F1] transition-all hover:bg-[#1B6E6E] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</> : 'Submit request'}
              </button>

              <p className="text-xs text-[#6B7888]">By submitting, you agree to be contacted about {SITE_NAME}. No spam.</p>
            </form>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
