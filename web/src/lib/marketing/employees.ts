/**
 * The employee roster — the product catalogue behind `/employees/*`.
 *
 * Honesty rule for this file: every capability listed under `does` must be
 * something the shipped product actually performs today. Voice is the live
 * channel; anything that depends on SMS or WhatsApp belongs in `notYet`, not in
 * `does`, however good it would look in the grid.
 */

export type Employee = {
  slug: string;
  name: string;
  role: string;
  glyph: string;
  /** One line, used on the roster card. */
  line: string;
  /** Rotating ticker on the badge. */
  ticker: string[];
  /** Headline on the detail page. */
  headline: string;
  /** Single supporting sentence. */
  sub: string;
  /** A day in the life — four beats, short. */
  day: { when: string; what: string }[];
  /** What it does today. Live capability only. */
  does: string[];
  /** Stated plainly rather than implied. */
  notYet: string[];
  /** Verticals it fits best. */
  fits: string[];
};

export const EMPLOYEES: Employee[] = [
  {
    slug: "receptionist",
    name: "Ava",
    role: "Receptionist",
    glyph: "◍",
    line: "Answers every call, day or night.",
    ticker: ["Answered 12 calls today", "Two after midnight"],
    headline: "The call always gets answered.",
    sub: "Every ring, every hour, in the same voice.",
    day: [
      { when: "7:12am", what: "First call of the day, before anyone is in." },
      { when: "1:40pm", what: "Two calls at once — both answered." },
      { when: "6:04pm", what: "After close. Still picking up." },
      { when: "11:58pm", what: "Takes a message, opens a ticket." },
    ],
    does: [
      "Answers inbound calls 24/7",
      "Captures the caller and why they called",
      "Opens a ticket or an appointment request from every call",
      "Speaks 20+ languages",
    ],
    notYet: ["It does not make outbound calls.", "It does not send SMS yet."],
    fits: ["Home services", "Clinics", "Salons", "Legal"],
  },
  {
    slug: "booking-assistant",
    name: "Miles",
    role: "Booking assistant",
    glyph: "◈",
    line: "Turns a conversation into a slot.",
    ticker: ["Booked Thu 9:30am", "Rescheduled a Friday job"],
    headline: "From “do you have anything Thursday?” to a booking.",
    sub: "It asks what it needs, then writes the request down.",
    day: [
      { when: "8:20am", what: "Caller wants an estimate this week." },
      { when: "8:21am", what: "Offers the times you actually have." },
      { when: "8:22am", what: "Writes the appointment request." },
      { when: "8:23am", what: "It's on your dashboard before you look." },
    ],
    does: [
      "Collects the details a booking needs",
      "Creates an appointment request on every booking call",
      "Never claims a booking it did not record",
      "Hands off cleanly when a human should decide",
    ],
    notYet: [
      "Two-way calendar sync is not live yet — requests land in the dashboard for you to confirm.",
    ],
    fits: ["Home services", "Med spa", "Dental", "Auto"],
  },
  {
    slug: "missed-call-rescuer",
    name: "Rae",
    role: "Missed-call rescue",
    glyph: "◇",
    line: "Catches the calls nobody picked up.",
    ticker: ["Recovered 6 missed calls", "Four became bookings"],
    headline: "The calls you never knew you lost.",
    sub: "Overflow and after-hours calls get answered instead of dropped.",
    day: [
      { when: "12:30pm", what: "You're on the other line." },
      { when: "12:30pm", what: "It picks up the second caller." },
      { when: "12:33pm", what: "Gets the job details." },
      { when: "12:34pm", what: "Logs the lead against a contact." },
    ],
    does: [
      "Answers overflow calls when your line is busy",
      "Covers the hours nobody is at the desk",
      "Turns every rescued call into a ticket or a booking request",
    ],
    notYet: [
      "Automatic text-back to a missed number is not built yet. Today the rescue is by answering, not by texting.",
    ],
    fits: ["Home services", "Contractors", "Clinics"],
  },
  {
    slug: "after-hours",
    name: "Nox",
    role: "After hours",
    glyph: "◐",
    line: "Covers the hours you're closed.",
    ticker: ["Held the line until 7am", "Nothing went to voicemail"],
    headline: "Closed, but not unreachable.",
    sub: "Nights, weekends, holidays — the line still works.",
    day: [
      { when: "9:02pm", what: "A caller with an urgent problem." },
      { when: "9:03pm", what: "Triages: urgent, or can it wait?" },
      { when: "9:04pm", what: "Writes it up either way." },
      { when: "7:00am", what: "You open the dashboard to a full picture." },
    ],
    does: [
      "Runs on your schedule — you set when it takes over",
      "Separates urgent from routine in the write-up",
      "Leaves a complete record of the night",
    ],
    notYet: ["It cannot page an on-call person yet."],
    fits: ["Property management", "Clinics", "Legal", "Veterinary"],
  },
  {
    slug: "support-agent",
    name: "Iris",
    role: "Support",
    glyph: "◎",
    line: "Answers the same questions, forever.",
    ticker: ["Resolved 9 questions", "Escalated one to you"],
    headline: "The twentieth time is the same as the first.",
    sub: "Hours, pricing, location, policy — answered without fatigue.",
    day: [
      { when: "All day", what: "“Are you open Sunday?”" },
      { when: "All day", what: "“Do you take my insurance?”" },
      { when: "All day", what: "“Where do I park?”" },
      { when: "Once", what: "Something it shouldn't guess at → escalated." },
    ],
    does: [
      "Answers from what you told it about your business",
      "Escalates rather than inventing an answer",
      "Opens a ticket when something needs a person",
    ],
    notYet: ["It does not read your website automatically — you tell it what is true."],
    fits: ["Retail", "Clinics", "Restaurants", "Studios"],
  },
];

export function getEmployee(slug: string): Employee | undefined {
  return EMPLOYEES.find((e) => e.slug === slug);
}
