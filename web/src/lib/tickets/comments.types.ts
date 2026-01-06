import "server-only";

/**
 * Ticket comment from database
 * Note: Comments are immutable (no updated_at column)
 */
export type TicketCommentRow = {
  id: string;
  org_id: string;
  ticket_id: string;
  author_profile_id: string;
  body: string;
  created_at: string;
};

/**
 * Profile information for comment author
 */
export type CommentAuthor = {
  id: string;
  full_name: string | null;
  email: string | null;
};

/**
 * Ticket comment with author information
 * Note: Comments are immutable (no updated_at)
 */
export type TicketComment = {
  id: string;
  ticket_id: string;
  author_profile_id: string;
  body: string;
  created_at: string;
  author: CommentAuthor | null;
};

/**
 * List ticket comments parameters
 */
export type ListTicketCommentsParams = {
  orgId: string;
  ticketId: string;
};

/**
 * Create ticket comment input
 */
export type CreateTicketCommentInput = {
  orgId: string;
  ticketId: string;
  body: string;
};

/**
 * Delete ticket comment input
 */
export type DeleteTicketCommentInput = {
  orgId: string;
  commentId: string;
};

