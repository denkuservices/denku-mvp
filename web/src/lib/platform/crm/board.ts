import type { RequestView } from "@/lib/platform/readModel/requests";

/**
 * The board's columns, and which request belongs in which.
 *
 * Pure and separate from the JSX so the page, the drag handler and the tests cannot disagree
 * about what "open" means — the same reason `contactRows.ts` exists beside the contacts table.
 *
 * The columns are the STATUSES a request actually moves through, in the order work moves through
 * them. They are not derived from what happens to be in the data: a board whose columns appear
 * and vanish with the rows is one you cannot drag onto, because the empty column you need is the
 * one that is missing.
 */

export interface BoardColumn {
  /** The value written to `tickets.status`. */
  status: string;
  label: string;
  /** Shown under the heading when the column is empty — says what belongs here, not "no items". */
  emptyHint: string;
}

export const BOARD_COLUMNS: readonly BoardColumn[] = [
  { status: "open", label: "Open", emptyHint: "Nothing waiting." },
  { status: "pending", label: "Pending", emptyHint: "Nothing waiting on someone else." },
  { status: "closed", label: "Closed", emptyHint: "Nothing finished yet." },
] as const;

const KNOWN = new Set(BOARD_COLUMNS.map((c) => c.status));

/**
 * Which column a request sits in.
 *
 * Anything unrecognised — a status from an older workflow, a value typed by hand, an empty one —
 * lands in the first column rather than vanishing. A board that silently drops a request is worse
 * than one that puts it somewhere arguable: the row still gets read, and someone can move it.
 */
export function columnFor(request: RequestView): string {
  const status = (request.status ?? "").trim().toLowerCase();
  if (KNOWN.has(status)) return status;

  // The synonyms the rest of the product already treats as finished.
  if (["completed", "resolved", "done", "cancelled", "canceled"].includes(status)) return "closed";
  return BOARD_COLUMNS[0].status;
}

export interface BoardGroup extends BoardColumn {
  items: RequestView[];
}

/** Group requests into the fixed columns, preserving the order they arrived in. */
export function groupIntoBoard(requests: readonly RequestView[]): BoardGroup[] {
  const byStatus = new Map<string, RequestView[]>();
  for (const column of BOARD_COLUMNS) byStatus.set(column.status, []);

  for (const request of requests) {
    byStatus.get(columnFor(request))!.push(request);
  }

  return BOARD_COLUMNS.map((column) => ({ ...column, items: byStatus.get(column.status)! }));
}
