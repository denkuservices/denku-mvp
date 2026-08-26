/**
 * The Inbox's own palette (Inbox v2).
 *
 * **Why this surface departs from the Horizon dashboard tokens.** Everywhere else in the product,
 * a page is a set of cards on a light background and `brand-500` is the colour of action. A
 * messaging surface is not that: it is two panes, one list and one conversation, and the thing a
 * person reads is a stream of bubbles whose *side and colour* say who spoke. That vocabulary is
 * not ours to invent — every customer already knows it from WhatsApp, and borrowing it is why the
 * screen is legible in the first second. So the thread takes WhatsApp's colours: a warm neutral
 * ground, white for what the customer said, green for what we said.
 *
 * Kept in one file, as class strings rather than scattered hexes, so the whole surface can be
 * retuned in one place — and so nothing outside `/dashboard/inbox` can accidentally pick these up
 * and leak a second visual language into the rest of the dashboard.
 *
 * Dark mode uses WhatsApp's own dark values (#0B141A ground, #202C33 incoming, #005C4B outgoing)
 * rather than the navy tokens: half-translating the metaphor would read as a bug.
 */

export const inbox = {
  /** The split view's outer frame. */
  frame: "border-gray-200 dark:border-[#2A3942]",
  /** List panel and thread header: the "chrome" white. */
  panel: "bg-white dark:bg-[#111B21]",
  /** The conversation ground the bubbles sit on. */
  thread: "bg-[#F3F2EE] dark:bg-[#0B141A]",

  /** Search field — filled, not outlined (see SearchField's `tone`). */
  field: "bg-[#F1F0ED] dark:bg-[#202C33]",

  /** A filter chip at rest, and the one that is on. */
  chipIdle:
    "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-[#2A3942] dark:bg-[#111B21] dark:text-gray-300 dark:hover:bg-[#202C33]",
  chipActive:
    "border-[#25D366] bg-[#E7F8EF] text-[#0B7A55] dark:border-[#00A884] dark:bg-[#00A884]/15 dark:text-[#5BE6B4]",

  /** List rows. The selected one is tinted, never boxed — a border would break the column. */
  rowIdle: "hover:bg-[#F7F8F9] dark:hover:bg-[#202C33]",
  rowActive: "bg-[#EFFAF5] dark:bg-[#2A3942]",
  rowDivider: "divide-gray-100 dark:divide-[#222E35]",

  /** Message bubbles. Incoming is what the customer said; outgoing is what we said. */
  bubbleIn: "bg-white text-[#111B21] dark:bg-[#202C33] dark:text-[#E9EDEF]",
  bubbleOut: "bg-[#E6F5EC] text-[#111B21] dark:bg-[#005C4B] dark:text-[#E9EDEF]",
  /** A system note in the middle of a thread (call metadata, an unlabelled transcript). */
  bubbleSystem:
    "bg-[#FFF5D6] text-[#5B5333] dark:bg-[#182229] dark:text-[#8696A0]",

  /** Unread count — WhatsApp's green, and the only saturated colour in the list. */
  unread: "bg-[#25D366] text-white",

  /** Muted metadata: timestamps, previews, the channel line under a name. */
  meta: "text-gray-500 dark:text-[#8696A0]",
  metaFaint: "text-gray-400 dark:text-[#667781]",
  /** Names and message text. */
  strong: "text-[#111B21] dark:text-[#E9EDEF]",
} as const;

/** The one green used for action affordances on this surface (send, star-on). */
export const INBOX_ACCENT = "#25D366";
