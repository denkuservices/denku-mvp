/**
 * The employee roster behind `/employees/*` — STRUCTURE ONLY.
 *
 * Every visible word lives in `src/messages/*.json` under `employees.items.<slug>`:
 * the role, the tagline, the day-in-the-life beats, the capability lists, the
 * verticals, and the CTA.
 *
 * What stays here is what is not language:
 *  - `slug` — the URL and the message key
 *  - `name` — the employee's given name. Deliberately NOT translated: Ava is Ava
 *    in every language, the way a colleague's name does not change when you switch
 *    the interface.
 *  - `glyph` — the badge mark
 *
 * The honesty rule still governs the copy on the other side of this boundary: what
 * an employee "does" must be something the shipped product performs today, and
 * anything that depends on SMS or WhatsApp belongs in `notYet`.
 */

export type Employee = {
  slug: string;
  /** Given name — the same in every locale. */
  name: string;
  glyph: string;
};

export const EMPLOYEES: Employee[] = [
  { slug: "receptionist", name: "Ava", glyph: "◍" },
  { slug: "booking-assistant", name: "Miles", glyph: "◈" },
  { slug: "missed-call-rescuer", name: "Rae", glyph: "◇" },
  { slug: "after-hours", name: "Nox", glyph: "◐" },
  { slug: "support-agent", name: "Iris", glyph: "◎" },
];

export function getEmployee(slug: string): Employee | undefined {
  return EMPLOYEES.find((e) => e.slug === slug);
}
