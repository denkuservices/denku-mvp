'use client';

import { SITE_NAME } from '@/config/site';
import { Container } from './Container';

const inputClass = 'h-11 w-full rounded-[10px] border border-[#0A1A2F]/10 bg-white px-3 text-sm text-[#0A1A2F] outline-none placeholder:text-[#6B7888]/70 transition-colors focus:border-[#1B6E6E] focus:ring-2 focus:ring-[#1B6E6E]/15';

export function ContactPage() {
  return (
    <div className="py-16 md:py-20">
      <Container>
        <div className="grid gap-10 md:grid-cols-2 md:items-start">
          {/* Left */}
          <div>
            <div className="brand-eyebrow mb-5">Contact</div>
            <h1 className="font-display text-[clamp(36px,4.5vw,56px)] font-normal tracking-[-1.5px] text-[#0A1A2F]">Contact</h1>
            <p className="mt-4 text-[17px] leading-relaxed text-[#2C3E54]">
              Tell us your industry, channels, and what you want the agent to handle. We&apos;ll propose a workflow and a deployment plan.
            </p>

            <div className="mt-8 grid gap-4">
              <div className="rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#FBFAF8] p-6">
                <div className="mb-3 font-display text-[15px] font-medium text-[#0A1A2F]">Typical outcomes</div>
                <ul className="space-y-2">
                  {[
                    'Lower support volume and faster response times',
                    'Higher conversion on inbound calls and chats',
                    'Structured data capture into your CRM or systems',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-[#2C3E54]">
                      <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#1B6E6E]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#FBFAF8] p-6">
                <div className="mb-2 font-display text-[15px] font-medium text-[#0A1A2F]">What to include</div>
                <p className="text-sm text-[#2C3E54]">
                  Your website, your primary channel (phone/web), languages, and 2–3 top tasks you want automated.
                </p>
              </div>
            </div>
          </div>

          {/* Right: form */}
          <div className="rounded-[18px] border border-[#0A1A2F]/10 bg-white p-6 brand-shadow-sm md:p-8">
            <div className="font-display text-[20px] font-medium text-[#0A1A2F]">Request a demo</div>
            <p className="mt-1 text-sm text-[#6B7888]">This form is MVP-ready. We can wire it to an API endpoint next.</p>

            <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#0A1A2F]">Work email</label>
                <input type="email" required placeholder="you@company.com" className={inputClass} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#0A1A2F]">Company</label>
                  <input type="text" placeholder="Company name" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#0A1A2F]">Website</label>
                  <input type="url" placeholder="https://example.com" className={inputClass} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#0A1A2F]">Primary channel</label>
                  <select className={`${inputClass} cursor-pointer`}>
                    <option>Voice (phone)</option>
                    <option>Chat (website)</option>
                    <option>Both</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#0A1A2F]">Language</label>
                  <select className={`${inputClass} cursor-pointer`}>
                    <option>English</option>
                    <option>Spanish</option>
                    <option>Turkish</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#0A1A2F]">What should the agent handle?</label>
                <textarea
                  rows={5}
                  placeholder="Example: Appointment booking, order status, FAQs, lead qualification..."
                  className="w-full resize-vertical rounded-[10px] border border-[#0A1A2F]/10 bg-white px-3 py-3 text-sm text-[#0A1A2F] outline-none placeholder:text-[#6B7888]/70 transition-colors focus:border-[#1B6E6E] focus:ring-2 focus:ring-[#1B6E6E]/15"
                />
              </div>

              <button type="submit" className="flex h-11 w-full items-center justify-center rounded-[10px] bg-[#0A1A2F] text-sm font-medium text-[#F7F5F1] transition-all hover:bg-[#1B6E6E]">
                Submit request
              </button>

              <p className="text-xs text-[#6B7888]">By submitting, you agree to be contacted about {SITE_NAME}. No spam.</p>
            </form>
          </div>
        </div>
      </Container>
    </div>
  );
}
