"use client";

import * as React from "react";
import { Check, Send, Mail, ArrowRight, Loader2 } from "lucide-react";
import { connectTelegramAction } from "@/app/(app)/dashboard/channels/telegram/_actions";
import { connectEmailAction } from "@/app/(app)/dashboard/channels/email/_actions";

/**
 * The last step for a chat-only workspace: connect the channel the AI will answer on.
 *
 * This is deliberately IN the wizard rather than a link out to it. The previous version sent
 * people to a settings page, which was both a dead URL and the wrong shape — a customer who has
 * just paid should be finished by the end of the wizard, not handed a second journey.
 *
 * It is NOT a new step in the machine. The onboarding step numbering is load-bearing (the UI
 * step is the DB step minus one, and the dashboard gate reads DB step >= 6), so this renders
 * inside the existing Live step. Renaming a step is safe; renumbering one is not.
 *
 * Both cards call the SAME server actions the dashboard channel pages use. There is no second
 * connect path to keep in sync — the validation, the encryption, the Telegram webhook
 * registration and the issued forwarding address are all the ones already in production.
 *
 * Neither card is required. Connecting can genuinely wait, and a wizard that traps someone who
 * has already paid until they go and find a bot token is worse than one they can leave.
 */

type Props = {
  /** Channels already connected, so a finished card shows as finished. */
  connected: string[];
  /** The address Denku issued, once email is connected. */
  emailInboundAddress: string | null;
  /** Re-read onboarding state after a successful connection. */
  onConnected: () => void;
  /** Finish onboarding and go to the dashboard. */
  onFinish: () => void;
  finishing?: boolean;
};

const cardClass =
  "flex flex-col rounded-[16px] border border-[#0A1A2F]/10 bg-[#FBFAF8] p-6 text-left";
const inputClass =
  "w-full rounded-[10px] border border-[#0A1A2F]/12 bg-white px-4 py-2.5 text-sm text-[#0A1A2F] placeholder:text-[#6B7888]/60 outline-none transition-colors focus:border-[#1B6E6E] focus:ring-2 focus:ring-[#1B6E6E]/15 disabled:opacity-60";
const connectBtn =
  "mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[#1B6E6E] px-4 text-sm font-medium text-white transition-colors hover:bg-[#228585] disabled:cursor-not-allowed disabled:opacity-60";

function ConnectedBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-[#1B6E6E]/25 bg-[#E3EEED] px-3 py-2.5 text-sm text-[#134F4F]">
      <Check className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function ConnectChannelStep({
  connected,
  emailInboundAddress,
  onConnected,
  onFinish,
  finishing,
}: Props) {
  const [token, setToken] = React.useState("");
  const [forwardFrom, setForwardFrom] = React.useState("");
  const [busy, setBusy] = React.useState<"telegram" | "email" | null>(null);
  const [errors, setErrors] = React.useState<{ telegram?: string; email?: string }>({});

  const telegramDone = connected.includes("telegram");
  const emailDone = connected.includes("email");
  const anyDone = telegramDone || emailDone;

  async function submit(channel: "telegram" | "email") {
    setBusy(channel);
    setErrors((e) => ({ ...e, [channel]: undefined }));
    try {
      const fd = new FormData();
      let result: { ok: boolean; error?: string };
      if (channel === "telegram") {
        fd.set("token", token.trim());
        result = await connectTelegramAction(fd);
      } else {
        fd.set("forward_from_address", forwardFrom.trim());
        result = await connectEmailAction(fd);
      }
      if (result.ok) {
        setToken("");
        onConnected();
      } else {
        setErrors((e) => ({ ...e, [channel]: result.error || "Could not connect. Please try again." }));
      }
    } catch {
      setErrors((e) => ({ ...e, [channel]: "Could not connect. Please try again." }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-7">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#1B6E6E]">
          <Check className="h-7 w-7 text-white" />
        </div>
        <h2 className="mt-5 font-display text-[clamp(26px,3vw,36px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">
          {anyDone ? "Your AI is connected" : "Connect a channel"}
        </h2>
        <p className="mt-3 text-[15px] text-[#2C3E54]">
          {anyDone
            ? "Messages arriving here now reach your AI, and land in your inbox."
            : "Pick where your AI should answer. You can connect the other one later."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* ------------------------------------------------------------ Telegram */}
        <div className={cardClass}>
          <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#E3EEED] text-[#134F4F]">
            <Send className="h-5 w-5" />
          </div>
          <h3 className="mt-4 font-display text-[17px] font-medium text-[#0A1A2F]">Telegram</h3>
          <p className="mt-1.5 flex-1 text-sm leading-relaxed text-[#2C3E54]">
            Your own bot answers your customers. Create one with{" "}
            <span className="font-medium">@BotFather</span> on Telegram and paste the token it
            gives you.
          </p>

          {telegramDone ? (
            <ConnectedBadge>Connected. Message your bot to see it answer.</ConnectedBadge>
          ) : (
            <>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:AAE..."
                autoComplete="off"
                spellCheck={false}
                disabled={busy !== null}
                className={`mt-4 ${inputClass}`}
              />
              {errors.telegram && (
                <p className="mt-2 text-xs text-red-600">{errors.telegram}</p>
              )}
              <button
                type="button"
                onClick={() => submit("telegram")}
                disabled={busy !== null || token.trim().length === 0}
                className={connectBtn}
              >
                {busy === "telegram" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Connect Telegram"
                )}
              </button>
            </>
          )}
        </div>

        {/* --------------------------------------------------------------- Email */}
        <div className={cardClass}>
          <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#E3EEED] text-[#134F4F]">
            <Mail className="h-5 w-5" />
          </div>
          <h3 className="mt-4 font-display text-[17px] font-medium text-[#0A1A2F]">Email</h3>
          <p className="mt-1.5 flex-1 text-sm leading-relaxed text-[#2C3E54]">
            Give us the address customers already write to. We hand you one to forward it to —
            we never ask for your mailbox password.
          </p>

          {emailDone ? (
            <ConnectedBadge>
              Forward your mail to{" "}
              <span className="break-all font-medium">{emailInboundAddress ?? "the address in Channels"}</span>.
            </ConnectedBadge>
          ) : (
            <>
              <input
                type="email"
                value={forwardFrom}
                onChange={(e) => setForwardFrom(e.target.value)}
                placeholder="info@yourcompany.com"
                autoComplete="off"
                spellCheck={false}
                disabled={busy !== null}
                className={`mt-4 ${inputClass}`}
              />
              {errors.email && <p className="mt-2 text-xs text-red-600">{errors.email}</p>}
              <button
                type="button"
                onClick={() => submit("email")}
                disabled={busy !== null || forwardFrom.trim().length === 0}
                className={connectBtn}
              >
                {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect email"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onFinish}
          disabled={finishing}
          className="inline-flex h-11 min-w-[220px] items-center justify-center gap-2 rounded-[10px] bg-[#0A1A2F] px-6 text-sm font-medium text-[#F7F5F1] transition-colors hover:bg-[#1B6E6E] disabled:opacity-60"
        >
          {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <>
              Go to dashboard
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
        {!anyDone && (
          <p className="text-sm text-[#6B7888]">
            You can connect a channel later from Channels in your dashboard.
          </p>
        )}
      </div>
    </div>
  );
}

export default ConnectChannelStep;
