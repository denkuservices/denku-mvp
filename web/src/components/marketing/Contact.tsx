'use client';

import { useState, FormEvent, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Container } from './Container';
import { Section } from './Section';
import { Button } from './Button';
import { InlineBanner } from './InlineBanner';
import { CreditCard, Users, Mic, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { SITE_NAME } from '@/config/site';

// StartInMinutesFlow Component
function StartInMinutesFlow() {
  const steps = [
    {
      icon: CreditCard,
      label: 'Choose plan',
      sub: 'Starter → Enterprise',
    },
    {
      icon: Users,
      label: 'Pick persona',
      sub: 'Support · Sales · Lead intake',
    },
    {
      icon: Mic,
      label: 'Go live',
      sub: 'Live voice agent in minutes',
      isLive: true,
    },
  ];

  return (
    <div className="rounded-2xl border border-[#CBD5E1] bg-white p-6 shadow-sm md:p-8">
      <h3 className="text-base font-semibold text-[#0F172A] mb-6">Start in minutes</h3>
      
      {/* Desktop: 3-column grid with perfect alignment */}
      <div className="hidden md:grid md:grid-cols-3 md:items-start md:gap-6 relative">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === steps.length - 1;
          
          return (
            <div key={index} className="relative">
              {/* Step */}
              <div className="flex flex-col items-center text-center">
                {/* Icon chip - fixed size, centered */}
                <div className="relative mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F1F5F9]">
                    <Icon className="h-5 w-5 text-[#2563EB]" />
                  </div>
                  {step.isLive && (
                    <div className="absolute -top-1 -right-1 flex items-center gap-1 rounded-full border border-[#CBD5E1] bg-white px-2 py-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 pulse-dot"></span>
                      <span className="text-xs font-medium text-[#475569]">Live</span>
                    </div>
                  )}
                </div>
                
                {/* Title - consistent min-height to prevent misalignment */}
                <div className="min-h-[48px] flex items-start justify-center mb-1">
                  <div className="text-sm font-medium text-[#0F172A] leading-tight">{step.label}</div>
                </div>
                
                {/* Subtitle - consistent min-height */}
                <div className="min-h-[40px] flex items-start justify-center">
                  <div className="text-xs text-[#64748B] leading-tight">{step.sub}</div>
                </div>
              </div>
              
              {/* Connector with animated dot - positioned between columns */}
              {!isLast && (
                <div className="absolute top-6 left-1/2 w-1/2 h-px bg-[#CBD5E1]/40" style={{ width: 'calc(50% + 1.5rem)' }}>
                  <div 
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-[#2563EB] flow-connector-dot" 
                    style={{ animation: 'flowConnector 3s ease-in-out infinite' }}
                  ></div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: Vertical flow */}
      <div className="flex md:hidden flex-col gap-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === steps.length - 1;
          
          return (
            <div key={index}>
              <div className="flex items-start gap-3">
                <div className="relative flex-shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F1F5F9]">
                    <Icon className="h-5 w-5 text-[#2563EB]" />
                  </div>
                  {step.isLive && (
                    <div className="absolute -top-1 -right-1 flex items-center gap-1 rounded-full border border-[#CBD5E1] bg-white px-1.5 py-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 pulse-dot"></span>
                      <span className="text-xs font-medium text-[#475569]">Live</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#0F172A]">{step.label}</div>
                  <div className="mt-0.5 text-xs text-[#64748B]">{step.sub}</div>
                </div>
              </div>
              
              {/* Vertical connector */}
              {!isLast && (
                <div className="relative ml-5 mt-3 mb-1 h-8 w-px bg-[#CBD5E1]/40">
                  <div 
                    className="absolute left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-[#2563EB] flow-connector-dot"
                    style={{ animation: 'flowConnectorVertical 3s ease-in-out infinite' }}
                  ></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
    setChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  // Validate email format
  const validateEmail = (email: string): boolean => {
    if (!email.trim()) {
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value;
    setEmailError(null);
    
    // Only validate on blur or if there's already an error
    if (emailError && email.trim()) {
      if (!validateEmail(email)) {
        setEmailError('Please enter a valid email address');
      }
    }
  };

  const handleEmailBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const email = e.target.value;
    if (email.trim() && !validateEmail(email)) {
      setEmailError('Please enter a valid email address');
    } else {
      setEmailError(null);
    }
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
    const element = document.querySelector('#product');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(null);
    setError(null);
    setEmailError(null);

    // Clear any existing success timer
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }

    const form = e.currentTarget;
    const formData = new FormData(form);

    const email = formData.get('email')?.toString().trim() || '';

    // Frontend email validation
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    const payload = {
      work_email: email,
      company: formData.get('company')?.toString().trim() || '',
      industry: showAdvanced ? (formData.get('industry')?.toString().trim() || '') : '',
      channels: showAdvanced && channels.length > 0 ? channels : null,
      tools: showAdvanced ? (tools.trim() || '') : '',
      estimated_volume: formData.get('volume')?.toString().trim() || '',
      message: formData.get('message')?.toString().trim() || '',
    };

    try {
      const response = await fetch('/api/marketing/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.ok) {
        form.reset();
        setTools('');
        setChannels([]);
        setShowAdvanced(false);
        setSuccess("Request received. We'll get back to you shortly.");
        
        // Auto-dismiss after 4 seconds
        successTimerRef.current = setTimeout(() => {
          setSuccess(null);
          successTimerRef.current = null;
        }, 4000);

        // Focus the success banner for accessibility
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
    <Section id="contact" className="scroll-mt-20">
      <Container>
        <div className="grid gap-8 md:grid-cols-2 md:items-start">
          {/* Left: Visual + Process */}
          <div className="space-y-6">
            {/* Title & Subtitle */}
            <div>
              <h2 className="text-3xl font-bold text-[#0F172A] md:text-4xl">
                Start in minutes.
              </h2>
              <p className="mt-4 text-sm text-[#475569]">
                Choose a plan, connect tools, and go live—no setup calls.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={scrollToHero}
                size="lg"
                className="w-full sm:w-auto"
              >
                Talk to Denku AI
              </Button>
              <Button
                asChild
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
              >
                <Link href="/signup">Get started</Link>
              </Button>
            </div>

            {/* Start in minutes flow */}
            <StartInMinutesFlow />
          </div>

          {/* Right: Form Card */}
          <div className="rounded-2xl border border-[#CBD5E1] bg-white p-6 shadow-sm md:p-8">
            <div className="text-xl font-semibold text-[#0F172A]">Contact us</div>
            <p className="mt-2 text-sm text-[#475569]">
              Have a specific workflow? Tell us and we'll point you to the fastest setup.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {/* Success/Error Banners */}
              {success && (
                <InlineBanner
                  type="success"
                  message={success}
                  onDismiss={handleDismissSuccess}
                  className="mt-0"
                />
              )}
              {error && (
                <InlineBanner
                  type="error"
                  message={error}
                  onDismiss={() => setError(null)}
                  className="mt-0"
                />
              )}

              {/* Work Email */}
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-[#0F172A]">
                  Work email *
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  placeholder="you@company.com"
                  disabled={loading}
                  onChange={handleEmailChange}
                  onBlur={handleEmailBlur}
                  className={`mt-2 flex h-12 w-full items-center rounded-xl border px-3 text-sm text-[#0F172A] outline-none placeholder:text-[#64748B] focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    emailError
                      ? 'border-red-300 bg-red-50/50 focus:border-red-400 focus:ring-red-400/20'
                      : 'border-[#CBD5E1] bg-white focus:border-[#2563EB] focus:ring-[#2563EB]/20'
                  }`}
                  aria-required="true"
                  aria-invalid={emailError ? 'true' : 'false'}
                  aria-describedby={emailError ? 'email-error' : undefined}
                />
                {emailError && (
                  <p id="email-error" className="text-xs text-red-600 mt-1" role="alert">
                    {emailError}
                  </p>
                )}
              </div>

              {/* Company */}
              <div className="space-y-2">
                <label htmlFor="company" className="text-sm font-medium text-[#0F172A]">
                  Company *
                </label>
                <input
                  type="text"
                  id="company"
                  name="company"
                  required
                  placeholder="Company name"
                  disabled={loading}
                  className="mt-2 flex h-12 w-full items-center rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A] outline-none placeholder:text-[#64748B] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* Estimated Volume */}
              <div className="space-y-2">
                <label htmlFor="volume" className="text-sm font-medium text-[#0F172A]">
                  Estimated volume *
                </label>
                <select
                  id="volume"
                  name="volume"
                  required
                  disabled={loading}
                  className="mt-2 flex h-12 w-full items-center rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select volume</option>
                  <option value="<1k">&lt;1k interactions/month</option>
                  <option value="1-10k">1-10k interactions/month</option>
                  <option value="10k+">10k+ interactions/month</option>
                </select>
              </div>

              {/* Message */}
              <div className="space-y-2">
                <label htmlFor="message" className="text-sm font-medium text-[#0F172A]">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={3}
                  disabled={loading}
                  placeholder="Tell us about your use case..."
                  className="mt-2 flex w-full items-center rounded-xl border border-[#CBD5E1] bg-white px-3 py-3 text-sm text-[#0F172A] outline-none placeholder:text-[#64748B] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 disabled:opacity-50 disabled:cursor-not-allowed resize-vertical"
                />
              </div>

              {/* Advanced Fields Toggle */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  disabled={loading}
                  className="flex items-center gap-2 text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {showAdvanced ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      Hide additional details
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Add more details
                    </>
                  )}
                </button>
              </div>

              {/* Advanced Fields (Collapsible) */}
              {showAdvanced && (
                <div className="space-y-4 border-t border-[#CBD5E1] pt-4">
                  {/* Channels */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#0F172A]">Channels</label>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {['Voice', 'Chat'].map((channel) => {
                        const isSelected = channels.includes(channel);
                        return (
                          <button
                            key={channel}
                            type="button"
                            onClick={() => toggleChannel(channel)}
                            disabled={loading}
                            className={[
                              'rounded-xl border-2 px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
                              isSelected
                                ? 'border-[#2563EB] bg-[#F1F5F9] text-[#2563EB]'
                                : 'border-[#CBD5E1] bg-white text-[#64748B] hover:border-[#94A3B8]',
                            ].join(' ')}
                          >
                            {channel}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tools / Integrations */}
                  <div className="space-y-2">
                    <label htmlFor="tools" className="text-sm font-medium text-[#0F172A]">
                      Tools / Integrations
                    </label>
                    <input
                      type="text"
                      id="tools"
                      value={tools}
                      onChange={(e) => setTools(e.target.value)}
                      disabled={loading}
                      placeholder="e.g., CRM, Calendar, Helpdesk"
                      className="mt-2 flex h-12 w-full items-center rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A] outline-none placeholder:text-[#64748B] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Industry */}
                  <div className="space-y-2">
                    <label htmlFor="industry" className="text-sm font-medium text-[#0F172A]">
                      Industry
                    </label>
                    <select
                      id="industry"
                      name="industry"
                      disabled={loading}
                      className="mt-2 flex h-12 w-full items-center rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
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

              {/* Submit Button */}
              <Button
                type="submit"
                size="lg"
                disabled={loading}
                className="mt-6 w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit request'
                )}
              </Button>

              <div className="text-xs text-[#64748B]">
                By submitting, you agree to be contacted about {SITE_NAME}. No spam.
              </div>
            </form>
          </div>
        </div>
      </Container>
    </Section>
  );
}
