import { CalendarCheck2, Check, MoreHorizontal, Paperclip, Send } from "lucide-react";
import { ChannelIcon } from "./ChannelIcon";

export type ChatPreviewCopy = {
  eyebrow: string;
  online: string;
  visitor: string;
  visitorMessage: string;
  aiMessage: string;
  action: string;
  synced: string;
  typing: string;
  email: string;
};

/**
 * A deliberately product-shaped hero visual: channel rail, conversation, and the
 * business outcome created from it. It communicates the product before the page
 * asks the visitor to read a feature list.
 */
export function ChatProductPreview({ copy }: { copy: ChatPreviewCopy }) {
  return (
    <div className="relative w-full max-w-[560px] lg:translate-x-4">
      <div
        aria-hidden="true"
        className="absolute -inset-10 opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at 72% 22%, rgba(42,171,238,.15), transparent 34%), radial-gradient(circle at 30% 82%, rgba(200,148,104,.16), transparent 38%)",
        }}
      />

      <div className="relative overflow-hidden rounded-[26px] border border-[rgba(247,245,241,.14)] bg-[#0D1818] shadow-[0_32px_90px_rgba(0,0,0,.38)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[.22]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(247,245,241,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(247,245,241,.045) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "linear-gradient(to bottom, black, transparent 72%)",
          }}
        />

        <div className="relative flex items-center justify-between border-b border-[var(--d-border)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="landing-pulse h-1.5 w-1.5 rounded-full bg-[var(--d-success)]" />
            <span className="font-brand-mono text-[9px] uppercase tracking-[.18em] text-[var(--d-success)]">
              {copy.eyebrow}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[var(--d-ink-faint)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--d-success)]" />
            {copy.online}
          </div>
        </div>

        <div className="relative grid min-h-[408px] grid-cols-[58px_1fr] sm:grid-cols-[72px_1fr]">
          <div
            aria-hidden="true"
            className="flex flex-col items-center gap-3 border-r border-[var(--d-border)] px-2 py-5"
          >
            <ChannelIcon channel="telegram" size="sm" />
            <ChannelIcon channel="email" size="sm" muted />
            <ChannelIcon channel="webchat" size="sm" muted />
            <span className="mt-1 h-px w-5 bg-[var(--d-border)]" />
            <ChannelIcon channel="instagram" size="sm" muted />
          </div>

          <div className="flex min-w-0 flex-col">
            <header className="flex items-center justify-between border-b border-[var(--d-border)] px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <ChannelIcon channel="telegram" size="sm" />
                <div className="min-w-0">
                  <div className="truncate font-display text-[16px] font-semibold text-[var(--d-ink)]">
                    Iris
                  </div>
                  <div className="truncate text-[10.5px] text-[var(--d-ink-faint)]">Telegram</div>
                </div>
              </div>
              <MoreHorizontal aria-hidden="true" className="h-4 w-4 text-[var(--d-ink-faint)]" />
            </header>

            <div className="flex flex-1 flex-col gap-3.5 px-4 py-5 sm:px-5">
              <div className="max-w-[83%] self-start">
                <div className="mb-1.5 text-[9px] uppercase tracking-[.12em] text-[var(--d-ink-faint)]">
                  {copy.visitor}
                </div>
                <div className="rounded-[16px] rounded-tl-[4px] border border-[var(--d-border)] bg-[rgba(247,245,241,.055)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--d-ink-soft)]">
                  {copy.visitorMessage}
                </div>
              </div>

              <div className="max-w-[86%] self-end text-right">
                <div className="mb-1.5 text-[9px] uppercase tracking-[.12em] text-[var(--d-teal)]">Iris</div>
                <div className="rounded-[16px] rounded-tr-[4px] border border-[rgba(47,163,154,.20)] bg-[rgba(47,163,154,.10)] px-4 py-3 text-left text-[12.5px] leading-relaxed text-[var(--d-ink)]">
                  {copy.aiMessage}
                </div>
              </div>

              <div className="mt-1 flex items-center gap-3 rounded-[15px] border border-[rgba(127,201,143,.22)] bg-[rgba(127,201,143,.07)] p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[rgba(127,201,143,.12)] text-[var(--d-success)]">
                  <CalendarCheck2 aria-hidden="true" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11.5px] font-medium text-[var(--d-ink)]">{copy.action}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[9.5px] text-[var(--d-success)]">
                    <Check aria-hidden="true" className="h-3 w-3" />
                    {copy.synced}
                  </div>
                </div>
              </div>
            </div>

            <div className="mx-4 mb-4 flex items-center gap-2 rounded-full border border-[var(--d-border)] bg-[rgba(247,245,241,.035)] px-3.5 py-2.5 sm:mx-5">
              <Paperclip aria-hidden="true" className="h-3.5 w-3.5 text-[var(--d-ink-faint)]" />
              <span className="flex-1 text-[10.5px] text-[var(--d-ink-faint)]">{copy.typing}</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--d-copper)] text-[#0A1414]">
                <Send aria-hidden="true" className="h-3 w-3" />
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-full border border-[var(--d-border)] bg-[#111D1D] px-3 py-2 shadow-xl sm:flex">
        <ChannelIcon channel="email" size="sm" />
        <span className="font-brand-mono text-[8.5px] uppercase tracking-[.14em] text-[var(--d-ink-soft)]">
          {copy.email}
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--d-success)]" />
      </div>
    </div>
  );
}

export default ChatProductPreview;
