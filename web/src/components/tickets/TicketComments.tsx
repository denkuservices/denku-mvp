"use client";

import { useState, useTransition } from "react";
import { createTicketComment, deleteTicketComment } from "@/lib/tickets/comments.actions";
import { useRouter } from "next/navigation";
import { formatDateInTZ, formatTimeAgo } from "@/lib/tickets/utils.client";
import { Trash2 } from "lucide-react";

type TicketComment = {
  id: string;
  author_profile_id: string;
  body: string;
  created_at: string;
  author: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
};

type TicketCommentsProps = {
  ticketId: string;
  orgId: string;
  userId: string;
  comments: TicketComment[];
  timezone: string;
  canMutate: boolean;
  isPaused: boolean;
};

export function TicketComments({
  ticketId,
  orgId,
  userId,
  comments,
  timezone,
  canMutate,
  isPaused,
}: TicketCommentsProps) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || isPaused || isPending) return;

    setError(null);
    startTransition(async () => {
      const result = await createTicketComment(orgId, userId, {
        orgId,
        ticketId,
        body: body.trim(),
      });

      if (result.ok) {
        setBody("");
        setError(null);
        router.refresh();
      } else {
        setError(result.error || "Failed to post note");
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (body.trim() && !isPaused && !isPending) {
        handleSubmit(e as any);
      }
    }
    // Shift+Enter allows newline (default behavior)
  };

  const handleDelete = (commentId: string) => {
    if (!confirm("Are you sure you want to delete this comment?")) return;

    startTransition(async () => {
      const result = await deleteTicketComment(orgId, userId, {
        orgId,
        commentId,
      });

      if (result.ok) {
        router.refresh();
      } else {
        alert(`Failed to delete comment: ${result.error}`);
      }
    });
  };

  const getAuthorName = (author: TicketComment["author"]): string => {
    if (!author) return "Unknown user";
    return author.full_name || author.email || "Unknown user";
  };

  return (
    <div className="rounded-xl border bg-white p-4 space-y-4">
      <p className="text-sm font-medium">Notes</p>

      {/* Comment Form (Owner/Admin only) */}
      {canMutate && (
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setError(null); // Clear error on input
            }}
            onKeyDown={handleKeyDown}
            placeholder={isPaused ? "Workspace is paused. Notes are disabled." : "Add an internal note…"}
            disabled={isPaused || isPending}
            rows={3}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {isPaused ? "Workspace is paused. Changes are disabled." : "Notes are internal and visible to your team."}
            </p>
            <button
              type="submit"
              disabled={!body.trim() || isPaused || isPending}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Posting…" : "Post note"}
            </button>
          </div>
        </form>
      )}

      {/* Comments List */}
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="border-b last:border-b-0 pb-4 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{getAuthorName(comment.author)}</p>
                    <span className="text-xs text-muted-foreground" title={formatDateInTZ(comment.created_at, timezone)}>
                      {formatTimeAgo(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{comment.body}</p>
                </div>
                {canMutate && !isPaused && (
                  <button
                    type="button"
                    onClick={() => handleDelete(comment.id)}
                    disabled={isPending}
                    className="rounded-md border bg-white p-1.5 text-xs text-muted-foreground hover:bg-zinc-50 disabled:opacity-50"
                    title="Delete comment"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

