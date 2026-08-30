/**
 * Vertical pages behind `/industries/*`.
 *
 * Four handcrafted at launch (doc 15 §4). The template is deliberately the same
 * shape for all of them so it can become the SEO engine later without a rewrite.
 *
 * `pain` lines describe the situation, not a statistic. Sourced numbers can be
 * added here later — inventing one to fill the slot is what this whole plan is
 * trying to avoid.
 */

export type Industry = {
  slug: string;
  name: string;
  headline: string;
  sub: string;
  pain: string[];
  /** Which employee template we recommend, by slug. */
  recommend: string;
  /** Vertical-specific questions, answered honestly. */
  faq: { q: string; a: string }[];
};

export const INDUSTRIES: Industry[] = [
  {
    slug: "hvac-plumbing",
    name: "HVAC & plumbing",
    headline: "The call comes while you're under a sink.",
    sub: "Your hands are busy. The phone still rings.",
    pain: [
      "Calls arrive while you're on a job, not at a desk.",
      "Emergency work goes to whoever answers first.",
      "Evenings and weekends are when the pipes burst.",
    ],
    recommend: "missed-call-rescuer",
    faq: [
      {
        q: "Can it tell an emergency from a quote request?",
        a: "It can ask, and it writes the answer into the ticket. It does not decide dispatch for you.",
      },
      {
        q: "Can it give a price over the phone?",
        a: "Only what you told it. If you don't price over the phone, it says so and books the estimate.",
      },
    ],
  },
  {
    slug: "dental",
    name: "Dental",
    headline: "Front desk is with a patient.",
    sub: "The phone shouldn't decide who gets seen.",
    pain: [
      "One person covers check-in, checkout and the phone.",
      "New-patient calls are the ones you least want to miss.",
      "Cancellations open slots nobody calls to fill.",
    ],
    recommend: "booking-assistant",
    faq: [
      {
        q: "Can it check my insurance?",
        a: "No. It can ask which plan the caller has and record it, so your team isn't starting from scratch.",
      },
      {
        q: "Is this HIPAA compliant?",
        a: "Denku is not certified for HIPAA today, and we won't claim otherwise. Don't route protected health information through it until that changes.",
      },
    ],
  },
  {
    slug: "med-spa-salon",
    name: "Med spa & salon",
    headline: "Every missed call is an empty chair.",
    sub: "Bookings are the business, and they arrive by phone.",
    pain: [
      "Calls come in while you're with a client.",
      "Most booking calls arrive outside opening hours.",
      "Price and availability questions repeat all day.",
    ],
    recommend: "support-agent",
    faq: [
      {
        q: "Can it book directly into my calendar?",
        a: "Not yet. It creates the appointment request with the details, and your team confirms it.",
      },
      {
        q: "Will it sound like a robot to my clients?",
        a: "Call the demo line on the homepage and decide for yourself. That's why it's there.",
      },
    ],
  },
  {
    slug: "law",
    name: "Legal",
    headline: "The first call decides the case.",
    sub: "Intake that never goes to voicemail.",
    pain: [
      "Prospective clients call several firms and take the first answer.",
      "Intake questions are the same every time.",
      "Court hours and phone hours are the same hours.",
    ],
    recommend: "after-hours",
    faq: [
      {
        q: "Can it give legal advice?",
        a: "No, and it is instructed not to try. It takes intake details and opens a matter for a person to review.",
      },
      {
        q: "Is the call confidential?",
        a: "Calls and transcripts stay in your workspace and are scoped to your organisation. We are not offering a privilege guarantee.",
      },
    ],
  },
];

export function getIndustry(slug: string): Industry | undefined {
  return INDUSTRIES.find((i) => i.slug === slug);
}
