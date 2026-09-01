"use client";

import React from "react";
import type { TurnRendererProps } from "./types";
import { formatClock } from "../../format";

/**
 * Default turn renderer — a chat bubble that works for any channel (voice transcript turns and
 * chat messages alike). Channels register this by default; a channel wanting a richer
 * presentation registers its own instead (the seam that makes the thread plugin-based).
 *
 * **Inbox v2 restyled it to the messaging convention everyone already knows**: what the customer
 * said is white and on the left, what we said is green and on the right, each with the corner
 * nearest its own side squared off. That is not decoration — side and colour are how a reader
 * tells the two voices apart before reading either, which is the one thing a transcript has to
 * do at a glance. The values are WhatsApp's, and dark mode uses WhatsApp's dark ones, because
 * half-translating a borrowed metaphor reads as a mistake.
 *
 * Presentational only.
 */
/**
 * Make links in a message clickable, and nothing else.
 *
 * Chat channels carry URLs — a product page, a booking link — and a link a customer can see but
 * not open is a dead end in the middle of a conversation. Deliberately the *only* thing rendered
 * from message content: everything else stays plain text, because message bodies come from
 * customers and from the model, and no untrusted string gets to bring markup with it.
 *
 * `http`/`https` only (never `javascript:` or `data:`), opened in a new tab with `noopener`.
 */
const URL_PATTERN = /(https?:\/\/[^\s<>"')]+)/g;

function linkify(text: string): React.ReactNode {
  if (!text || !text.includes("http")) return text;

  return text.split(URL_PATTERN).map((part, i) => {
    if (i % 2 === 0) return part;
    let safe: URL;
    try {
      safe = new URL(part);
    } catch {
      return part;
    }
    if (safe.protocol !== "http:" && safe.protocol !== "https:") return part;
    return (
      <a
        key={i}
        href={safe.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="font-medium underline underline-offset-2"
      >
        {part}
      </a>
    );
  });
}

/**
 * The original, under the words.
 *
 * The AI's description of a photo is already in the bubble text — that is how perception works,
 * and it is what every other reader sees. This renders the file itself as well, because a
 * description is a claim and the owner deciding whether to refund someone needs to be able to
 * check it. An image shows; audio gets a player, since a voice note is short and listening is
 * faster than reading a transcript aloud in your head.
 *
 * A file we could not keep renders as a plain chip rather than a broken image: saying "photo,
 * unavailable" is honest, and an empty frame reads as a bug.
 */
function Attachments({ media }: { media: NonNullable<TurnRendererProps["turn"]["media"]> }) {
  if (media.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {media.map((file, i) => {
        if (file.kind === "image" && file.url) {
          return (
            /* eslint-disable-next-line @next/next/no-img-element --
               a signed, expiring Storage URL cannot go through next/image: the optimiser would
               need the signature to still be valid when IT fetches, and would cache a customer's
               private photo behind a public, unsigned URL. */
            <img
              key={i}
              src={file.url}
              alt={file.filename ?? "Attachment sent by the customer"}
              className="max-h-64 w-auto max-w-full rounded-lg border border-black/5 object-contain"
            />
          );
        }

        if (file.kind === "audio" && file.url) {
          return <audio key={i} src={file.url} controls preload="none" className="w-full max-w-[260px]" />;
        }

        if (file.kind === "video" && file.url) {
          return <video key={i} src={file.url} controls preload="none" className="max-h-64 w-full rounded-lg" />;
        }

        return (
          <a
            key={i}
            href={file.url ?? undefined}
            target={file.url ? "_blank" : undefined}
            rel="noopener noreferrer"
            className={`inline-flex w-fit items-center gap-2 rounded-lg border border-black/10 px-2 py-1 text-xs dark:border-white/15 ${
              file.url ? "underline underline-offset-2" : "opacity-70"
            }`}
          >
            {file.filename ?? file.kind}
            {file.url ? null : <span>· unavailable</span>}
          </a>
        );
      })}
    </div>
  );
}

export default function DefaultTurnRenderer({ turn, showTimestamp = true }: TurnRendererProps) {
  const isEmployee = turn.role === "assistant" || turn.direction === "outbound";
  const isSystem = turn.role === "system";
  const clock = showTimestamp ? formatClock(turn.at) : "";

  if (isSystem) {
    return (
      <div className="my-2 flex justify-center">
        <span className="max-w-[85%] rounded-lg bg-[#FFF5D6] px-3 py-1.5 text-center text-xs text-[#5B5333] shadow-sm dark:bg-[#182229] dark:text-[#8696A0]">
          {turn.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isEmployee ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-lg px-3 py-2 text-sm shadow-sm ${
          isEmployee
            ? "rounded-tr-none bg-[#E6F5EC] text-[#111B21] dark:bg-[#005C4B] dark:text-[#E9EDEF]"
            : "rounded-tl-none bg-white text-[#111B21] dark:bg-[#202C33] dark:text-[#E9EDEF]"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{linkify(turn.content)}</p>
        {turn.media && turn.media.length > 0 ? <Attachments media={turn.media} /> : null}
        {clock ? (
          <p
            className={`mt-1 text-[10px] tabular-nums ${
              isEmployee ? "text-right" : ""
            } text-black/40 dark:text-white/50`}
          >
            {clock}
          </p>
        ) : null}
        {/* Who spoke stays available to a screen reader: colour and side carry it visually, and
            a repeated "AI EMPLOYEE" label above every bubble was the noisiest thing on the page. */}
        <span className="sr-only">{isEmployee ? "Sent by your AI Employee" : "Sent by the customer"}</span>
      </div>
    </div>
  );
}
