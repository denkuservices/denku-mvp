'use client';

export function ContactPage() {
  return (
    <section className="py-14 md:py-16">
      <div className="grid gap-8 md:grid-cols-2 md:items-start">
        {/* Left: copy */}
        <div>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Contact</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Tell us your industry, channels, and what you want the agent to handle. We’ll propose a
            workflow and a deployment plan.
          </p>

          <div className="mt-8 grid gap-4">
            <div className="rounded-2xl border bg-background p-6">
              <div className="text-sm text-muted-foreground">Typical outcomes</div>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-foreground/60" />
                  <span>Lower support volume and faster response times</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-foreground/60" />
                  <span>Higher conversion on inbound calls and chats</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-foreground/60" />
                  <span>Structured data capture into your CRM or systems</span>
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border bg-background p-6">
              <div className="text-sm text-muted-foreground">What to include</div>
              <div className="mt-3 text-sm text-muted-foreground">
                Your website, your primary channel (phone/web), languages, and 2–3 top tasks you want
                automated.
              </div>
            </div>
          </div>
        </div>

        {/* Right: form */}
        <div className="rounded-2xl border bg-background p-6 md:p-8">
          <div className="text-xl font-semibold tracking-tight">Request a demo</div>
          <p className="mt-2 text-sm text-muted-foreground">
            This form is MVP-ready. We can wire it to an API endpoint next.
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              // MVP: no backend yet
              alert('Request submitted (MVP). Next step: wire to /api.');
            }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium">Work email</label>
              <input
                type="email"
                required
                placeholder="you@company.com"
                className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Company</label>
                <input
                  type="text"
                  placeholder="Company name"
                  className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Website</label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Primary channel</label>
                <select className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-foreground/20">
                  <option>Voice (phone)</option>
                  <option>Chat (website)</option>
                  <option>Both</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Language</label>
                <select className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-foreground/20">
                  <option>English</option>
                  <option>Spanish</option>
                  <option>Turkish</option>
                  <option>Other</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">What should the agent handle?</label>
              <textarea
                rows={5}
                placeholder="Example: Appointment booking, order status, FAQs, lead qualification..."
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>

            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-foreground px-5 text-sm font-medium text-background hover:opacity-90 transition"
            >
              Submit request
            </button>

            <div className="text-xs text-muted-foreground">
              By submitting, you agree to be contacted about SovereignAI. No spam.
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
